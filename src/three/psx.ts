import * as THREE from 'three'

function crunchTexture(texture?: THREE.Texture | null) {
  if (!texture) return
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
}

/** Higher = less jitter. ~240 is heavy PS1, ~480 is a hint. */
const PSX_SCREEN_RES = 140

const psxSnapChunk = `
  {
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

function injectUniforms(shader: string) {
  const uniforms = `
uniform float uPsxRes;
uniform float uNearFadeStart;
uniform float uNearFadeEnd;`
  if (shader.includes('#include <common>')) {
    return shader.replace('#include <common>', `#include <common>\n${uniforms}`)
  }
  return `${uniforms}\n${shader}`
}

function injectPsxSnap(vertexShader: string) {
  const next = injectUniforms(vertexShader)
  if (next.includes('#include <project_vertex>')) {
    return next.replace('#include <project_vertex>', `#include <project_vertex>\n${psxSnapChunk}`)
  }
  return next.replace(
    'gl_Position = projectionMatrix * mvPosition;',
    `gl_Position = projectionMatrix * mvPosition;\n${psxSnapChunk}`,
  )
}

export const nearFade = {
  start: { value: 2.2 },
  end: { value: 0.55 },
}

export function setNearFade(radius: number) {
  nearFade.start.value = Math.max(radius * 0.16, 0.45)
  nearFade.end.value = Math.max(radius * 0.055, 0.12)
}

const proximityDitherChunk = `
  {
    float dist = max(vViewPosition.z, 0.0);
    if (dist <= uNearFadeEnd) discard;
    float fade = smoothstep(uNearFadeEnd, uNearFadeStart, dist);
    if (!gl_FrontFacing && fade < 1.0) discard;
    vec2 bp = mod(floor(gl_FragCoord.xy), 4.0);
    vec4 r0 = vec4(0.0, 8.0, 2.0, 10.0);
    vec4 r1 = vec4(12.0, 4.0, 14.0, 6.0);
    vec4 r2 = vec4(3.0, 11.0, 1.0, 9.0);
    vec4 r3 = vec4(15.0, 7.0, 13.0, 5.0);
    vec4 row = bp.y < 1.5 ? (bp.y < 0.5 ? r0 : r1) : (bp.y < 2.5 ? r2 : r3);
    float bayer = (bp.x < 1.5 ? (bp.x < 0.5 ? row.x : row.y) : (bp.x < 2.5 ? row.z : row.w)) / 16.0;
    if (fade < bayer) discard;
  }
`

function injectProximityDither(fragmentShader: string) {
  const next = injectUniforms(fragmentShader)
  if (next.includes('#include <opaque_fragment>')) {
    return next.replace('#include <opaque_fragment>', `${proximityDitherChunk}\n#include <opaque_fragment>`)
  }
  return next.replace('#include <output_fragment>', `${proximityDitherChunk}\n#include <output_fragment>`)
}

function applyPsxShader(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPsxRes = { value: PSX_SCREEN_RES }
    shader.uniforms.uNearFadeStart = nearFade.start
    shader.uniforms.uNearFadeEnd = nearFade.end
    shader.vertexShader = injectPsxSnap(shader.vertexShader)
    shader.fragmentShader = injectProximityDither(shader.fragmentShader)
  }
  material.customProgramCacheKey = () => `psx-ndc-snap-${PSX_SCREEN_RES}-near-dither-v6`
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
