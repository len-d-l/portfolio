import { deskProjects } from '../content/projects.ts'
import { site } from '../content/site.ts'
import { navigate, withBase } from '../router.ts'
import { mountDust } from '../fx/dust.ts'
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
      <canvas class="home-dust" aria-hidden="true"></canvas>
      <div class="home-fade" aria-hidden="true"></div>
      <div class="home-copy">
        <p class="eyebrow">${site.available}</p>
        <h1>${site.tagline}</h1>
        <p class="lede">Click a thing on the desk, or read everything as a list.</p>
        <a class="home-work" href="${withBase('/work')}" data-link>View the work <span aria-hidden="true">→</span></a>
      </div>
      <p class="home-loading" aria-hidden="true">Loading the desk…</p>
      <p class="hint">Drag to look around · Right-click to pan · Click an object</p>
      <div class="home-wipe" aria-hidden="true"></div>
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
  const wipe = root.querySelector<HTMLElement>('.home-wipe')
  if (!canvas || !label) return () => {}

  const scene = createDeskScene({
    canvas,
    label,
    wipe: wipe ?? undefined,
    onSelect: (slug) => navigate(`/work/${slug}`),
  })
  const dust = root.querySelector<HTMLCanvasElement>('.home-dust')
  const stopDust = dust ? mountDust(dust) : () => {}

  return () => {
    scene.dispose()
    stopDust()
  }
}
