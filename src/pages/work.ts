import { projects, type Project } from '../content/projects.ts'
import { withBase } from '../router.ts'
import { renderShell } from '../ui.ts'
import {
  buildRibbonPoints,
  closestPathSample,
  drawCodedPortal,
  drawInkRibbon,
  sizePxCanvas,
  spawnSparks,
  stepSparks,
  type Spark,
} from './workFx.ts'

/** 1 = Blender speed (24 fps). 0.5 slower, 2 faster. */
const INK_SPEED = 1
/** Extra wobble and thickness jitter on top of the drawn ink. 0 = none, 2 = wild. */
const INK_NOISE = 1
const INK_FPS = 24
const INK_FRAMES = 192
const INK_FRAME_H = 1024
const INK_SRC_X = 120
const INK_SRC_W = 22
const INK_SCALE = 0.72
/** How far the cursor can shove the ink, in pixels. */
const INK_PUSH_REACH = 88
const INK_PUSH_MAX = 34

const months: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

function chapterYear(project: Project) {
  const years = project.year.match(/\d{4}/g)?.map(Number) ?? [0]
  return Math.max(...years)
}

function endStamp(project: Project) {
  const found = [...project.dateLabel.matchAll(/([A-Za-z]+)\s+(\d{4})/g)]
  const last = found.at(-1)
  if (!last) return chapterYear(project) * 12
  const month = months[last[1].toLowerCase()] ?? 6
  return Number(last[2]) * 12 + month
}

function groupedProjects() {
  const sorted = [...projects].sort((a, b) => endStamp(b) - endStamp(a))
  const groups: { year: number; items: Project[] }[] = []
  for (const project of sorted) {
    const year = chapterYear(project)
    const current = groups.at(-1)
    if (current?.year === year) current.items.push(project)
    else groups.push({ year, items: [project] })
  }
  return groups
}

function renderStop(project: Project, index: number) {
  const side = index % 2 === 0 ? 'left' : 'right'
  return `
    <li class="timeline-stop timeline-stop--${side}">
      <a class="timeline-card" href="${withBase(`/work/${project.slug}`)}" data-link data-title="${project.title}">
        <span class="work-year">${project.year}</span>
        <span class="work-title">${project.title}</span>
        <span class="work-type">${project.type}</span>
      </a>
      <span class="timeline-dot" aria-hidden="true"></span>
    </li>
  `
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  let d = `M ${first.x.toFixed(1)} 0`
  d += ` C ${first.x.toFixed(1)} ${(first.y * 0.35).toFixed(1)}, ${first.x.toFixed(1)} ${(first.y * 0.7).toFixed(1)}, ${first.x.toFixed(1)} ${first.y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const mid = (b.y - a.y) / 2
    d += ` C ${a.x.toFixed(1)} ${(a.y + mid).toFixed(1)}, ${b.x.toFixed(1)} ${(b.y - mid).toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
  }
  const bottom = last.y + 120
  d += ` C ${last.x.toFixed(1)} ${(last.y + 36).toFixed(1)}, ${last.x.toFixed(1)} ${(last.y + 56).toFixed(1)}, ${last.x.toFixed(1)} ${bottom.toFixed(1)}`
  return d
}

type SpineSample = { x: number; y: number; nx: number; ny: number; dist: number }

function inkFrameUrl(index: number) {
  return `${import.meta.env.BASE_URL}work/LineAnimation/${String(index).padStart(4, '0')}.png`
}

function loadInkFrames() {
  return Promise.all(
    Array.from({ length: INK_FRAMES }, (_, i) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error(`Missing ink frame ${i + 1}`))
        image.src = inkFrameUrl(i + 1)
      })
    }),
  )
}

function sampleSpine(path: SVGPathElement) {
  const length = path.getTotalLength()
  if (!Number.isFinite(length) || length === 0) return []
  const samples: SpineSample[] = []
  const step = 4
  for (let d = 0; d <= length; d += step) {
    const dist = Math.min(d, length)
    const point = path.getPointAtLength(dist)
    const ahead = path.getPointAtLength(Math.min(dist + 1.5, length))
    const behind = path.getPointAtLength(Math.max(dist - 1.5, 0))
    const dx = ahead.x - behind.x
    const dy = ahead.y - behind.y
    const len = Math.hypot(dx, dy) || 1
    samples.push({ x: point.x, y: point.y, nx: -dy / len, ny: dx / len, dist })
  }
  return samples
}

const profileScratch = document.createElement('canvas')
profileScratch.width = INK_SRC_W
profileScratch.height = INK_FRAME_H
const profileCtx = profileScratch.getContext('2d', { willReadFrequently: true })

