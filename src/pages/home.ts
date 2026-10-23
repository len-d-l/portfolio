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
        <p class="lede lede-desk">Click a thing on the desk, or read everything as a list.</p>
        <p class="lede lede-phone">Tap the scene to look around.</p>
        <a class="home-work" href="${withBase('/work')}" data-link>View the work <span aria-hidden="true">→</span></a>
      </div>
      <p class="home-loading" aria-hidden="true">Loading the desk…</p>
      <p class="hint"><span class="hint-desk">Drag to look around · Right-click to pan · Click an object</span><span class="hint-phone">Drag to look around<br>Pinch to zoom · Tap an object</span></p>
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

  const phone = window.matchMedia('(max-width: 720px)')
  const origins = new Map<number, { x: number; y: number }>()
  let fingerMoved = false

  const scene = createDeskScene({
    canvas,
    label,
    wipe: wipe ?? undefined,
    onSelect: (slug) => navigate(`/work/${slug}`),
  })
  const dust = root.querySelector<HTMLCanvasElement>('.home-dust')
  const stopDust = dust ? mountDust(dust) : () => {}

  const onDown = (event: PointerEvent) => {
    if (!phone.matches || event.button !== 0) return
    if (origins.size === 0) fingerMoved = false
    origins.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }
  const onMove = (event: PointerEvent) => {
    if (!phone.matches || fingerMoved) return
    const origin = origins.get(event.pointerId)
    if (!origin) return
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= 5) return
    fingerMoved = true
    const home = canvas.closest('.home')
    if (!home || home.classList.contains('is-zooming')) return
    home.classList.add('is-looking')
  }
  const onUp = (event: PointerEvent) => {
    if (!phone.matches || event.button !== 0 || !origins.has(event.pointerId)) return
    origins.delete(event.pointerId)
    if (origins.size > 0) return
    const home = canvas.closest('.home')
    if (!home || home.classList.contains('is-zooming') || fingerMoved) return
    home.classList.toggle('is-looking')
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  return () => {
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    canvas.closest('.home')?.classList.remove('is-looking')
    scene.dispose()
    stopDust()
  }
}
