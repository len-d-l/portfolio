import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { deskProjects } from '../content/projects.ts'
import { createClutter, createDesk, createLamp, createStandin } from './standins.ts'
import { frameObject, slugFromObject, tryLoadDeskScene, tryLoadModel } from './loadModel.ts'

type DeskSceneOptions = {
  canvas: HTMLCanvasElement
  label: HTMLElement
  onSelect: (slug: string) => void
}

const placements: Record<string, { position: [number, number, number]; rotationY?: number }> = {
  piano: { position: [-1.15, 0.07, -0.45], rotationY: 0.12 },
  'low-poly-ships': { position: [1.15, 0.07, -0.5], rotationY: -0.4 },
  'bug-brigade': { position: [0.05, 0.07, 0.15], rotationY: 0.6 },
  spacecrew: { position: [1.35, 0.07, 0.25], rotationY: -0.2 },
  'nightmare-of-xingtian': { position: [-0.55, 0.07, -0.55], rotationY: 0.2 },
  tomfoodery: { position: [-0.35, 0.07, 0.55], rotationY: 0.3 },
  'digital-society-hub': { position: [0.7, 0.07, -0.55], rotationY: 0.15 },
  billboard: { position: [1.85, 0.07, -0.15], rotationY: -0.35 },
  'ui-redesign': { position: [-1.55, 0.07, 0.15], rotationY: 0.5 },
  'unreal-project': { position: [0.55, 0.07, 0.55], rotationY: 0.1 },
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

  sun.position.set(center.x + radius * 0.9, center.y + radius * 1.7, center.z + radius * 1.1)
  sun.target.position.copy(center)
  sun.target.updateMatrixWorld()
  fill.position.set(center.x - radius, center.y + radius * 0.65, center.z - radius * 0.8)

  const shadowCam = sun.shadow.camera
  shadowCam.left = -radius * 1.5
  shadowCam.right = radius * 1.5
  shadowCam.top = radius * 1.5
  shadowCam.bottom = -radius * 1.5
  shadowCam.near = Math.max(radius * 0.05, 0.05)
  shadowCam.far = radius * 8
  shadowCam.updateProjectionMatrix()
  sun.shadow.bias = -0.0008

  scene.fog = new THREE.Fog('#efe4d0', radius * 3.2, radius * 10)
}

export function createDeskScene({ canvas, label, onSelect }: DeskSceneOptions) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.shadowMap.enabled = false
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#efe4d0')
  scene.fog = new THREE.Fog('#efe4d0', 8, 22)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40)
  camera.position.set(2.6, 2.35, 3.7)

  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 2.6
  controls.maxDistance = 6.2
  controls.minPolarAngle = 0.45
  controls.maxPolarAngle = 1.3
  controls.target.set(0, 0.45, 0)

  const hemi = new THREE.HemisphereLight('#fff8ee', '#8a6a52', 2.2)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff4dc', 2.8)
  sun.position.set(3.4, 5.2, 2.2)
  scene.add(sun)
  scene.add(sun.target)
  const fill = new THREE.DirectionalLight('#d7e4f4', 1.1)
  fill.position.set(-4, 2.2, -2.5)
  scene.add(fill)
  scene.add(new THREE.AmbientLight('#efe4d0', 0.85))

  const placeholder = new THREE.Group()
  placeholder.name = 'placeholder-desk'

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 24),
    new THREE.MeshLambertMaterial({ color: '#e7d7be' }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.92
  floor.receiveShadow = true
  placeholder.add(floor)
  placeholder.add(createDesk())

  const lamp = createLamp()
  lamp.position.set(-1.85, 0.07, -0.7)
  placeholder.add(lamp)

  const clutter = createClutter()
  clutter.position.y = 0.07
  placeholder.add(clutter)

  const clickable: THREE.Object3D[] = []

  for (const project of deskProjects()) {
    if (!project.desk) continue
    const standin = createStandin(project.desk)
    const place = placements[project.slug]
    if (place) {
      standin.position.set(...place.position)
      if (place.rotationY) standin.rotation.y = place.rotationY
    }
    placeholder.add(standin)
    clickable.push(standin)

    void tryLoadModel(project.slug).then((model) => {
      if (!model || !placeholder.parent) return
      model.position.copy(standin.position)
      model.rotation.copy(standin.rotation)
      placeholder.remove(standin)
      const index = clickable.indexOf(standin)
      if (index >= 0) clickable.splice(index, 1, model)
      placeholder.add(model)
    })
  }

  scene.add(placeholder)

  void tryLoadDeskScene().then((custom) => {
    if (!custom) return
    scene.remove(placeholder)
    clickable.length = 0
    clickable.push(...custom.clickable)
    scene.add(custom.root)
    frameObject(custom.root, camera, controls)
    fitLighting(custom.root, sun, fill, scene)
  })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hoveredSlug: string | null = null
  let frame = 0
  let pointerDown: { x: number; y: number } | null = null

  function setPointer(event: PointerEvent) {
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
    setPointer(event)
    showLabel(hitSlug(), event)
  }

  function onPointerDown(event: PointerEvent) {
    pointerDown = { x: event.clientX, y: event.clientY }
    canvas.style.cursor = hoveredSlug ? 'pointer' : 'grabbing'
  }

  function onPointerUp(event: PointerEvent) {
    const start = pointerDown
    pointerDown = null
    setPointer(event)
    const slug = hitSlug()
    showLabel(slug, event)
    if (!start || !slug) return
    const dragged = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    if (!dragged) onSelect(slug)
  }

  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }

  function tick() {
    frame = requestAnimationFrame(tick)
    controls.update()
    renderer.render(scene, camera)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointerleave', () => showLabel(null))
  resize()
  tick()

  return {
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
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
