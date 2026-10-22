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

/** Seconds without input before the camera starts to sway. */
const IDLE_AFTER = 3.5

/** Max sway either side, in radians (0.16 ≈ 9°). */
const IDLE_SWAY = 0.16

/** Seconds per object while the idle hints cycle through the clickable things. */
const HINT_HOLD = 3
const HINT_GAP = 1.1
/** Seconds for a hint outline to fade fully in or out; the label waits until it is mostly in. */
const HINT_EASE = 0.7
const HINT_LABEL_AT = 0.5

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

export function createDeskScene({ canvas, label, wipe, onSelect }: DeskSceneOptions) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(1)
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const beautyDepth = new THREE.DepthTexture(1, 1)
  beautyDepth.generateMipmaps = false
  const maskDepth = new THREE.DepthTexture(1, 1)
  maskDepth.generateMipmaps = false
  // The color pass keeps its depth so outlines can reuse it instead of redrawing the desk.
  const beautyTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: beautyDepth,
  })
  beautyTarget.texture.minFilter = THREE.NearestFilter
  beautyTarget.texture.magFilter = THREE.NearestFilter
  beautyTarget.texture.generateMipmaps = false
  beautyTarget.texture.colorSpace = THREE.LinearSRGBColorSpace
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
  const blitMaterial = new THREE.MeshBasicMaterial({
    map: beautyTarget.texture,
    toneMapped: false,
    fog: false,
    depthTest: false,
    depthWrite: false,
  })
  const blitScene = new THREE.Scene()
  const blitQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMaterial)
  blitQuad.frustumCulled = false
  blitScene.add(blitQuad)
  const maskClear = new THREE.Color('#000000')
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
  let deskRoot: THREE.Object3D | null = null
  let viewDirty = true
  let shadowBaked = false
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

  function freezeMeshes() {
    const meshes: THREE.Mesh[] = introItems.map((item) => item.mesh)
    if (meshes.length === 0 && deskRoot) {
      deskRoot.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child)
      })
    }
    for (const mesh of meshes) mesh.updateMatrix()
    deskRoot?.updateMatrixWorld(true)
    for (const mesh of meshes) {
      mesh.traverse((object) => {
        object.matrixAutoUpdate = false
        object.matrixWorldAutoUpdate = false
      })
    }
  }

  function startIntro(root: THREE.Object3D, radius: number) {
    if (reduceMotion) {
      freezeMeshes()
      return
    }
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

  const loading = canvas.closest('.home')?.querySelector<HTMLElement>('.home-loading')
  void tryLoadDeskScene((fraction) => {
    if (!loading) return
    loading.textContent =
      fraction === null ? 'Loading the desk…' : fraction < 1 ? `Loading the desk · ${Math.round(fraction * 100)}%` : 'Setting up the desk…'
  }).then(async (custom) => {
    const home = canvas.closest('.home')
    if (!custom) {
      home?.classList.add('is-live')
      return
    }
    clickable.length = 0
    clickable.push(...custom.clickable)
    deskRoot = custom.root
    custom.root.rotation.y = MODEL_YAW
    addSignBulbLights(custom.root)
    addFanLights(custom.root)
    custom.root.visible = false
    scene.add(custom.root)
    frameObject(custom.root, camera, controls)
    fitHomeView(custom.root, true)
    fitLighting(custom.root, sun, fill, scene)
    addPaperFloor(custom.root, scene)
    setPanLimits(custom.root)
    const size = new THREE.Box3().setFromObject(custom.root).getSize(new THREE.Vector3())
    const radius = Math.max(size.length() * 0.5, 1)
    setNearFade(radius)
    await renderer.compileAsync(scene, camera)
    custom.root.visible = true
    shadowBaked = false
    viewDirty = true
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
    if (slug !== hoveredSlug) viewDirty = true
    hoveredSlug = slug
    canvas.style.cursor = slug ? 'pointer' : 'grab'
    label.classList.remove('is-hint', 'is-out')
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

  const homePos = new THREE.Vector3()
  const homeTarget = new THREE.Vector3()
  let corners: THREE.Vector3[] = []
  let touched = false

  /** Pulls the camera back along its view direction until every object on the desk fits on screen, shelf included. */
  function fitHomeView(root: THREE.Object3D | null, apply: boolean) {
    if (root) {
      corners = []
      const box = new THREE.Box3()
      root.updateMatrixWorld(true)
      root.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !node.visible) return
        box.setFromObject(node)
        if (box.isEmpty()) return
        for (let bits = 0; bits < 8; bits += 1) {
          corners.push(
            new THREE.Vector3(bits & 1 ? box.max.x : box.min.x, bits & 2 ? box.max.y : box.min.y, bits & 4 ? box.max.z : box.min.z),
          )
        }
      })
    }
    if (!corners.length) return
    if (apply || homePos.lengthSq() === 0) {
      homeTarget.copy(controls.target)
      homePos.copy(camera.position)
    }
    const direction = homePos.clone().sub(homeTarget).normalize()
    const probe = camera.clone()
    probe.aspect = camera.aspect
    probe.far = 1000
    const fits = (distance: number) => {
      probe.position.copy(homeTarget).addScaledVector(direction, distance)
      probe.lookAt(homeTarget)
      probe.updateMatrixWorld()
      probe.updateProjectionMatrix()
      return corners.every((corner) => {
        const point = corner.clone().project(probe)
        return Math.abs(point.z) < 1 && Math.abs(point.x) < 0.9 && point.y < 0.74 && point.y > -0.94
      })
    }
    let near = 0.5
    let far = 40
    for (let step = 0; step < 28; step += 1) {
      const middle = (near + far) / 2
      if (fits(middle)) far = middle
      else near = middle
    }
    homePos.copy(homeTarget).addScaledVector(direction, far)
    controls.maxDistance = Math.max(controls.maxDistance, far * 1.15)
    if (apply || !touched) {
      camera.position.copy(homePos)
      viewDirty = true
    }
  }

  let lastInput = performance.now()
  let swayTime = 0
  let swayYaw = 0
  let slowOutline = false
  let hintLabelTimer = 0
  let hintIndex = -1
  let hintClock = 0
  let hintSlug: string | null = null
  const hintBoxes = new Map<string, THREE.Box3>()
  const swayAxis = new THREE.Vector3(0, 1, 0)
  const swayOffset = new THREE.Vector3()
  const hintPoint = new THREE.Vector3()

  function markInput() {
    lastInput = performance.now()
    touched = true
    swayTime = 0
    swayYaw = 0
    hintClock = 0
    slowOutline = false
    if (hintSlug) {
      hintSlug = null
      showLabel(null)
    }
  }

  function releaseHintLabel() {
    window.clearTimeout(hintLabelTimer)
    label.classList.add('is-out')
    hintLabelTimer = window.setTimeout(() => {
      if (hintSlug || !label.classList.contains('is-hint')) return
      label.hidden = true
      label.classList.remove('is-hint', 'is-out')
    }, 420)
  }

  function hintBox(slug: string) {
    let box = hintBoxes.get(slug)
    if (!box) {
      box = new THREE.Box3()
      for (const object of clickable) if (slugFromObject(object) === slug) box.expandByObject(object)
      hintBoxes.set(slug, box)
    }
    return box
  }

  const sightRay = new THREE.Raycaster()
  const sightPoint = new THREE.Vector3()

  /** True when some part of the object is on screen and not hidden behind something else. */
  function inPlainSight(slug: string) {
    const box = hintBox(slug)
    if (box.isEmpty() || !deskRoot) return false
    const center = box.getCenter(new THREE.Vector3())
    const samples = [center, new THREE.Vector3(center.x, box.max.y - (box.max.y - box.min.y) * 0.15, center.z)]
    return samples.some((point) => {
      sightPoint.copy(point).project(camera)
      if (Math.abs(sightPoint.x) > 0.92 || Math.abs(sightPoint.y) > 0.88 || sightPoint.z > 1) return false
      sightRay.set(camera.position, point.clone().sub(camera.position).normalize())
      const hit = sightRay.intersectObject(deskRoot!, true).find((item) => item.object.visible)
      return !!hit && slugFromObject(hit.object) === slug
    })
  }

  function placeHintLabel(slug: string) {
    const box = hintBox(slug)
    if (box.isEmpty()) return
    box.getCenter(hintPoint)
    hintPoint.y = box.max.y
    hintPoint.project(camera)
    const rect = canvas.getBoundingClientRect()
    const project = deskProjects().find((item) => item.slug === slug)
    const text = project?.title ?? slug
    if (label.textContent !== text || label.hidden) {
      window.clearTimeout(hintLabelTimer)
      label.textContent = text
      label.hidden = false
      label.classList.remove('is-out', 'is-hint')
      void label.offsetWidth
      label.classList.add('is-hint')
    }
    const x = rect.left + ((hintPoint.x + 1) / 2) * rect.width + 10
    const y = rect.top + ((1 - hintPoint.y) / 2) * rect.height - 34
    label.style.left = `${Math.min(Math.max(8, x), window.innerWidth - label.offsetWidth - 8)}px`
    label.style.top = `${Math.min(Math.max(58, y), window.innerHeight - 40)}px`
  }

  function stepIdle(dt: number) {
    if (reduceMotion || zoom || introPlaying || clickable.length === 0) return
    const idle = (performance.now() - lastInput) / 1000 - IDLE_AFTER
    if (idle <= 0) return

    slowOutline = true
    if (homePos.lengthSq() === 0) return
    swayOffset.copy(camera.position).sub(controls.target).applyAxisAngle(swayAxis, -swayYaw)
    camera.position.copy(controls.target).add(swayOffset)
    const settle = 1 - Math.exp(-dt * 1.1)
    camera.position.lerp(homePos, settle)
    controls.target.lerp(homeTarget, settle)
    const home = camera.position.distanceTo(homePos) < homePos.distanceTo(homeTarget) * 0.04

    swayTime += dt
    const ramp = Math.min(1, idle / 3)
    const yaw = Math.sin(swayTime * 0.21) * IDLE_SWAY * ramp * ramp * (3 - 2 * ramp)
    swayOffset.copy(camera.position).sub(controls.target).applyAxisAngle(swayAxis, yaw)
    camera.position.copy(controls.target).add(swayOffset)
    swayYaw = yaw
    viewDirty = true

    const slugs = [...outlineIdBySlug.keys()]
    if (!home || idle < 1.5 || slugs.length === 0) return
    hintClock += dt
    if (hintSlug && hintClock > HINT_HOLD) {
      hintSlug = null
      hintClock = 0
      if (!pointerDown) {
        hoveredSlug = null
        viewDirty = true
        releaseHintLabel()
      }
    } else if (!hintSlug && hintClock > HINT_GAP) {
      for (let tries = 0; tries < slugs.length; tries += 1) {
        hintIndex = (hintIndex + 1) % slugs.length
        if (inPlainSight(slugs[hintIndex])) {
          hintSlug = slugs[hintIndex]
          break
        }
      }
      hintClock = 0
      if (hintSlug) {
        hoveredSlug = hintSlug
        viewDirty = true
      }
    }
    if (hintSlug && hintClock > HINT_LABEL_AT) placeHintLabel(hintSlug)
  }

  function onPointerMove(event: PointerEvent) {
    if (zoom) return
    markInput()
    setPointer(event)
    showLabel(hitSlug(), event)
  }

  function onPointerDown(event: PointerEvent) {
    if (zoom) return
    markInput()
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
    fitHomeView(null, false)
    let bufferWidth = Math.max(1, Math.floor(width / PIXEL_SIZE))
    let bufferHeight = Math.max(1, Math.floor(height / PIXEL_SIZE))
    const longest = Math.max(bufferWidth, bufferHeight)
    if (longest > 960) {
      const scale = 960 / longest
      bufferWidth = Math.max(1, Math.floor(bufferWidth * scale))
      bufferHeight = Math.max(1, Math.floor(bufferHeight * scale))
    }
    viewDirty = true
    if (renderer.domElement.width === bufferWidth && renderer.domElement.height === bufferHeight) return
    renderer.setSize(bufferWidth, bufferHeight, false)
    resizeTarget(beautyTarget, bufferWidth, bufferHeight)
    resizeTarget(maskTarget, bufferWidth, bufferHeight)
    outlineMaterial.uniforms.uTexel.value.set(1 / bufferWidth, 1 / bufferHeight)
  }

  function resizeTarget(target: THREE.WebGLRenderTarget, width: number, height: number) {
    if (target.depthTexture) {
      target.depthTexture.image.width = width
      target.depthTexture.image.height = height
    }
    target.setSize(width, height)
  }

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
      if (!(object instanceof THREE.Mesh)) continue
      const outlineId = id
      object.onBeforeRender = () => {
        if (!renderingMask) return
        maskMaterial.uniforms.uId.value = outlineId
        maskMaterial.uniformsNeedUpdate = true
      }
    }
  }

  function stepHover(dt: number) {
    const target = hoveredSlug ? (outlineIdBySlug.get(hoveredSlug) ?? 0) : 0
    const rate = reduceMotion ? 1 : 1 - Math.exp(-dt * 14)
    const glide = slowOutline && !reduceMotion
    const toward = (slot: { id: number; mix: number }, goal: number) => {
      if (glide) {
        const step = dt / HINT_EASE
        slot.mix = goal > slot.mix ? Math.min(goal, slot.mix + step) : Math.max(goal, slot.mix - step)
        if (slot.mix === 0 && goal === 0) slot.id = 0
        return
      }
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
    const shape = (mix: number) => (glide ? mix * mix * (3 - 2 * mix) : mix)
    outlineMaterial.uniforms.uMixA.value = shape(hoverSlots[0].mix)
    outlineMaterial.uniforms.uIdB.value = hoverSlots[1].id
    outlineMaterial.uniforms.uMixB.value = shape(hoverSlots[1].mix)
    outlineMaterial.uniformsNeedUpdate = true
  }

  function warmGpu() {
    const previousOverride = scene.overrideMaterial
    const previousTarget = renderer.getRenderTarget()
    const warmupTarget = new THREE.WebGLRenderTarget(1, 1)
    renderer.shadowMap.needsUpdate = true
    scene.overrideMaterial = null
    renderer.setRenderTarget(beautyTarget)
    renderer.render(scene, camera)
    renderer.initRenderTarget(maskTarget)
    renderer.copyTextureToTexture(beautyDepth, maskDepth)
    scene.overrideMaterial = maskMaterial
    camera.layers.set(1)
    renderer.setRenderTarget(maskTarget)
    renderer.render(scene, camera)
    camera.layers.set(0)
    scene.overrideMaterial = previousOverride
    renderer.setRenderTarget(warmupTarget)
    renderer.render(blitScene, outlineCamera)
    renderer.render(outlineScene, outlineCamera)
    renderer.setRenderTarget(previousTarget)
    warmupTarget.dispose()
  }

  function drawOutline(dt: number) {
    if (clickable.length === 0 || outlineFade < 0.02) return
    stepHover(dt)
    const previousBackground = scene.background
    const previousOverride = scene.overrideMaterial
    const previousClearAlpha = renderer.getClearAlpha()
    const previousAutoClear = renderer.autoClear
    renderer.getClearColor(savedClear)
    renderer.shadowMap.autoUpdate = false
    renderer.initRenderTarget(maskTarget)
    renderer.copyTextureToTexture(beautyDepth, maskDepth)
    scene.background = null
    scene.overrideMaterial = maskMaterial
    renderingMask = true
    camera.layers.set(1)
    renderer.setRenderTarget(maskTarget)
    renderer.setClearColor(maskClear, 1)
    renderer.autoClear = false
    renderer.clear(true, false, false)
    renderer.render(scene, camera)
    renderingMask = false
    camera.layers.set(0)
    scene.background = previousBackground
    scene.overrideMaterial = previousOverride
    renderer.setRenderTarget(null)
    renderer.setClearColor(savedClear, previousClearAlpha)
    renderer.autoClear = previousAutoClear
  }

  function tick() {
    frame = requestAnimationFrame(tick)
    if (document.hidden) return
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
        freezeMeshes()
      }
    }

    stepIdle(dt)
    const cameraMoved = zoom ? true : controls.update()
    if (!zoom) clampPan()
    const fading = outlineFade < 0.995
    const needFrame = viewDirty || introPlaying || cameraMoved || fading || outlineBusy()

    if (introPlaying) {
      renderer.shadowMap.autoUpdate = true
      shadowBaked = false
      const span = INTRO_HEIGHT_SPAN + INTRO_SIDE_SPAN + INTRO_MOVE
      const t = Math.min(1, introElapsed / span)
      sun.shadow.intensity = t * t * (3 - 2 * t)
    } else {
      renderer.shadowMap.autoUpdate = false
      sun.shadow.intensity = 1
      if (fading) outlineFade += (1 - outlineFade) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 5))
      if (!shadowBaked && needFrame) {
        renderer.shadowMap.needsUpdate = true
        shadowBaked = true
      }
    }
    outlineMaterial.uniforms.uFade.value = outlineFade

    if (zoom) {
      zoom.elapsed += dt
      const u = easeOutCubic(Math.min(1, zoom.elapsed / ZOOM_DURATION))
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
    }

    if (!needFrame) return
    viewDirty = false

    renderer.setRenderTarget(beautyTarget)
    renderer.render(scene, camera)
    drawOutline(dt)
    renderer.setRenderTarget(null)
    const previousAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.render(blitScene, outlineCamera)
    if (clickable.length > 0 && outlineFade >= 0.02) renderer.render(outlineScene, outlineCamera)
    renderer.autoClear = previousAutoClear
  }

  function outlineBusy() {
    const target = hoveredSlug ? (outlineIdBySlug.get(hoveredSlug) ?? 0) : 0
    if (target !== 0 && (hoverSlots[0].id !== target || hoverSlots[0].mix < 0.985)) return true
    const settling = (slot: { id: number; mix: number }) => slot.mix > 0.02 && slot.mix < 0.985
    return settling(hoverSlots[0]) || settling(hoverSlots[1])
  }

  function onVisible() {
    if (!document.hidden) viewDirty = true
  }

  function onControlsChange() {
    viewDirty = true
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  document.addEventListener('visibilitychange', onVisible)
  controls.addEventListener('change', onControlsChange)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointerleave', () => showLabel(null))
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('wheel', markInput, { passive: true })
  resize()
  tick()

  return {
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
      controls.removeEventListener('change', onControlsChange)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('wheel', markInput)
      controls.dispose()
      beautyTarget.dispose()
      maskTarget.dispose()
      maskMaterial.dispose()
      outlineMaterial.dispose()
      blitMaterial.dispose()
      outlineQuad.geometry.dispose()
      blitQuad.geometry.dispose()
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
