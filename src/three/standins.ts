import * as THREE from 'three'
import type { DeskKind } from '../content/projects.ts'

export function psxMaterial(color: string | number, extras: THREE.MeshLambertMaterialParameters = {}) {
  const material = new THREE.MeshLambertMaterial({
    color,
    ...extras,
  })
  applyPsxShader(material)
  return material
}

function crunchTexture(texture?: THREE.Texture | null) {
  if (!texture) return
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
}

/** Higher = less jitter. ~240 is heavy PS1, ~480 is a hint. */
const PSX_SCREEN_RES = 320

const psxSnapChunk = `
  {
    vec3 ndc = gl_Position.xyz / max(gl_Position.w, 1e-6);
    ndc.xy = floor(ndc.xy * uPsxRes + 0.5) / uPsxRes;
    gl_Position.xyz = ndc * gl_Position.w;
  }
`

function injectPsxSnap(vertexShader: string) {
  let next = vertexShader
  if (next.includes('#include <common>')) {
    next = next.replace('#include <common>', '#include <common>\nuniform float uPsxRes;')
  } else {
    next = `uniform float uPsxRes;\n${next}`
  }

  if (next.includes('#include <project_vertex>')) {
    return next.replace('#include <project_vertex>', `#include <project_vertex>\n${psxSnapChunk}`)
  }

  return next.replace(
    'gl_Position = projectionMatrix * mvPosition;',
    `gl_Position = projectionMatrix * mvPosition;\n${psxSnapChunk}`,
  )
}

export function applyPsxShader(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPsxRes = { value: PSX_SCREEN_RES }
    shader.vertexShader = injectPsxSnap(shader.vertexShader)
  }
  material.customProgramCacheKey = () => `psx-ndc-snap-${PSX_SCREEN_RES}`
  material.needsUpdate = true
}

function toPsxLambert(material: THREE.Material) {
  const src = material as THREE.MeshStandardMaterial
  crunchTexture(src.map)
  crunchTexture(src.emissiveMap)
  crunchTexture(src.alphaMap)

  const color = (src.color ?? new THREE.Color('#ffffff')).clone()
  liftAlbedo(color)

  const next = new THREE.MeshLambertMaterial({
    color,
    map: src.map ?? null,
    alphaMap: src.alphaMap ?? null,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: THREE.DoubleSide,
    emissive: src.emissive ?? 0x000000,
    emissiveMap: src.emissiveMap ?? null,
    emissiveIntensity: src.emissiveIntensity ?? 1,
    fog: src.fog,
    flatShading: false,
  })
  applyPsxShader(next)
  material.dispose()
  return next
}

function liftAlbedo(color: THREE.Color) {
  const lum = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
  if (lum >= 0.001) return
  color.setRGB(0.025, 0.025, 0.025)
}

export function applyPsxLook(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const converted = materials.map((item) => toPsxLambert(item))
    child.material = converted.length === 1 ? converted[0] : converted
  })
}

function mesh(
  geometry: THREE.BufferGeometry,
  color: string | number,
  x = 0,
  y = 0,
  z = 0,
  extras: THREE.MeshLambertMaterialParameters = {},
) {
  const item = new THREE.Mesh(geometry, psxMaterial(color, extras))
  item.position.set(x, y, z)
  item.castShadow = true
  item.receiveShadow = true
  return item
}

function mark(group: THREE.Group, slug: string) {
  group.traverse((child) => {
    child.userData.slug = slug
  })
  group.userData.slug = slug
  return group
}

