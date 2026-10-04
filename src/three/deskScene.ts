import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { deskProjects } from '../content/projects.ts'
import { frameObject, slugFromObject, tryLoadDeskScene } from './loadModel.ts'
import { applyShadowDither, nearFade, PSX_SCREEN_RES, setNearFade } from './psx.ts'

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

/** Bulbs on the DSH sign. Tweak these and reload to test the spill. */
const SIGN_BULB_COLOR = '#ffc71b'
/** Smaller splits the sign into more lights, so separate bulbs stay visible. 0.1 is about six. */
const SIGN_BULB_CLUSTER = 0.1
/** How far the spill reaches, in scene units. */
const SIGN_BULB_REACH = 0.26
/** Brightness of each sign light. Raise it for a stronger pool on nearby objects. */
const SIGN_BULB_INTENSITY = 0.05
/** How far the light sits off the letters. Closer makes the bulbs themselves hotter. */
const SIGN_BULB_LIFT = 0.09

function signBulbSpots(geometry: THREE.BufferGeometry, materialIndex: number, clusterRadius: number) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const index = geometry.index
  const group = geometry.groups.find((item) => item.materialIndex === materialIndex)
  const start = group?.start ?? 0
  const count = group?.count ?? (index ? index.count : position.count)
  const clusters: {
    seed: THREE.Vector3
    position: THREE.Vector3
    normal: THREE.Vector3
    count: number
  }[] = []
  const vertex = new THREE.Vector3()
  const vertexNormal = new THREE.Vector3()
  const seen = new Set<number>()
  const radiusSq = clusterRadius * clusterRadius

  for (let i = start; i < start + count; i++) {
    const vertexIndex = index ? index.getX(i) : i
    if (seen.has(vertexIndex)) continue
    seen.add(vertexIndex)
    vertex.fromBufferAttribute(position, vertexIndex)
    if (normal) vertexNormal.fromBufferAttribute(normal, vertexIndex)
    else vertexNormal.set(0, 1, 0)
    const cluster = clusters.find((item) => item.seed.distanceToSquared(vertex) < radiusSq)
    if (!cluster) {
      clusters.push({
        seed: vertex.clone(),
        position: vertex.clone(),
        normal: vertexNormal.clone(),
        count: 1,
      })
      continue
    }
    cluster.position.add(vertex)
    cluster.normal.add(vertexNormal)
    cluster.count += 1
  }

  return clusters.map((cluster) => ({
    position: cluster.position.multiplyScalar(1 / cluster.count),
    normal: cluster.normal.multiplyScalar(1 / cluster.count),
  }))
}

function addSignBulbLights(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const materialIndex = materials.findIndex((material) => material.name === 'Lights')
    if (materialIndex < 0) return
    for (const spot of signBulbSpots(child.geometry, materialIndex, SIGN_BULB_CLUSTER)) {
      const light = new THREE.PointLight(SIGN_BULB_COLOR, SIGN_BULB_INTENSITY, SIGN_BULB_REACH, 2)
      light.castShadow = false
      light.position.copy(spot.position)
      if (spot.normal.lengthSq() > 0.0001) {
        light.position.addScaledVector(spot.normal.normalize(), SIGN_BULB_LIFT)
      }
      child.add(light)
    }
  })
}

/** Fans inside the PC. Tweak these and reload to test the glow and the interior spill. */
const FAN_LIGHT_CLUSTER = 0.12
/** How far the spill reaches, in scene units. Short enough to stay mostly inside the case. */
const FAN_LIGHT_REACH = 0.32
/** Brightness of each fan light. Raise it if the inside of the case stays too dark. */
const FAN_LIGHT_INTENSITY = 0.15
/** How far the light sits off the fan. Keep this small so it stays inside the case. */
const FAN_LIGHT_LIFT = 0.02
/** Glow of the fan surface itself. The file has no emission strength, so this stands in for it. */
const FAN_EMISSIVE_STRENGTH = 4

