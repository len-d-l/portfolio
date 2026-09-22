import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { deskProjects } from '../content/projects.ts'
import { frameObject, slugFromObject, tryLoadDeskScene } from './loadModel.ts'
import { applyShadowDither, setNearFade } from './psx.ts'

/** 1 = current. Higher = brighter. Try 1.2–1.6 if the piano feels too dark. */
const SCENE_BRIGHTNESS = 2.5

/** 1 = sharp. 2–4 = pixelated. Higher = chunkier pixels. */
const PIXEL_SIZE = 2

/** Seconds for the click-to-page zoom. Lower = faster. Try 0.35–0.7. */
const ZOOM_DURATION = 0.52

/** Seconds between the highest and lowest objects. Lower = closer together. Try 0.2–0.45. */
const INTRO_HEIGHT_SPAN = 0.28

/** Extra seconds left-to-right so same-height objects don't land together. */
const INTRO_SIDE_SPAN = 0.16

/** How long each object takes to rise. */
const INTRO_MOVE = 1.05

/** Yaw of the desk. Y is up. -90° turns it to the right. */
const MODEL_YAW = -Math.PI / 2

type DeskSceneOptions = {
  canvas: HTMLCanvasElement
  label: HTMLElement
  wipe?: HTMLElement
  onSelect: (slug: string) => void
}

function fitLighting(
  object: THREE.Object3D,
  sun: THREE.DirectionalLight,
  fill: THREE.DirectionalLight,
  scene: THREE.Scene,
) {
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.length() * 0.5, 1)

  // Ceiling fixture: mostly above, slight offset so it still reads as a room light.
  const sunOffset = new THREE.Vector3(0.32, 2.45, 0.38).multiplyScalar(radius)
  sun.position.copy(center).add(sunOffset)
  sun.target.position.copy(center)
  sun.target.updateMatrixWorld()
  fill.position.set(center.x - radius * 0.9, center.y + radius * 0.55, center.z - radius * 0.7)

  const shadowCam = sun.shadow.camera
  const extent = radius * 1.55
  const sunDist = sunOffset.length()
  shadowCam.left = -extent
  shadowCam.right = extent
  shadowCam.top = extent
  shadowCam.bottom = -extent
  shadowCam.near = Math.max(sunDist * 0.18, 0.4)
  shadowCam.far = sunDist + radius * 2.2
  shadowCam.updateProjectionMatrix()
  sun.shadow.mapSize.set(512, 512)
  sun.shadow.radius = 7
  sun.shadow.bias = -0.0012
  sun.shadow.normalBias = 0.03

  scene.fog = new THREE.Fog('#efe4d0', radius * 3.2, radius * 10)
}

function addPaperFloor(object: THREE.Object3D, scene: THREE.Scene) {
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.z, size.y) * 8
  const paperShadow = new THREE.ShadowMaterial({
    color: '#241c16',
    opacity: 0.5,
    fog: false,
  })
  applyShadowDither(paperShadow)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span), paperShadow)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(center.x, box.min.y + 0.004, center.z)
  floor.castShadow = false
  floor.receiveShadow = true
  floor.renderOrder = -1
  scene.add(floor)
  return floor
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

function easeInCubic(t: number) {
  return t * t * t
}