function piano() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(1.15, 0.08, 0.38), '#2a2420', 0, 0.18, 0))
  group.add(mesh(new THREE.BoxGeometry(1.15, 0.28, 0.12), '#1f1b18', 0, 0.28, -0.13))
  group.add(mesh(new THREE.BoxGeometry(1.1, 0.03, 0.22), '#f3efe6', 0, 0.23, 0.06))
  for (let i = 0; i < 10; i += 1) {
    group.add(
      mesh(new THREE.BoxGeometry(0.05, 0.04, 0.12), '#161410', -0.45 + i * 0.1, 0.26, 0.02),
    )
  }
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), '#2a2420', -0.5, 0.01, 0.12))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), '#2a2420', 0.5, 0.01, 0.12))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), '#2a2420', -0.5, 0.01, -0.12))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), '#2a2420', 0.5, 0.01, -0.12))
  group.add(mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), '#c9a227', 0, -0.02, 0.14))
  return mark(group, 'piano')
}

function ships() {
  const group = new THREE.Group()
  const hull = mesh(new THREE.BoxGeometry(0.95, 0.16, 0.28), '#5c3b28', 0, 0.12, 0)
  hull.rotation.z = 0.04
  group.add(hull)
  group.add(mesh(new THREE.BoxGeometry(0.7, 0.1, 0.18), '#7a5136', 0.04, 0.2, 0))
  group.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 6), '#d7c4a3', -0.08, 0.48, 0))
  group.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), '#d7c4a3', 0.22, 0.4, 0))
  const sailA = mesh(new THREE.BoxGeometry(0.02, 0.34, 0.28), '#efe6d4', -0.08, 0.5, 0)
  const sailB = mesh(new THREE.BoxGeometry(0.02, 0.24, 0.2), '#e4d5bc', 0.22, 0.42, 0)
  group.add(sailA, sailB)
  group.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), '#2c4a3a', 0.38, 0.22, 0))
  return mark(group, 'low-poly-ships')
}

function bug() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), '#c45c26', 0, 0.18, 0))
  group.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), '#2a2420', 0.16, 0.16, 0))
  group.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), '#efe6d4', 0.24, 0.2, 0.05))
  group.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), '#efe6d4', 0.24, 0.2, -0.05))
  for (let i = -1; i <= 1; i += 1) {
    const legL = mesh(new THREE.BoxGeometry(0.16, 0.025, 0.025), '#241c16', -0.02, 0.08, 0.12)
    legL.rotation.z = 0.4
    legL.position.z = 0.12 + i * 0.02
    legL.position.x = i * 0.05
    const legR = mesh(new THREE.BoxGeometry(0.16, 0.025, 0.025), '#241c16', -0.02, 0.08, -0.12)
    legR.rotation.z = 0.4
    group.add(legL, legR)
  }
  const antenna = mesh(new THREE.BoxGeometry(0.02, 0.16, 0.02), '#241c16', 0.2, 0.3, 0.05)
  antenna.rotation.z = -0.5
  group.add(antenna)
  return mark(group, 'bug-brigade')
}

function spacecrew() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(0.42, 0.18, 0.28), '#6d7580', 0, 0.16, 0))
  group.add(mesh(new THREE.BoxGeometry(0.32, 0.04, 0.18), '#1f2a32', 0, 0.26, 0.02))
  group.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), '#c45c26', -0.1, 0.3, 0.04))
  group.add(mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), '#3d5a3a', 0.1, 0.29, 0.04))
  group.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), '#d7c4a3', 0.16, 0.36, -0.08))
  return mark(group, 'spacecrew')
}

function xingtian() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(0.28, 0.36, 0.08), '#4a3f6b', 0, 0.26, 0))
  group.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), '#e6c9a8', 0, 0.48, 0))
  group.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), '#241c16', 0, 0.08, 0))
  group.add(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), '#c9a227', 0.18, 0.3, 0))
  return mark(group, 'nightmare-of-xingtian')
}

function tomfoodery() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), '#efe6d4', 0, 0.08, 0))
  group.add(mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), '#c45c26', 0.02, 0.1, 0.01))
  group.add(mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), '#efe6d4', 0.04, 0.12, 0.02))
  group.add(mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), '#c9a227', -0.16, 0.12, 0.14))
  group.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), '#3d5a3a', 0.14, 0.16, 0.12))
  return mark(group, 'tomfoodery')
}

