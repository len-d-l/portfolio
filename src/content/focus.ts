import type { Crop } from '../dither.ts'
import focusPoints from './focus.json'
import type { Project } from './projects.ts'

// Kept out of projects.ts: vite.config imports that file, and a config dependency changing restarts the dev server.
const points: Record<string, number[] | undefined> = focusPoints

export const maxZoom = 4

export const focusKey = (project: Project, file: string) => `${project.slug}/${file}`

/** Which part of an image the Work page previews keep. Set with the crop tool in dev. */
export function imageFocus(project: Project, file: string): Crop {
  const [x = 50, y = 50, zoom = 1] = points[focusKey(project, file)] ?? []
  return [x, y, Math.min(maxZoom, Math.max(1, zoom))]
}

/**
 * Inline style for a cover-fit preview. The zoom pivots on the focus point (so the frame stays covered),
 * written as a shift + scale so other transforms can still pivot on the frame centre.
 */
export function cropStyle([x, y, zoom = 1]: Crop) {
  const shift = (percent: number) => `${Number(((1 - zoom) * (percent - 50)).toFixed(3))}%`
  return `object-position: ${x}% ${y}%; --zoom: ${zoom}; --shift-x: ${shift(x)}; --shift-y: ${shift(y)}`
}

/** Dev crop tool: keep the in-memory focus in step with what it just saved. */
export function setImageFocus(key: string, [x, y, zoom = 1]: Crop) {
  points[key] = [x, y, zoom]
}
