import { deskProjects } from '../content/projects.ts'
import { site } from '../content/site.ts'
import { navigate, withBase } from '../router.ts'
import { createDeskScene } from '../three/deskScene.ts'
import { renderShell } from '../ui.ts'

export function renderHome() {
  const list = deskProjects()
    .map((project) => `<a href="${withBase(`/work/${project.slug}`)}" data-link>${project.title}</a>`)
    .join('')

  return renderShell(
    `
    <main class="home">
      <canvas class="desk-canvas" aria-label="Interactive 3D desk of projects"></canvas>
      <div class="home-copy">
        <p class="eyebrow">${site.available}</p>
        <h1>${site.tagline}</h1>
        <p class="lede">Click a thing on the desk. Or skip the 3D and read the work as a list.</p>
      </div>
      <p class="hint">Drag to look around · Click an object</p>
      <div class="hover-label" hidden></div>
      <nav class="sr-only" aria-label="Projects on the desk">${list}</nav>
    </main>
  `,
    { home: true },
  )
}

export function mountHome(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('.desk-canvas')
  const label = root.querySelector<HTMLElement>('.hover-label')
  if (!canvas || !label) return () => {}

  const scene = createDeskScene({
    canvas,
    label,
    onSelect: (slug) => navigate(`/work/${slug}`),
  })

  return () => scene.dispose()
}
