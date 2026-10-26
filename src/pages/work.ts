import { cropStyle, imageFocus } from '../content/focus.ts'
import { orderedImages } from '../content/order.ts'
import { disciplines, mediaUrl, projectsNewestFirst, projectYear, type Discipline, type Project } from '../content/projects.ts'
import { ditherCover, ditherEntrance, ditherFeather, onFirstView, type DitherCover } from '../dither.ts'
import { mountDeskObjects } from '../fx/deskObjects.ts'
import { scrambleOnView } from '../fx/scramble.ts'
import { withBase } from '../router.ts'
import { bindLinks, renderShell } from '../ui.ts'

type Filter = Discipline | 'all'

const cycleLimit = 5
const cycleEvery = 1150

function esc(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function visibleProjects(filter: Filter) {
  const all = projectsNewestFirst()
  return filter === 'all' ? all : all.filter((project) => project.disciplines.includes(filter))
}

function cover(project: Project, eager: boolean) {
  const first = orderedImages(project)[0]
  if (!first) return `<span class="work-plate">${esc(project.type)}</span>`
  return `<img class="work-img is-shown" src="${mediaUrl(project, first.file)}" data-file="${esc(first.file)}" style="${cropStyle(imageFocus(project, first.file))}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
}

function renderCard(project: Project, kind: 'feature' | 'chapter', kicker: string, flipped = false) {
  return `
    <a class="work-card work-card--${kind}${flipped ? ' is-flipped' : ''}" href="${withBase(`/work/${project.slug}`)}" data-link data-slug="${project.slug}">
      <span class="work-frame">${cover(project, kind === 'feature')}</span>
      <span class="work-copy">
        ${project.desk ? `<span class="desk-object" data-slug="${project.slug}" aria-hidden="true"></span>` : ''}
        <span class="work-kicker">${kicker}</span>
        <span class="work-name">${esc(project.title)}</span>
        ${kind === 'feature' ? `<span class="work-meta">${esc(project.type)} · ${project.tools.map(esc).join(' · ')}</span>` : ''}
        <span class="work-role">${esc(project.role)}</span>
        <span class="work-open">Open project <span aria-hidden="true">→</span></span>
      </span>
    </a>
  `
}

function renderDivider(number: number, total: number) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `
    <div class="work-divider" aria-hidden="true">
      <span>${pad(number)} / ${pad(total)}</span>
      <span class="work-divider-line"></span>
    </div>
  `
}

function renderBody(filter: Filter) {
  const list = visibleProjects(filter)
  const [featured, ...rest] = list
  if (!featured) return '<p class="work-empty">Nothing here yet.</p>'
  const lead = filter === 'all' ? `Latest · ${projectYear(featured)}` : `Newest in ${filter} · ${projectYear(featured)}`
  const chapters = rest
    .map(
      (project, index) =>
        `${renderDivider(index + 2, list.length)}${renderCard(project, 'chapter', String(projectYear(project)), index % 2 === 1)}`,
    )
    .join('')
  const others = rest.length ? `<div class="work-chapters">${chapters}</div>` : ''
  return `${renderDivider(1, list.length)}${renderCard(featured, 'feature', lead)}${others}`
}

function renderTools(filter: Filter) {
  const all = projectsNewestFirst()
  const chip = (value: Filter, label: string, count: number) =>
    `<button type="button" class="chip" data-filter="${value}" aria-pressed="${filter === value}">${label}<span>${count}</span></button>`
  const chips = [
    chip('all', 'All', all.length),
    ...disciplines.map((discipline) => chip(discipline, discipline, all.filter((project) => project.disciplines.includes(discipline)).length)),
  ].join('')
  return `
    <div class="work-tools">
      <div class="work-filters" role="group" aria-label="Filter by discipline">${chips}</div>
    </div>
  `
}

export function renderWork() {
  return `${renderShell(`
    <main class="doc doc--work">
      <header class="doc-head">
        <p class="eyebrow">Work</p>
        <h1>Projects</h1>
        <p class="lede">Games, 3D models and graphic work, newest first.</p>
        ${renderTools('all')}
      </header>
      <div class="work-body">${renderBody('all')}</div>
    </main>
  `)}
    <nav class="work-rail" aria-label="Project index"></nav>`
}

/** The cover dither behind each preview frame, so the crop tool can repaint it. */
const frameDithers = new WeakMap<HTMLElement, DitherCover>()

/** Hover a card: the dither dissolves, then the frame cycles through a few more stills. */
function enhanceCard(card: HTMLElement, project: Project, fine: boolean, onDraw?: () => void) {
  const frame = card.querySelector<HTMLElement>('.work-frame')
  const first = frame?.querySelector<HTMLImageElement>('img')
  if (!frame || !first) return { reveal: () => {}, enter: () => {}, stop: () => {} }
  const columns = card.classList.contains('work-card--feature') ? 300 : 190
  const dither = ditherCover(frame, first, columns, 'frame', 0, imageFocus(project, first.dataset.file ?? ''))
  if (onDraw) dither.shown(onDraw)
  const entrance = ditherEntrance(frame, dither)
  frameDithers.set(frame, dither)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const stills = [first]
  let timer = 0
  let shown = 0

  const ensureStills = () => {
    if (stills.length > 1) return
    orderedImages(project).slice(1, cycleLimit).forEach((image) => {
      const img = document.createElement('img')
      img.className = 'work-img'
      img.src = mediaUrl(project, image.file)
      img.dataset.file = image.file
      img.style.cssText = cropStyle(imageFocus(project, image.file))
      img.alt = ''
      img.decoding = 'async'
      frame.insertBefore(img, frame.querySelector('.work-dither'))
      stills.push(img)
    })
  }

  const showStill = (index: number) => {
    shown = index
    stills.forEach((img, at) => img.classList.toggle('is-shown', at === index))
  }

  const reveal = (on: boolean) => {
    entrance.wake()
    dither.set(on ? 0 : 1)
    window.clearInterval(timer)
    timer = 0
    if (!on) {
      showStill(0)
      return
    }
    if (!fine || still || orderedImages(project).length < 2) return
    ensureStills()
    timer = window.setInterval(() => {
      if (document.documentElement.classList.contains('is-cropping')) return
      const next = (shown + 1) % stills.length
      if (stills[next].complete) showStill(next)
    }, cycleEvery)
  }

  if (fine) {
    card.addEventListener('pointerenter', () => reveal(true))
    card.addEventListener('pointerleave', () => reveal(false))
    card.addEventListener('focus', () => reveal(true))
    card.addEventListener('blur', () => reveal(false))
  }

  return {
    reveal,
    enter: entrance.enter,
    stop() {
      window.clearInterval(timer)
      dither.stop()
    },
  }
}

function renderRail(list: Project[]) {
  return list
    .map(
      (project, index) => `
        <a href="${withBase(`/work/${project.slug}`)}" data-jump="${project.slug}">
          <span class="work-rail-num">${String(index + 1).padStart(2, '0')}</span>
          <span class="work-rail-name">${esc(project.title)}</span>
        </a>
      `,
    )
    .join('')
}

export function mountWork(root: HTMLElement) {
  const body = root.querySelector<HTMLElement>('.work-body')
  const tools = root.querySelector<HTMLElement>('.work-tools')
  const rail = root.querySelector<HTMLElement>('.work-rail')
  if (!body || !tools || !rail) return () => {}
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const byslug = new Map(projectsNewestFirst().map((project) => [project.slug, project]))
  let filter: Filter = 'all'
  let cleanup: (() => void)[] = []

  const setActive = (slug: string) => {
    rail.querySelectorAll<HTMLElement>('[data-jump]').forEach((link) => {
      if (link.dataset.jump === slug) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    })
  }

  const onRail = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-jump]') : null
    if (!link) return
    event.preventDefault()
    const target = body.querySelector<HTMLElement>(`[data-slug="${link.dataset.jump}"]`)
    if (!target) return
    const top = target.getBoundingClientRect().top + window.scrollY - 120
    window.scrollTo({ top, behavior: still ? 'auto' : 'smooth' })
  }

  const enhance = () => {
    cleanup.forEach((stop) => stop())
    cleanup = []
    const reveals = new Map<Element, (on: boolean) => void>()
    const entrances = new Map<Element, () => void>()
    const list = visibleProjects(filter)
    rail.innerHTML = renderRail(list)
    if (list[0]) setActive(list[0].slug)

    let railIn = false
    const playRail = () => {
      if (railIn || still) return
      railIn = true
      rail.classList.add('is-in')
    }

    body.querySelectorAll<HTMLElement>('.work-card').forEach((card) => {
      const project = byslug.get(card.dataset.slug ?? '')
      if (!project) return
      const enhanced = enhanceCard(card, project, fine, playRail)
      reveals.set(card, enhanced.reveal)
      entrances.set(card, enhanced.enter)
      cleanup.push(enhanced.stop)
    })

    body.querySelectorAll<HTMLElement>('.work-frame').forEach((frame) => cleanup.push(ditherFeather(frame)))
    cleanup.push(mountDeskObjects(body))
    cleanup.push(onFirstView(entrances.keys(), (element) => entrances.get(element)?.()))

    if (!fine) {
      const observer = new IntersectionObserver(
        (entries) => entries.forEach((entry) => reveals.get(entry.target)?.(entry.isIntersecting)),
        { rootMargin: '-30% 0px -30% 0px' },
      )
      reveals.forEach((_, element) => observer.observe(element))
      cleanup.push(() => observer.disconnect())
    }

    const spy = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((entry) => entry.isIntersecting).at(-1)
        const slug = hit?.target instanceof HTMLElement ? hit.target.dataset.slug : undefined
        if (slug) setActive(slug)
      },
      { rootMargin: '-42% 0px -42% 0px' },
    )
    body.querySelectorAll('[data-slug]').forEach((element) => spy.observe(element))
    cleanup.push(() => spy.disconnect())
    cleanup.push(scrambleOnView(body, '.work-kicker, .work-divider > span:first-child'))
  }

  const rerender = () => {
    body.innerHTML = renderBody(filter)
    bindLinks(body)
    tools.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter))
    })
    enhance()
    if (!still) {
      body.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
  }

  const onTool = (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
    if (!button) return
    if (button.dataset.filter && button.dataset.filter !== filter) {
      filter = button.dataset.filter as Filter
      rerender()
    }
  }

  tools.addEventListener('click', onTool)
  rail.addEventListener('click', onRail)
  enhance()

  let stopFocusTool = () => {}
  let unmounted = false
  if (import.meta.env.DEV) {
    void import('../dev/focusTool.ts').then(({ mountFocusTool }) => {
      if (unmounted) return
      stopFocusTool = mountFocusTool(body, (frame, img, focus) => {
        if (img === frame.querySelector('.work-img')) frameDithers.get(frame)?.refocus(focus)
      })
    })
  }

  return () => {
    unmounted = true
    stopFocusTool()
    tools.removeEventListener('click', onTool)
    rail.removeEventListener('click', onRail)
    cleanup.forEach((stop) => stop())
  }
}
