import * as THREE from 'three'
import { deskProjects } from '../content/projects.ts'
import { bayer8, colorDither, imagePalette } from '../dither.ts'
import { tryLoadDeskScene } from '../three/loadModel.ts'

/** Render size; shown at about twice this, pixelated. */
const RES = 64
/** The renders step at this rate for a choppy, PSX feel. */
const FPS = 12
/** Seconds for the dither dissolve in and out. */
const FADE = 0.8
/** Share of each object's colors pulled toward the page's ink-to-paper ramp. */
const PRINT = 0.4
/** Same orange as the desk scene's hover outline. */
const OUTLINE = [186, 48, 8]
const INK = [36, 28, 22]
const PAPER = [239, 228, 208]

type Palette = ReturnType<typeof imagePalette>
type DeskObject = { pivot: THREE.Group; palette?: Palette }
type Spot = {
  element: HTMLElement
  context: CanvasRenderingContext2D
  object: DeskObject
  hover: HTMLElement
  inView: boolean
  hovered: boolean
  shown: number
  glow: number
  spin: number
  tilt: number
  turn: number
  drawn: boolean
}

let pool: Promise<Map<string, DeskObject>> | null = null

/** Every clickable object in the desk scene by project slug, each centered and scaled to a unit box. */
function deskObjects() {
  pool ??= tryLoadDeskScene().then((desk) => {
    const objects = new Map<string, DeskObject>()
    if (!desk) return objects
    const known = new Set(deskProjects().map((project) => project.slug))
    const groups = new Map<string, THREE.Group>()
    for (const mesh of desk.clickable) {
      const slug = mesh.userData.slug
      if (typeof slug !== 'string' || !known.has(slug)) continue
      let group = groups.get(slug)
      if (!group) {
        group = new THREE.Group()
        groups.set(slug, group)
      }
      group.add(mesh.clone())
    }
    for (const [slug, group] of groups) {
      const box = new THREE.Box3().setFromObject(group)
      const size = box.getSize(new THREE.Vector3())
      group.position.copy(box.getCenter(new THREE.Vector3()).negate())
      const pivot = new THREE.Group()
      pivot.add(group)
      pivot.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 0.001))
      objects.set(slug, { pivot })
    }
    return objects
  })
  return pool
}

let stage: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null

function getStage() {
  if (stage) return stage
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
  renderer.setPixelRatio(1)
  renderer.setSize(RES, RES, false)
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x6b5442, 2.2))
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6)
  sun.position.set(2, 3, 2.5)
  scene.add(sun)
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20)
  camera.position.set(0, 1.25, 2.55)
  camera.lookAt(0, 0, 0)
  stage = { renderer, scene, camera }
  return stage
}

/** The object's own colors, each pulled part way to the ink-to-paper tone of the same brightness, so it reads as printed. */
function printedPalette(data: ImageData): Palette {
  return imagePalette(data).map((color) => {
    const t = Math.min(1, Math.max(0, (color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114) / 255))
    return color.map((value, channel) => {
      const tone = INK[channel] + (PAPER[channel] - INK[channel]) * t
      return value + (tone - value) * PRINT
    }) as Palette[number]
  })
}

function draw(spot: Spot, still: boolean) {
  const { renderer, scene, camera } = getStage()
  const { pivot } = spot.object
  const time = still ? 0 : Math.floor(spot.spin * FPS) / FPS
  pivot.rotation.set(0.1 + Math.sin(time * 0.5) * 0.08, spot.tilt + time * spot.turn, Math.sin(time * 0.37) * 0.05)
  scene.add(pivot)
  renderer.render(scene, camera)
  scene.remove(pivot)
  const { context } = spot
  context.clearRect(0, 0, RES, RES)
  context.drawImage(renderer.domElement, 0, 0)
  const data = context.getImageData(0, 0, RES, RES)
  spot.object.palette ??= printedPalette(data)
  colorDither(data, spot.object.palette)
  const pixels = data.data
  const cut = spot.shown * 64
  if (cut < 64) {
    for (let y = 0; y < RES; y += 1) {
      for (let x = 0; x < RES; x += 1) if (bayer8(x, y) >= cut) pixels[(y * RES + x) * 4 + 3] = 0
    }
  }
  const ring = spot.glow * spot.shown * 64
  if (ring > 0) {
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < RES && y < RES && pixels[(y * RES + x) * 4 + 3] > 0
    const edge: number[] = []
    for (let y = 0; y < RES; y += 1) {
      for (let x = 0; x < RES; x += 1) {
        if (solid(x, y) || bayer8(x, y) >= ring) continue
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.push((y * RES + x) * 4)
      }
    }
    for (const at of edge) {
      pixels[at] = OUTLINE[0]
      pixels[at + 1] = OUTLINE[1]
      pixels[at + 2] = OUTLINE[2]
      pixels[at + 3] = 255
    }
  }
  context.putImageData(data, 0, 0)
}