function inkProfile(frame: HTMLImageElement) {
  const radii = new Array<number>(INK_FRAME_H).fill(0)
  if (!profileCtx) return radii
  profileCtx.clearRect(0, 0, INK_SRC_W, INK_FRAME_H)
  profileCtx.drawImage(frame, INK_SRC_X, 0, INK_SRC_W, INK_FRAME_H, 0, 0, INK_SRC_W, INK_FRAME_H)
  const data = profileCtx.getImageData(0, 0, INK_SRC_W, INK_FRAME_H).data
  for (let y = 0; y < INK_FRAME_H; y += 1) {
    let min = INK_SRC_W
    let max = -1
    const row = y * INK_SRC_W * 4
    for (let x = 0; x < INK_SRC_W; x += 1) {
      if (data[row + x * 4 + 3] > 16) {
        if (x < min) min = x
        if (x > max) max = x
      }
    }
    radii[y] = max >= 0 ? ((max - min + 1) / 2) * INK_SCALE : 0
  }
  let last = 1.2
  for (let y = 0; y < INK_FRAME_H; y += 1) {
    if (radii[y] > 0) last = radii[y]
    else radii[y] = last
  }
  const smoothed = new Array<number>(INK_FRAME_H)
  const span = 22
  for (let y = 0; y < INK_FRAME_H; y += 1) {
    let sum = 0
    let weight = 0
    for (let k = -span; k <= span; k += 1) {
      const i = Math.min(INK_FRAME_H - 1, Math.max(0, y + k))
      const w = 1 - Math.abs(k) / (span + 1)
      sum += radii[i] * w
      weight += w
    }
    smoothed[y] = sum / weight
  }
  return smoothed
}

export function renderWork() {
  let index = 0
  const body = groupedProjects()
    .map((group) => {
      const stops = group.items.map((project) => renderStop(project, index++)).join('')
      return `
        <li class="timeline-year">
          <span class="timeline-year-mark" aria-hidden="true"></span>
          <span class="timeline-year-label">${group.year + 1}</span>
        </li>
        ${stops}
      `
    })
    .join('')

  return renderShell(`
    <main class="doc doc--work">
      <header class="doc-head">
        <p class="eyebrow">Selected work</p>
        <h1>Projects</h1>
        <p class="lede">Older pieces from the previous site, kept here so the new one has something real in it. Newer work comes next.</p>
      </header>
      <div class="timeline">
        <svg class="timeline-path" aria-hidden="true">
          <path class="timeline-spine" />
        </svg>
        <canvas class="timeline-ink" aria-hidden="true"></canvas>
        <canvas class="timeline-fx" aria-hidden="true"></canvas>
        <canvas class="timeline-portal" width="160" height="50" aria-hidden="true"></canvas>
        <ol class="timeline-list">
          ${body}
        </ol>
      </div>
      <div class="hover-label" hidden></div>
    </main>
  `)
}