export function createDeskScene({ canvas, label, wipe, onSelect }: DeskSceneOptions) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: PIXEL_SIZE <= 1,
    alpha: false,
  })
  renderer.setPixelRatio(1)
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#efe4d0')
  scene.fog = new THREE.Fog('#efe4d0', 8, 22)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40)
  camera.position.set(2.6, 2.35, 3.7)

  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = true
  controls.screenSpacePanning = true
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 2.6
  controls.maxDistance = 6.2
  controls.minPolarAngle = 0.45
  controls.maxPolarAngle = 1.3
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
  controls.touches.ONE = THREE.TOUCH.ROTATE
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  controls.target.set(0, 0.45, 0)

  const panBox = new THREE.Box3(
    new THREE.Vector3(-1.2, -0.4, -1.2),
    new THREE.Vector3(1.2, 1.2, 1.2),
  )
  const panOffset = new THREE.Vector3()

  function setPanLimits(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    panBox.min.set(
      center.x - size.x * 0.28,
      center.y - size.y * 0.12,
      center.z - size.z * 0.28,
    )
    panBox.max.set(
      center.x + size.x * 0.28,
      center.y + size.y * 0.18,
      center.z + size.z * 0.28,
    )
  }

  function clampPan() {
    panOffset.copy(camera.position).sub(controls.target)
    controls.target.clamp(panBox.min, panBox.max)
    camera.position.copy(controls.target).add(panOffset)
  }

  const hemi = new THREE.HemisphereLight('#fff4e4', '#7a5a40', 0.34 * SCENE_BRIGHTNESS)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff7ea', 1.85 * SCENE_BRIGHTNESS)
  sun.position.set(3.4, 5.2, 2.2)
  sun.castShadow = true
  scene.add(sun)
  scene.add(sun.target)
  const fill = new THREE.DirectionalLight('#c9d6e8', 0.08 * SCENE_BRIGHTNESS)
  fill.position.set(-4, 2.2, -2.5)
  scene.add(fill)

  const clickable: THREE.Object3D[] = []
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const introItems: Array<{ mesh: THREE.Mesh; delay: number }> = []
  let lastTime = performance.now()
  let introElapsed = 0
  let introPlaying = false
  let introLift = 2
  let zoom: {
    slug: string
    elapsed: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    fromFov: number
    wiped: boolean
  } | null = null

  function startIntro(root: THREE.Object3D, radius: number) {
    if (reduceMotion) return
    const meshes: THREE.Mesh[] = []
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child)
    })

    const groups = new Map<string, { meshes: THREE.Mesh[]; box: THREE.Box3 }>()
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox()
      const key =
        typeof mesh.userData.introGroup === 'string' ? mesh.userData.introGroup : mesh.uuid
      const box = mesh.geometry.boundingBox
      const group = groups.get(key) ?? { meshes: [], box: new THREE.Box3() }
      group.meshes.push(mesh)
      if (box) group.box.union(box)
      groups.set(key, group)
    }

    const center = new THREE.Vector3()
    const scored: Array<{ meshes: THREE.Mesh[]; score: number; x: number }> = []
    let minScore = Infinity
    let maxScore = -Infinity
    let minX = Infinity
    let maxX = -Infinity
    let maxHeight = 0
    for (const group of groups.values()) {
      if (group.box.isEmpty()) continue
      group.box.getCenter(center)
      const score = group.box.min.y * 0.45 + center.y * 0.55
      scored.push({ meshes: group.meshes, score, x: center.x })
      minScore = Math.min(minScore, score)
      maxScore = Math.max(maxScore, score)
      minX = Math.min(minX, center.x)
      maxX = Math.max(maxX, center.x)
      maxHeight = Math.max(maxHeight, group.box.max.y - group.box.min.y)
    }

    const scoreSpan = Math.max(maxScore - minScore, 0.001)
    const xSpan = Math.max(maxX - minX, 0.001)
    introLift = radius * 2.4 + maxHeight * 1.35
    introItems.length = 0
    for (const group of scored) {
      const heightT = (maxScore - group.score) / scoreSpan
      const sideT = (group.x - minX) / xSpan
      const delay = heightT * INTRO_HEIGHT_SPAN + sideT * INTRO_SIDE_SPAN
      for (const mesh of group.meshes) {
        introItems.push({ mesh, delay })
        mesh.position.y = -introLift
        mesh.visible = false
      }
    }
    introElapsed = 0
    introPlaying = true
    lastTime = performance.now()
  }

  function startZoom(slug: string) {
    if (zoom) return
    if (reduceMotion) {
      onSelect(slug)
      return
    }
    const object = clickable.find((item) => slugFromObject(item) === slug)
    if (!object) {
      onSelect(slug)
      return
    }
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const fromPos = camera.position.clone()
    const fromTarget = controls.target.clone()
    zoom = {
      slug,
      elapsed: 0,
      fromPos,
      toPos: fromPos.clone().lerp(center, 0.88),
      fromTarget,
      toTarget: center,
      fromFov: camera.fov,
      wiped: false,
    }
    controls.enabled = false
    label.hidden = true
    canvas.style.cursor = 'grab'
    canvas.closest('.home')?.classList.add('is-zooming')
  }

  void tryLoadDeskScene().then((custom) => {
    const home = canvas.closest('.home')
    if (!custom) {
      home?.classList.add('is-live')
      return
    }
    clickable.length = 0
    clickable.push(...custom.clickable)
    custom.root.rotation.y = MODEL_YAW
    scene.add(custom.root)
    frameObject(custom.root, camera, controls)
    fitLighting(custom.root, sun, fill, scene)
    addPaperFloor(custom.root, scene)
    setPanLimits(custom.root)
    const size = new THREE.Box3().setFromObject(custom.root).getSize(new THREE.Vector3())
    const radius = Math.max(size.length() * 0.5, 1)
    setNearFade(radius)
    startIntro(custom.root, radius)
    home?.classList.add('is-live')
  })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hoveredSlug: string | null = null
  let frame = 0
  let pointerDown: { x: number; y: number } | null = null

  function setPointer(event: { clientX: number; clientY: number }) {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  function hitSlug(): string | null {
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(clickable, true)
    return hits[0] ? slugFromObject(hits[0].object) : null
  }

  function showLabel(slug: string | null, event?: PointerEvent) {
    hoveredSlug = slug
    canvas.style.cursor = slug ? 'pointer' : 'grab'
    if (!slug || !event) {
      label.hidden = true
      return
    }
    const project = deskProjects().find((item) => item.slug === slug)
    label.hidden = false
    label.textContent = project?.title ?? slug
    label.style.left = `${event.clientX + 14}px`
    label.style.top = `${event.clientY + 14}px`
  }

  function onPointerMove(event: PointerEvent) {
    if (zoom) return
    setPointer(event)
    showLabel(hitSlug(), event)
  }

  function onPointerDown(event: PointerEvent) {
    if (zoom) return
    if (event.button === 2) {
      canvas.style.cursor = 'move'
      return
    }
    pointerDown = { x: event.clientX, y: event.clientY }
    canvas.style.cursor = hoveredSlug ? 'pointer' : 'grabbing'
  }

  function onPointerUp(event: PointerEvent) {
    if (zoom) return
    if (event.button === 2) {
      canvas.style.cursor = hoveredSlug ? 'pointer' : 'grab'
      return
    }
    const start = pointerDown
    pointerDown = null
    setPointer(event)
    const slug = hitSlug()
    showLabel(slug, event)
    if (!start || !slug) return
    const dragged = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    if (!dragged) startZoom(slug)
  }

  function onContextMenu(event: Event) {
    event.preventDefault()
  }

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    const pixel = Math.max(1, PIXEL_SIZE)
    renderer.setSize(Math.max(1, Math.floor(width / pixel)), Math.max(1, Math.floor(height / pixel)), false)
  }

  function tick() {
    frame = requestAnimationFrame(tick)
    const now = performance.now()
    const dt = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now

    if (introPlaying) {
      introElapsed += dt
      let done = true
      for (const item of introItems) {
        const local = introElapsed - item.delay
        if (local < 0) {
          item.mesh.visible = false
          item.mesh.position.y = -introLift
          done = false
          continue
        }
        const t = Math.min(1, local / INTRO_MOVE)
        if (t < 1) done = false
        item.mesh.visible = t > 0.1
        item.mesh.position.y = (1 - easeOutCubic(t)) * -introLift
      }
      if (done) {
        introPlaying = false
        for (const item of introItems) item.mesh.visible = true
      }
    }

    if (zoom) {
      zoom.elapsed += dt
      const u = easeInCubic(Math.min(1, zoom.elapsed / ZOOM_DURATION))
      camera.position.lerpVectors(zoom.fromPos, zoom.toPos, u)
      controls.target.lerpVectors(zoom.fromTarget, zoom.toTarget, u)
      camera.fov = zoom.fromFov + (22 - zoom.fromFov) * u
      camera.updateProjectionMatrix()
      if (!zoom.wiped && zoom.elapsed > ZOOM_DURATION * 0.4) {
        zoom.wiped = true
        wipe?.classList.add('is-on')
      }
      if (zoom.elapsed >= ZOOM_DURATION + 0.06) {
        const { slug } = zoom
        zoom = null
        onSelect(slug)
        return
      }
    } else {
      controls.update()
      clampPan()
    }

    renderer.render(scene, camera)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointerleave', () => showLabel(null))
  canvas.addEventListener('contextmenu', onContextMenu)
  resize()
  tick()

  return {
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('contextmenu', onContextMenu)
      controls.dispose()
      renderer.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const { material } = object
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material.dispose()
        }
      })
    },
  }
}