function addFanLights(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const materialIndex = materials.findIndex((material) => material.name.replace(/\.\d+$/, '') === 'Fans')
    if (materialIndex < 0) return
    const material = materials[materialIndex]
    const color = new THREE.Color('#ff4040')
    if (material instanceof THREE.MeshLambertMaterial) {
      material.emissiveIntensity = Math.max(material.emissiveIntensity, FAN_EMISSIVE_STRENGTH)
      if (material.emissive.r + material.emissive.g + material.emissive.b > 0.001) {
        color.copy(material.emissive)
      }
    }
    for (const spot of signBulbSpots(child.geometry, materialIndex, FAN_LIGHT_CLUSTER)) {
      const light = new THREE.PointLight(color, FAN_LIGHT_INTENSITY, FAN_LIGHT_REACH, 2)
      light.castShadow = false
      light.position.copy(spot.position)
      if (spot.normal.lengthSq() > 0.0001) {
        light.position.addScaledVector(spot.normal.normalize(), FAN_LIGHT_LIFT)
      }
      child.add(light)
    }
  })
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

  const sceneDepth = new THREE.DepthTexture(1, 1)
  sceneDepth.generateMipmaps = false
  const maskDepth = new THREE.DepthTexture(1, 1)
  maskDepth.generateMipmaps = false
  const depthTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.FloatType,
    depthTexture: sceneDepth,
  })
  depthTarget.texture.minFilter = THREE.NearestFilter
  depthTarget.texture.magFilter = THREE.NearestFilter
  depthTarget.texture.generateMipmaps = false
  depthTarget.texture.colorSpace = THREE.NoColorSpace
  const maskTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.FloatType,
    depthTexture: maskDepth,
  })
  maskTarget.texture.minFilter = THREE.NearestFilter
  maskTarget.texture.magFilter = THREE.NearestFilter
  maskTarget.texture.generateMipmaps = false
  maskTarget.texture.colorSpace = THREE.NoColorSpace
  const snapUniforms = {
    uPsxRes: { value: PSX_SCREEN_RES },
    uNearFadeStart: nearFade.start,
    uNearFadeEnd: nearFade.end,
  }
  const snapVertex = `
    uniform float uPsxRes;
    uniform float uNearFadeStart;
    uniform float uNearFadeEnd;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      float viewZ = -mvPosition.z;
      if (viewZ <= 0.0) {
        mvPosition.z = -uNearFadeEnd;
      } else if (viewZ < uNearFadeEnd) {
        mvPosition.xyz *= uNearFadeEnd / viewZ;
      }
      gl_Position = projectionMatrix * mvPosition;
      vec3 ndc = gl_Position.xyz / max(gl_Position.w, 1e-6);
      float snapMix = smoothstep(uNearFadeEnd, uNearFadeStart, length(mvPosition.xyz));
      vec2 snapped = floor(ndc.xy * uPsxRes + 0.5) / uPsxRes;
      ndc.xy = mix(ndc.xy, snapped, snapMix);
      gl_Position.xyz = ndc * gl_Position.w;
    }
  `
  const depthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...snapUniforms,
      uKeep: { value: 1 },
    },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
    vertexShader: snapVertex,
    fragmentShader: `
      uniform float uKeep;
      void main() {
        if (uKeep < 0.5) discard;
        gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
      }
    `,
  })
  const maskMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...snapUniforms,
      uId: { value: 0 },
    },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
    vertexShader: snapVertex,
    fragmentShader: `
      uniform float uId;

      void main() {
        gl_FragColor = vec4(uId, gl_FragCoord.z, 0.0, 1.0);
      }
    `,
  })
  const outlineMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tMask: { value: maskTarget.texture },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uIdA: { value: 0 },
      uMixA: { value: 0 },
      uIdB: { value: 0 },
      uMixB: { value: 0 },
      uFade: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tMask;
      uniform vec2 uTexel;
      uniform float uIdA;
      uniform float uMixA;
      uniform float uIdB;
      uniform float uMixB;
      uniform float uFade;
      varying vec2 vUv;

      float idAt(vec2 offset) {
        return texture2D(tMask, vUv + offset).r;
      }

      void take(vec2 offset, float dist, inout float id, inout float objectZ, inout float found) {
        if (found > 0.0) return;
        vec4 maskTex = texture2D(tMask, vUv + offset);
        if (maskTex.r < 0.5) return;
        vec4 centerTex = texture2D(tMask, vUv);
        if (centerTex.r > 0.5) {
          if (abs(maskTex.r - centerTex.r) < 0.5) return;
          if (maskTex.g >= centerTex.g) return;
        }
        id = maskTex.r;
        objectZ = maskTex.g;
        found = dist;
      }

      float hoverMix(float id) {
        float amount = 0.0;
        if (abs(id - uIdA) < 0.5) amount = max(amount, uMixA);
        if (abs(id - uIdB) < 0.5) amount = max(amount, uMixB);
        return amount;
      }

      float nearestId(vec2 dir) {
        float a = idAt(dir);
        if (a > 0.5) return a;
        return idAt(dir * 2.0);
      }

      bool sameObj(float a, float b) {
        return a > 0.5 && abs(a - b) < 0.5;
      }

      void main() {
        float centerId = idAt(vec2(0.0));
        float left = nearestId(vec2(-uTexel.x, 0.0));
        float right = nearestId(vec2(uTexel.x, 0.0));
        float up = nearestId(vec2(0.0, uTexel.y));
        float down = nearestId(vec2(0.0, -uTexel.y));
        if (max(max(left, right), max(up, down)) < 0.5) {
          float diagonal = max(
            max(idAt(vec2(-uTexel.x, -uTexel.y)), idAt(vec2(uTexel.x, -uTexel.y))),
            max(idAt(vec2(-uTexel.x, uTexel.y)), idAt(vec2(uTexel.x, uTexel.y)))
          );
          if (diagonal < 0.5 && max(uMixA, uMixB) < 0.08) discard;
        }
        if (centerId < 0.5 && (sameObj(left, right) || sameObj(up, down))) discard;

        float id = 0.0;
        float objectZ = 1.0;
        float found = 0.0;
        take(vec2(-uTexel.x, 0.0), 1.0, id, objectZ, found);
        take(vec2(uTexel.x, 0.0), 1.0, id, objectZ, found);
        take(vec2(0.0, uTexel.y), 1.0, id, objectZ, found);
        take(vec2(0.0, -uTexel.y), 1.0, id, objectZ, found);
        take(vec2(-uTexel.x, -uTexel.y), 1.4, id, objectZ, found);
        take(vec2(uTexel.x, -uTexel.y), 1.4, id, objectZ, found);
        take(vec2(-uTexel.x, uTexel.y), 1.4, id, objectZ, found);
        take(vec2(uTexel.x, uTexel.y), 1.4, id, objectZ, found);
        take(vec2(-uTexel.x * 2.0, 0.0), 2.0, id, objectZ, found);
        take(vec2(uTexel.x * 2.0, 0.0), 2.0, id, objectZ, found);
        take(vec2(0.0, uTexel.y * 2.0), 2.0, id, objectZ, found);
        take(vec2(0.0, -uTexel.y * 2.0), 2.0, id, objectZ, found);
        if (max(uMixA, uMixB) > 0.08) {
          take(vec2(-uTexel.x * 3.0, 0.0), 3.0, id, objectZ, found);
          take(vec2(uTexel.x * 3.0, 0.0), 3.0, id, objectZ, found);
          take(vec2(0.0, uTexel.y * 3.0), 3.0, id, objectZ, found);
          take(vec2(0.0, -uTexel.y * 3.0), 3.0, id, objectZ, found);
          take(vec2(-uTexel.x * 2.0, -uTexel.y * 2.0), 2.8, id, objectZ, found);
          take(vec2(uTexel.x * 2.0, -uTexel.y * 2.0), 2.8, id, objectZ, found);
          take(vec2(-uTexel.x * 2.0, uTexel.y * 2.0), 2.8, id, objectZ, found);
          take(vec2(uTexel.x * 2.0, uTexel.y * 2.0), 2.8, id, objectZ, found);
        }
        if (id < 0.5 || objectZ < 0.0) discard;
        float amount = hoverMix(id);
        if (found > 2.0 + amount * 1.85) discard;

        vec3 idle = vec3(1.0, 0.98, 0.95);
        vec3 hot = vec3(0.73, 0.19, 0.03);
        gl_FragColor = vec4(mix(idle, hot, amount), mix(0.68, 1.0, amount) * uFade);
        #include <colorspace_fragment>
      }
    `,
  })
  const outlineScene = new THREE.Scene()
  const outlineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const outlineQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMaterial)
  outlineQuad.frustumCulled = false
  outlineScene.add(outlineQuad)
  const maskClear = new THREE.Color('#000000')
  const farClear = new THREE.Color('#ffffff')
  const savedClear = new THREE.Color()

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
  controls.zoomToCursor = true
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
      center.y + size.y * 0.42,
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
  let outlineFade = reduceMotion ? 1 : 0
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
    outlineFade = 0
    sun.shadow.intensity = 0
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
    const focus = pointerHit()?.point.clone() ?? new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())
    const fromPos = camera.position.clone()
    const fromTarget = controls.target.clone()
    zoom = {
      slug,
      elapsed: 0,
      fromPos,
      toPos: fromPos.clone().lerp(focus, 0.88),
      fromTarget,
      toTarget: focus,
      fromFov: camera.fov,
      wiped: false,
    }
    controls.enabled = false
    label.hidden = true
    canvas.style.cursor = 'grab'
    canvas.closest('.home')?.classList.add('is-zooming')
  }

  void tryLoadDeskScene().then(async (custom) => {
    const home = canvas.closest('.home')
    if (!custom) {
      home?.classList.add('is-live')
      return
    }
    clickable.length = 0
    clickable.push(...custom.clickable)
    custom.root.rotation.y = MODEL_YAW
    addSignBulbLights(custom.root)
    addFanLights(custom.root)
    custom.root.visible = false
    scene.add(custom.root)
    frameObject(custom.root, camera, controls)
    fitLighting(custom.root, sun, fill, scene)
    addPaperFloor(custom.root, scene)
    setPanLimits(custom.root)
    const size = new THREE.Box3().setFromObject(custom.root).getSize(new THREE.Vector3())
    const radius = Math.max(size.length() * 0.5, 1)
    setNearFade(radius)
    await renderer.compileAsync(scene, camera)
    custom.root.visible = true
    warmGpu()
    startIntro(custom.root, radius)
    assignOutlineIds()
    home?.classList.add('is-live')
  })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hoveredSlug: string | null = null
  const outlineIdBySlug = new Map<string, number>()
  let frame = 0
  let pointerDown: { x: number; y: number } | null = null

  function setPointer(event: { clientX: number; clientY: number }) {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  function pointerHit() {
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObjects(clickable, true)[0] ?? null
  }

  function hitSlug(): string | null {
    const hit = pointerHit()
    return hit ? slugFromObject(hit.object) : null
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
    const bufferWidth = renderer.domElement.width
    const bufferHeight = renderer.domElement.height
    const targetWidth = Math.max(1, bufferWidth)
    const targetHeight = Math.max(1, bufferHeight)
    resizeTarget(depthTarget, targetWidth, targetHeight)
    resizeTarget(maskTarget, targetWidth, targetHeight)
    outlineMaterial.uniforms.uTexel.value.set(1 / targetWidth, 1 / targetHeight)
  }

  function resizeTarget(target: THREE.WebGLRenderTarget, width: number, height: number) {
    if (target.depthTexture) {
      target.depthTexture.image.width = width
      target.depthTexture.image.height = height
    }
    target.setSize(width, height)
  }

  let renderingDepth = false
  let renderingMask = false
  const hoverSlots = [
    { id: 0, mix: 0 },
    { id: 0, mix: 0 },
  ]

  function assignOutlineIds() {
    outlineIdBySlug.clear()
    for (const object of clickable) {
      const slug = slugFromObject(object)
      if (!slug) continue
      let id = outlineIdBySlug.get(slug)
      if (id === undefined) {
        id = outlineIdBySlug.size + 1
        outlineIdBySlug.set(slug, id)
      }
      object.userData.outlineId = id
      object.layers.enable(1)
    }
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.onBeforeRender = () => {
        if (renderingDepth) {
          const material = Array.isArray(child.material) ? child.material[0] : child.material
          const write = material.depthWrite !== false
          depthMaterial.depthWrite = write
          depthMaterial.uniforms.uKeep.value = write ? 1 : 0
          depthMaterial.uniformsNeedUpdate = true
        }
        if (!renderingMask) return
        const id = child.userData.outlineId
        if (typeof id !== 'number') return
        maskMaterial.uniforms.uId.value = id
        maskMaterial.uniformsNeedUpdate = true
      }
    })
  }

  function stepHover(dt: number) {
    const target = hoveredSlug ? (outlineIdBySlug.get(hoveredSlug) ?? 0) : 0
    const rate = reduceMotion ? 1 : 1 - Math.exp(-dt * 14)
    const toward = (slot: { id: number; mix: number }, goal: number) => {
      slot.mix += (goal - slot.mix) * rate
      if (slot.mix < 0.02) {
        slot.mix = 0
        if (goal === 0) slot.id = 0
      } else if (goal === 1 && slot.mix > 0.985) {
        slot.mix = 1
      }
    }
    if (target && hoverSlots[0].id !== target) {
      if (hoverSlots[1].id === target) {
        const swap = hoverSlots[0]
        hoverSlots[0] = hoverSlots[1]
        hoverSlots[1] = swap
      } else {
        if (hoverSlots[0].id) hoverSlots[1] = { id: hoverSlots[0].id, mix: hoverSlots[0].mix }
        hoverSlots[0] = { id: target, mix: 0 }
      }
    }
    toward(hoverSlots[0], hoverSlots[0].id === target && target ? 1 : 0)
    toward(hoverSlots[1], hoverSlots[1].id === target ? 1 : 0)
    if (hoverSlots[0].id && hoverSlots[0].id === hoverSlots[1].id) hoverSlots[1] = { id: 0, mix: 0 }
    outlineMaterial.uniforms.uIdA.value = hoverSlots[0].id
    outlineMaterial.uniforms.uMixA.value = hoverSlots[0].mix
    outlineMaterial.uniforms.uIdB.value = hoverSlots[1].id
    outlineMaterial.uniforms.uMixB.value = hoverSlots[1].mix
    outlineMaterial.uniformsNeedUpdate = true
  }

  function warmGpu() {
    const previousOverride = scene.overrideMaterial
    const previousTarget = renderer.getRenderTarget()
    renderer.shadowMap.needsUpdate = true
    scene.overrideMaterial = null
    renderer.setRenderTarget(depthTarget)
    renderer.render(scene, camera)
    scene.overrideMaterial = depthMaterial
    renderer.render(scene, camera)
    scene.overrideMaterial = maskMaterial
    camera.layers.set(1)
    renderer.setRenderTarget(maskTarget)
    renderer.render(scene, camera)
    camera.layers.set(0)
    renderer.setRenderTarget(depthTarget)
    renderer.render(outlineScene, outlineCamera)
    scene.overrideMaterial = previousOverride
    renderer.setRenderTarget(previousTarget)
  }

  function drawOutline(dt: number) {
    if (clickable.length === 0 || outlineFade < 0.02) return
    stepHover(dt)
    const previousBackground = scene.background
    const previousOverride = scene.overrideMaterial
    const previousClearAlpha = renderer.getClearAlpha()
    const previousShadowUpdate = renderer.shadowMap.autoUpdate
    renderer.getClearColor(savedClear)
    renderer.shadowMap.autoUpdate = false
    scene.background = null
    scene.overrideMaterial = depthMaterial
    renderingDepth = true
    renderer.setRenderTarget(depthTarget)
    renderer.setClearColor(farClear, 1)
    renderer.clear()
    renderer.render(scene, camera)
    renderingDepth = false
    renderer.initRenderTarget(maskTarget)
    renderer.copyTextureToTexture(sceneDepth, maskDepth)
    scene.overrideMaterial = maskMaterial
    renderingMask = true
    camera.layers.set(1)
    renderer.setRenderTarget(maskTarget)
    renderer.setClearColor(maskClear, 1)
    const previousAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.clear(true, false, false)
    renderer.render(scene, camera)
    renderingMask = false
    camera.layers.set(0)
    scene.background = previousBackground
    scene.overrideMaterial = previousOverride
    renderer.setRenderTarget(null)
    renderer.setClearColor(savedClear, previousClearAlpha)
    renderer.shadowMap.autoUpdate = previousShadowUpdate
    renderer.render(outlineScene, outlineCamera)
    renderer.autoClear = previousAutoClear
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

    renderer.shadowMap.autoUpdate = true
    if (introPlaying) {
      const span = INTRO_HEIGHT_SPAN + INTRO_SIDE_SPAN + INTRO_MOVE
      const t = Math.min(1, introElapsed / span)
      sun.shadow.intensity = t * t * (3 - 2 * t)
    } else {
      sun.shadow.intensity = 1
      outlineFade += (1 - outlineFade) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 5))
    }
    outlineMaterial.uniforms.uFade.value = outlineFade

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

    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
    drawOutline(dt)
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
      depthTarget.dispose()
      maskTarget.dispose()
      depthMaterial.dispose()
      maskMaterial.dispose()
      outlineMaterial.dispose()
      outlineQuad.geometry.dispose()
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