function hub() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(0.28, 0.04, 0.28), '#7a5136', 0, 0.2, 0))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), '#5c3b28', -0.08, 0.09, 0.08))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), '#5c3b28', 0.08, 0.09, 0.08))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), '#5c3b28', -0.08, 0.09, -0.08))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), '#5c3b28', 0.08, 0.09, -0.08))
  group.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.04), '#d7c4a3', 0, 0.32, -0.1))
  return mark(group, 'digital-society-hub')
}

function billboard() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(0.04, 0.36, 0.04), '#5c3b28', 0, 0.18, 0))
  group.add(mesh(new THREE.BoxGeometry(0.42, 0.26, 0.03), '#efe6d4', 0, 0.42, 0))
  group.add(mesh(new THREE.BoxGeometry(0.3, 0.08, 0.04), '#3d5a3a', 0, 0.46, 0.01))
  group.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.04), '#c45c26', -0.06, 0.36, 0.01))
  return mark(group, 'billboard')
}

function ui() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(0.2, 0.38, 0.04), '#241c16', 0, 0.22, 0))
  group.add(mesh(new THREE.BoxGeometry(0.16, 0.28, 0.01), '#8fb7c4', 0, 0.23, 0.025))
  group.add(mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), '#efe6d4', 0, 0.3, 0.03))
  group.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), '#c45c26', 0, 0.08, 0.03))
  return mark(group, 'ui-redesign')
}

function unreal() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 8), '#6d7580', 0, 0.06, 0))
  group.add(mesh(new THREE.BoxGeometry(0.04, 0.34, 0.04), '#d7c4a3', 0, 0.24, 0))
  group.add(mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 12), '#c45c26', 0, 0.38, 0))
  group.add(mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 12), '#c9a227', 0, 0.38, 0))
  return mark(group, 'unreal-project')
}

const factories: Record<DeskKind, () => THREE.Group> = {
  piano,
  ships,
  bug,
  spacecrew,
  xingtian,
  tomfoodery,
  hub,
  billboard,
  ui,
  unreal,
}

export function createStandin(kind: DeskKind) {
  return factories[kind]()
}

export function createDesk() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.BoxGeometry(4.4, 0.1, 2.15), '#7a4a2e', 0, 0, 0))
  group.add(mesh(new THREE.BoxGeometry(4.35, 0.02, 2.1), '#8b5a3c', 0, 0.06, 0))
  const legs: Array<[number, number]> = [
    [-2, 0.9],
    [2, 0.9],
    [-2, -0.9],
    [2, -0.9],
  ]
  for (const [x, z] of legs) {
    group.add(mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), '#5c3420', x, -0.47, z))
  }
  return group
}

export function createClutter() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 8), '#efe6d4', 0.15, 0.13, 0.7))
  group.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.04, 8), '#3d5a3a', 0.15, 0.2, 0.7))
  group.add(mesh(new THREE.BoxGeometry(0.28, 0.08, 0.16), '#241c16', -1.5, 0.11, 0.7))
  group.add(mesh(new THREE.BoxGeometry(0.22, 0.04, 0.14), '#6d7580', -1.5, 0.17, 0.7))
  group.add(mesh(new THREE.BoxGeometry(0.24, 0.05, 0.32), '#4a3f6b', 1.7, 0.1, 0.55))
  group.add(mesh(new THREE.BoxGeometry(0.24, 0.05, 0.32), '#241c16', 1.72, 0.15, 0.53))
  return group
}

export function createLamp() {
  const group = new THREE.Group()
  group.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.06, 8), '#241c16', 0, 0.04, 0))
  group.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), '#c9a227', 0, 0.26, 0))
  const shade = mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.14, 8), '#efe6d4', 0.12, 0.5, 0)
  shade.rotation.z = 0.5
  group.add(shade)
  const bulb = new THREE.PointLight('#ffe3b8', 18, 6, 2)
  bulb.position.set(0.12, 0.42, 0)
  bulb.castShadow = true
  group.add(bulb)
  return group
}