export function mountWork(root: HTMLElement) {
  const timeline = root.querySelector<HTMLElement>('.timeline')
  const svg = root.querySelector<SVGSVGElement>('.timeline-path')
  const spine = svg?.querySelector<SVGPathElement>('.timeline-spine')
  const ink = root.querySelector<HTMLCanvasElement>('.timeline-ink')
  const fx = root.querySelector<HTMLCanvasElement>('.timeline-fx')
  const portal = root.querySelector<HTMLCanvasElement>('.timeline-portal')
  const label = root.querySelector<HTMLElement>('.hover-label')
  if (!timeline || !svg || !spine || !ink || !fx || !portal) return () => {}

  const inkCtx = ink.getContext('2d', { willReadFrequently: true })
  const fxCtx = fx.getContext('2d')
  const portalCtx = portal.getContext('2d', { willReadFrequently: true })
  if (!inkCtx || !fxCtx || !portalCtx) return () => {}

  const styles = getComputedStyle(document.documentElement)
  const inkColor = styles.getPropertyValue('--ink').trim() || '#241c16'
  const accentColor = styles.getPropertyValue('--accent').trim() || '#c45c26'

  const narrow = window.matchMedia('(max-width: 720px)')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let samples: SpineSample[] = []
  let frames: HTMLImageElement[] = []
  const profiles: number[][] = []
  const sparks: Spark[] = []
  let raf = 0
  let startedAt = performance.now()
  let lastTick = startedAt
  let cancelled = false
  let lastInkKey = ''
  let mouseX = 0
  let mouseY = 0
  let lastMouseX = 0
  let lastMouseY = 0
  let mouseOn = false
  let hoverCard: HTMLElement | null = null
  let field = new Float32Array(0)
  let fieldVel = new Float32Array(0)
  let scratch = new Float32Array(0)

  function layout() {
    const width = timeline!.clientWidth
    const height = timeline!.scrollHeight
    svg!.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg!.setAttribute('width', String(width))
    svg!.setAttribute('height', String(height))
    sizePxCanvas(ink!, width, height)
    sizePxCanvas(fx!, width, height)

    const mobile = narrow.matches
    const items = [...timeline!.querySelectorAll<HTMLElement>('.timeline-year, .timeline-stop')]
    const points = items.map((el) => {
      const y = el.offsetTop + el.offsetHeight * 0.5
      let x = width * 0.5
      if (el.classList.contains('timeline-stop--left')) x = mobile ? width * 0.11 : width * 0.7
      if (el.classList.contains('timeline-stop--right')) x = mobile ? width * 0.11 : width * 0.3
      if (el.classList.contains('timeline-year')) x = mobile ? width * 0.11 : width * 0.5
      return { el, x, y }
    })

    points.forEach((point, i) => {
      const { el, x, y } = point
      const dot = el.querySelector<HTMLElement>('.timeline-dot')
      if (dot) {
        dot.style.left = `${x}px`
        dot.style.top = `${el.offsetHeight * 0.5}px`
      }
      if (!el.classList.contains('timeline-year')) return
      const prev = points[i - 1] ?? point
      const next = points[i + 1] ?? point
      const tx = next.x - prev.x
      const ty = next.y - prev.y
      const len = Math.hypot(tx, ty) || 1
      let nx = -ty / len
      let ny = tx / len
      const away = mobile || x < width * 0.5 ? -1 : 1
      if (nx * away < 0) {
        nx *= -1
        ny *= -1
      }
      const labelX = x + nx * (mobile ? 64 : 96)
      const labelY = y + ny * (mobile ? 10 : 6)
      el.style.setProperty('--year-line-x', `${x}px`)
      el.style.setProperty('--year-label-x', `${labelX}px`)
      el.style.setProperty('--year-label-y', `${labelY - y}px`)
    })

    spine!.setAttribute('d', smoothPath(points))
    samples = sampleSpine(spine!)
    field = new Float32Array(samples.length)
    fieldVel = new Float32Array(samples.length)
    scratch = new Float32Array(samples.length)
    lastInkKey = ''
    paintLine(performance.now())
  }

  function paintLine(now = performance.now()) {
    const length = spine!.getTotalLength()
    if (!Number.isFinite(length) || length === 0 || samples.length === 0) return

    let drawn = length
    let taperTip = false
    if (!reduceMotion) {
      const rect = timeline!.getBoundingClientRect()
      const view = window.innerHeight
      const travel = Math.max(rect.height * 0.88, 1)
      const t = Math.min(1, Math.max(0, (view * 0.7 - rect.top) / travel))
      drawn = t * length
      taperTip = t < 0.995
    }

    const elapsed = Math.max(0, now - startedAt) / 1000
    const frameIndex =
      frames.length === INK_FRAMES && !reduceMotion
        ? INK_FRAMES - 1 - (Math.floor(elapsed * INK_FPS * INK_SPEED) % INK_FRAMES)
        : 0

    let fieldEnergy = 0
    if (!reduceMotion && field.length === samples.length) {
      if (mouseOn) {
        const vx = mouseX - lastMouseX
        const vy = mouseY - lastMouseY
        for (let i = 0; i < samples.length; i += 1) {
          const sample = samples[i]
          if (sample.dist > drawn) break
          const dx = sample.x - mouseX
          const dy = sample.y - mouseY
          const dist = Math.hypot(dx, dy)
          if (dist > INK_PUSH_REACH) continue
          const falloff = 1 - dist / INK_PUSH_REACH
          const pulse = falloff * falloff
          const away = dx * sample.nx + dy * sample.ny >= 0 ? 1 : -1
          const drag = vx * sample.nx + vy * sample.ny
          fieldVel[i] += pulse * (away * 0.7 + drag * 0.95)
        }
      }
      lastMouseX = mouseX
      lastMouseY = mouseY

      for (let i = 0; i < field.length; i += 1) {
        const left = field[i > 0 ? i - 1 : i]
        const right = field[i < field.length - 1 ? i + 1 : i]
        scratch[i] = field[i] * 0.4 + left * 0.3 + right * 0.3
      }
      field.set(scratch)
      for (let i = 0; i < field.length; i += 1) {
        fieldVel[i] += -field[i] * 0.038
        fieldVel[i] *= 0.9
        field[i] += fieldVel[i]
        if (field[i] > INK_PUSH_MAX) field[i] = INK_PUSH_MAX
        if (field[i] < -INK_PUSH_MAX) field[i] = -INK_PUSH_MAX
        fieldEnergy += Math.abs(field[i])
      }
    }

    const noiseTick = reduceMotion ? 0 : Math.floor(elapsed * 36)
    const inkKey = `${frameIndex}:${drawn.toFixed(1)}:${frames.length}:${noiseTick}:${fieldEnergy.toFixed(1)}`
    if (inkKey !== lastInkKey || sparks.length > 0) {
      lastInkKey = inkKey
      if (frames.length === INK_FRAMES) {
        if (!profiles[frameIndex]) profiles[frameIndex] = inkProfile(frames[frameIndex])
        const ribbon = buildRibbonPoints(
          samples,
          drawn,
          taperTip,
          profiles[frameIndex],
          reduceMotion ? 0 : elapsed,
          field,
          {
            frameH: INK_FRAME_H,
            scale: INK_SCALE,
            noise: INK_NOISE,
            pushMax: INK_PUSH_MAX,
          },
        )
        drawInkRibbon(
          inkCtx!,
          ribbon.left,
          ribbon.right,
          inkColor,
          reduceMotion ? 0 : elapsed,
          sparks,
          accentColor,
        )
      }
    }

    const tip = spine!.getPointAtLength(Math.min(drawn, length))
    if (drawn > 40) {
      portal!.hidden = false
      portal!.style.left = `${tip.x}px`
      portal!.style.top = `${tip.y + 10}px`
      drawCodedPortal(portalCtx!, reduceMotion ? 0 : elapsed, inkColor, accentColor)
    } else {
      portal!.hidden = true
    }

    timeline!.querySelectorAll<HTMLElement>('.timeline-stop, .timeline-year').forEach((el) => {
      const arrived = reduceMotion || el.offsetTop + el.offsetHeight * 0.5 <= tip.y + 28
      el.classList.toggle('is-in', arrived)
      const dot = el.querySelector<HTMLElement>('.timeline-dot')
      if (dot) dot.style.opacity = arrived ? '1' : '0'
    })
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - lastTick) / 1000)
    lastTick = now
    if (!reduceMotion && hoverCard) {
      const origin = sparkOrigin(hoverCard)
      if (origin && Math.random() < 0.2) spawnSparks(sparks, samples, origin.dist, 1)
    }
    if (!reduceMotion) {
      stepSparks(sparks, samples, dt, (now - startedAt) / 1000)
    }
    paintLine(now)
    raf = requestAnimationFrame(tick)
  }

  function onPointerMove(event: PointerEvent) {
    const rect = timeline!.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (!mouseOn) {
      lastMouseX = x
      lastMouseY = y
    }
    mouseX = x
    mouseY = y
    mouseOn =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom

    if (label && hoverCard) {
      label.hidden = false
      label.textContent = hoverCard.dataset.title ?? ''
      label.style.left = `${event.clientX + 14}px`
      label.style.top = `${event.clientY + 14}px`
    }
  }

  function onPointerLeave() {
    mouseOn = false
  }

  function sparkOrigin(card: HTMLElement) {
    const stop = card.parentElement
    if (!stop) return null
    const dot = stop.querySelector<HTMLElement>('.timeline-dot')
    const x = Number.parseFloat(dot?.style.left || '')
    if (!Number.isFinite(x)) return null
    const y = stop.offsetTop + stop.offsetHeight * 0.5
    const sample = closestPathSample(samples, x, y)
    if (!sample) return null
    return { x, y, dist: sample.dist }
  }

  function onCardEnter(event: PointerEvent) {
    const card = event.currentTarget as HTMLElement
    hoverCard = card
    const origin = sparkOrigin(card)
    if (!reduceMotion && origin) spawnSparks(sparks, samples, origin.dist, 11)
    if (label) {
      label.hidden = false
      label.textContent = card.dataset.title ?? ''
    }
  }

  function onCardLeave() {
    hoverCard = null
    if (label) label.hidden = true
  }

  function onScroll() {
    if (reduceMotion || !raf) paintLine()
  }

  const cards = [...timeline.querySelectorAll<HTMLElement>('.timeline-card')]
  for (const card of cards) {
    card.addEventListener('pointerenter', onCardEnter)
    card.addEventListener('pointerleave', onCardLeave)
  }

  const observer = new ResizeObserver(layout)
  observer.observe(timeline)
  narrow.addEventListener('change', layout)
  const doc = root.querySelector('.doc')
  doc?.addEventListener('animationend', layout)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave)
  requestAnimationFrame(layout)

  loadInkFrames()
    .then((loaded) => {
      if (cancelled) return
      frames = loaded
      startedAt = performance.now()
      lastTick = startedAt
      lastInkKey = ''
      paintLine(startedAt)
      if (!raf) raf = requestAnimationFrame(tick)
    })
    .catch(() => {})

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    observer.disconnect()
    narrow.removeEventListener('change', layout)
    doc?.removeEventListener('animationend', layout)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerleave', onPointerLeave)
    for (const card of cards) {
      card.removeEventListener('pointerenter', onCardEnter)
      card.removeEventListener('pointerleave', onCardLeave)
    }
  }
}
