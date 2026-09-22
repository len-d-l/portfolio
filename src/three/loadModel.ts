import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { deskProjects } from '../content/projects.ts'
import { applyPsxLook } from './psx.ts'

const loader = new GLTFLoader()

const slugByName = new Map(
  deskProjects().flatMap((project) => {
    const names = [
      project.slug,
      project.slug.replaceAll('-', '_'),
      project.slug.replaceAll('-', ' '),
      project.title,
      `click_${project.slug}`,
      `click-${project.slug}`,
      `project_${project.slug}`,
      `project-${project.slug}`,
    ]
    if (project.slug === 'piano') {
      names.push('whitekeys', 'white-keys', 'blackkeys', 'black-keys', 'pedals', 'pianobody', 'piano-body')
    }
    return names.map((name) => [normalizeName(name), project.slug] as const)
  }),
)

function normalizeName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.\d+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function slugFromName(name: string): string | undefined {
  const normalized = normalizeName(name)
  if (slugByName.has(normalized)) return slugByName.get(normalized)

  for (const [key, slug] of slugByName) {
    if (normalized === key || normalized.endsWith(`-${key}`) || normalized.startsWith(`${key}-`)) {
      return slug
    }
  }

  return undefined
}

export function slugFromObject(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object
  while (current) {
    if (typeof current.userData.slug === 'string') return current.userData.slug
    current = current.parent
  }
  return null
}

function fitToDesk(root: THREE.Object3D, targetSize = 0.9) {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const max = Math.max(size.x, size.y, size.z) || 1
  root.scale.multiplyScalar(targetSize / max)
  const fitted = new THREE.Box3().setFromObject(root)
  const center = fitted.getCenter(new THREE.Vector3())
  root.position.sub(center)
  root.position.y -= fitted.min.y
}

function tagClickable(root: THREE.Object3D) {
  root.traverse((child) => {
    const slug = slugFromName(child.name)
    if (!slug) return
    child.userData.slug = slug
    child.traverse((part) => {
      part.userData.slug = slug
    })
  })
}

function collectClickable(root: THREE.Object3D) {
  const clickable: THREE.Object3D[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (typeof child.userData.slug !== 'string') return
    clickable.push(child)
  })
  return clickable
}

export function tryLoadModel(slug: string): Promise<THREE.Object3D | null> {
        const url = `${import.meta.env.BASE_URL}models/${slug}.glb`

  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene
        root.traverse((child) => {
          child.userData.slug = slug
          child.castShadow = true
          child.receiveShadow = true
        })
        root.userData.slug = slug
        fitToDesk(root)
        applyPsxLook(root)
        resolve(root)
      },
      undefined,
      () => resolve(null),
    )
  })
}

export type LoadedDeskScene = {
  root: THREE.Group
  clickable: THREE.Object3D[]
  cameras: THREE.Camera[]
}

const deskSceneFiles = ['desk-scene.glb', 'PortfolioModel.glb']

const introPartSuffixes = ['screen', 'stand', 'legs', 'body', 'keys', 'base', 'top', 'leg']

function familyKey(name: string) {
  const stripped = name.replace(/\.\d+$/, '')
  let key = normalizeName(stripped.replace(/([a-z])([A-Z])/g, '$1-$2'))
  for (const suffix of introPartSuffixes) {
    if (key.length > suffix.length && (key.endsWith(`-${suffix}`) || key.endsWith(suffix))) {
      return key.slice(0, -suffix.length).replace(/-$/, '')
    }
  }
  return key
}

function isIntroWrapper(node: THREE.Object3D | null, root: THREE.Object3D) {
  if (!node || node === root) return true
  if (node instanceof THREE.Mesh) return false
  const name = normalizeName(node.name)
  return !name || name === 'scene' || name === 'collection' || name === 'root' || name === 'world'
}

function tagIntroGroups(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const slug = slugFromObject(child)
    if (slug) {
      child.userData.introGroup = `slug:${slug}`
      return
    }
    let node: THREE.Object3D = child
    while (node.parent && !isIntroWrapper(node.parent, root)) {
      node = node.parent
    }
    const grouped = node !== child || node.children.length > 0
    child.userData.introGroup = grouped ? `node:${node.uuid}` : `family:${familyKey(node.name)}`
  })
}

export function bakeWorldTransforms(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })

  tagIntroGroups(root)

  for (const mesh of meshes) {
    const inherited = slugFromObject(mesh)
    if (inherited) mesh.userData.slug = inherited
    mesh.geometry = mesh.geometry.clone()
    mesh.geometry.applyMatrix4(mesh.matrixWorld)
    mesh.geometry.computeVertexNormals()
    mesh.geometry.computeBoundingBox()
    mesh.geometry.computeBoundingSphere()
    mesh.parent?.remove(mesh)
    mesh.position.set(0, 0, 0)
    mesh.quaternion.identity()
    mesh.scale.set(1, 1, 1)
    mesh.updateMatrix()
    root.add(mesh)
  }
}

function loadGltf(url: string): Promise<LoadedDeskScene | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene
        applyPsxLook(root)
        tagClickable(root)
        bakeWorldTransforms(root)
        const clickable = collectClickable(root)
        root.traverse((child) => {
          if (child instanceof THREE.Light) child.visible = false
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })
        resolve({
          root,
          clickable,
          cameras: gltf.cameras,
        })
      },
      undefined,
      () => resolve(null),
    )
  })
}

export async function tryLoadDeskScene(): Promise<LoadedDeskScene | null> {
  for (const file of deskSceneFiles) {
    const loaded = await loadGltf(`${import.meta.env.BASE_URL}models/${file}`)
    if (loaded) return loaded
  }
  return null
}

export function frameObject(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; minDistance: number; maxDistance: number },
) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.length() * 0.5, 1)

  controls.target.copy(center)
  camera.position.set(center.x + radius * 0.85, center.y + radius * 0.55, center.z + radius * 1.05)
  camera.near = Math.max(radius * 0.004, 0.02)
  camera.far = Math.max(radius * 20, 40)
  camera.updateProjectionMatrix()
  controls.minDistance = radius * 0.08
  controls.maxDistance = radius * 2.8
}