/**
 * Fills each `.desk-object[data-slug]` under `root` with that project's object from the desk scene, slowly turning.
 * It dissolves in when its spot scrolls into view and out when it leaves; hovering the nearest `hoverSelector`
 * ancestor brings up the desk's orange outline.
 */
export function mountDeskObjects(root: HTMLElement, hoverSelector = '.work-card') {
  const elements = [...root.querySelectorAll<HTMLElement>('.desk-object[data-slug]')]
  const roomy = window.matchMedia('(min-width: 721px)')
  if (!elements.length || !roomy.matches) return () => {}
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let spots: Spot[] = []
  let frame = 0
  let last = 0
  let lastDraw = 0
  let stopped = false
  const cleanups: (() => void)[] = []

  const tick = (time: number) => {
    frame = 0
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 0.016
    last = time
    const redraw = time - lastDraw >= 1000 / FPS
    if (redraw) lastDraw = time
    let busy = false
    for (const spot of spots) {
      const goal = spot.inView ? 1 : 0
      const lit = spot.hovered && spot.inView ? 1 : 0
      spot.shown = still ? goal : goal > spot.shown ? Math.min(1, spot.shown + dt / FADE) : Math.max(0, spot.shown - dt / FADE)
      spot.glow = still ? lit : lit > spot.glow ? Math.min(1, spot.glow + dt / 0.45) : Math.max(0, spot.glow - dt / 0.35)
      spot.element.classList.toggle('is-in', spot.inView)
      if (spot.shown === 0 && !spot.inView) {
        if (spot.drawn) {
          spot.context.clearRect(0, 0, RES, RES)
          spot.drawn = false
        }
        continue
      }
      busy = true
      if (!still) spot.spin += dt * (spot.hovered ? 2.4 : 1)
      if (redraw || !spot.drawn) {
        draw(spot, still)
        spot.drawn = true
      }
    }
    if (busy && !document.hidden) wake()
  }

  const wake = () => {
    if (!frame && !stopped) frame = requestAnimationFrame(tick)
  }

  // Pictures reveal once a slice of the card is on screen. The model used to wait until half of its
  // own tiny box was inside a shorter viewport, so it arrived late and left while the title was still up.
  // The top exit stays: once the model's midpoint crosses the top of the window, it goes.
  const modelVisible = (element: HTMLElement) => {
    const box = element.getBoundingClientRect()
    if (box.height === 0) return false
    const vh = window.innerHeight
    if (box.top + box.height * 0.5 < 0) return false
    const card = element.closest('.work-card')
    if (card) {
      const cardBox = card.getBoundingClientRect()
      if (cardBox.height) {
        const shown = Math.min(cardBox.bottom, vh * 0.94) - Math.max(cardBox.top, 0)
        if (shown / cardBox.height >= 0.12) return true
      }
    }
    return box.bottom > 0 && box.top < vh
  }

  const place = () => {
    let changed = false
    for (const spot of spots) {
      const next = modelVisible(spot.element)
      if (next === spot.inView) continue
      spot.inView = next
      changed = true
    }
    if (changed) {
      last = 0
      wake()
    }
  }
  window.addEventListener('scroll', place, { passive: true })
  window.addEventListener('resize', place)
  cleanups.push(() => {
    window.removeEventListener('scroll', place)
    window.removeEventListener('resize', place)
  })

  const start = async () => {
    if (!pool) await new Promise((resolve) => window.setTimeout(resolve, 500))
    if (stopped) return
    const objects = await deskObjects()
    if (stopped) return
    spots = elements.flatMap((element, index) => {
      const object = objects.get(element.dataset.slug ?? '')
      if (!object) {
        element.classList.add('is-missing')
        return []
      }
      const canvas = document.createElement('canvas')
      canvas.width = RES
      canvas.height = RES
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return []
      element.replaceChildren(canvas)
      const hover = element.closest<HTMLElement>(hoverSelector) ?? element
      const spot: Spot = {
        element,
        context,
        object,
        hover,
        inView: false,
        hovered: false,
        shown: 0,
        glow: 0,
        spin: 0,
        tilt: -0.6 + index * 1.3,
        turn: (index % 2 ? -1 : 1) * 0.32,
        drawn: false,
      }
      const enter = () => {
        spot.hovered = true
        wake()
      }
      const leave = () => {
        spot.hovered = false
        wake()
      }
      hover.addEventListener('pointerenter', enter)
      hover.addEventListener('pointerleave', leave)
      hover.addEventListener('focus', enter)
      hover.addEventListener('blur', leave)
      cleanups.push(() => {
        hover.removeEventListener('pointerenter', enter)
        hover.removeEventListener('pointerleave', leave)
        hover.removeEventListener('focus', enter)
        hover.removeEventListener('blur', leave)
      })
      return [spot]
    })
  }

  void start().then(() => {
    if (!stopped) place()
  })

  return () => {
    stopped = true
    cancelAnimationFrame(frame)
    cleanups.forEach((stop) => stop())
  }
}
