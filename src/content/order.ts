import orderFile from './order.json'
import type { Project, ProjectImage } from './projects.ts'

// Kept out of projects.ts: vite.config imports that file, and a config dependency changing restarts the dev server.
const orders: Record<string, string[] | undefined> = orderFile

/** Display order for a project's stills. The dev arrange tool writes this; unknown files stay at the end. */
export function orderedImages(project: Project): ProjectImage[] {
  const files = orders[project.slug]
  if (!files?.length) return project.images
  const byFile = new Map(project.images.map((image) => [image.file, image]))
  const ordered = files.flatMap((file) => {
    const image = byFile.get(file)
    if (!image) return []
    byFile.delete(file)
    return [image]
  })
  return [...ordered, ...byFile.values()]
}

/** Dev arrange tool: keep the in-memory order in step with what it just saved. */
export function setImageOrder(slug: string, files: string[]) {
  orders[slug] = files
}
