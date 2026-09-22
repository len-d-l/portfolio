import { projects, type Project } from '../content/projects.ts'
import { withBase } from '../router.ts'
import { renderShell } from '../ui.ts'
import {
  buildRibbonPoints,
  closestPathSample,
  drawCodedPortal,
  drawInkRibbon,
  sizePxCanvas,
  knockSparks,
  spawnCutDebris,
  spawnSparks,
  stepDebris,
  stepSparks,
  KNOT_HEART,
  type Debris,
  type KnotSite,
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
/** How close the cursor must be to the ink to cut it, in pixels. */
const INK_HIT_RADIUS = 38
/** Minimum cursor speed (px/s) before a pass breaks the line. */
const INK_CUT_SPEED = 42
/** Path pixels healed per second, from the portal upward. */
const INK_HEAL_PX = 260
/** Keep the whole oval on-screen; CSS box is 82px tall, centered on the tip. */
const PORTAL_PAD = 52
/** Hide on-line marks as they enter the oval, not after the tip has passed. */
const LINE_MARK_PAD = 26
/** Seconds for a knot to wrap in after the line reaches it. */
const KNOT_FORM_SEC = 1.15
/** Seconds to unwind a knot when the line leaves or is cut. */
const KNOT_UNWIND_SEC = 0.42
/** Line may start the knot this many path pixels before the stop center. */
const KNOT_LEAD = 18
/** Path span around a stop that counts as cutting the knot. */
const KNOT_WOUND_SPAN = 52
/** Seconds for a knot heart to grow in on hover. */
const HEART_IN_SEC = 0.55
/** Seconds for a knot heart to shrink out when hover ends. */
const HEART_OUT_SEC = 0.38

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

function inkFrameUrl(fileIndex: number) {
  return `${import.meta.env.BASE_URL}work/LineAnimation/${String(fileIndex).padStart(4, '0')}.png`
}

const inkProfiles: (number[] | undefined)[] = Array.from({ length: INK_FRAMES })
let inkLoad: Promise<void> | null = null
const inkWaiters: Array<() => void> = []

function notifyInk() {
  if (!inkProfiles[0]) return
  const pending = inkWaiters.splice(0)
  for (const wait of pending) wait()
}

function inkProfileAt(index: number) {
  const hit = inkProfiles[index]
  if (hit) return hit
  for (let i = 1; i < INK_FRAMES; i += 1) {
    const next = inkProfiles[index + i]
    if (next) return next
    const prev = inkProfiles[index - i]
    if (prev) return prev
  }
  return inkProfiles[0]
}

function yieldFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function ingestInkFrame(index: number) {
  if (inkProfiles[index]) return
  try {
    const blob = await fetch(inkFrameUrl(index + 1)).then((res) => {
      if (!res.ok) throw new Error(`Missing ink frame ${index + 1}`)
      return res.blob()
    })
    const bitmap = await createImageBitmap(blob)
    inkProfiles[index] = inkProfile(bitmap)
    bitmap.close()
    notifyInk()
  } catch {
    /* keep using the nearest ready profile */
  }
}

export function preloadWorkInk() {
  if (inkLoad) return inkLoad
  inkLoad = (async () => {
    await ingestInkFrame(0)
    const order: number[] = []
    for (let i = INK_FRAMES - 1; i >= 1; i -= 1) order.push(i)
    const batch = 3
    for (let i = 0; i < order.length; i += batch) {
      await Promise.all(order.slice(i, i + batch).map((index) => ingestInkFrame(index)))
      await yieldFrame()
    }
  })()
  return inkLoad
}

function onFirstInkProfile(fn: () => void) {
  if (inkProfiles[0]) fn()
  else inkWaiters.push(fn)
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

function inkProfile(frame: CanvasImageSource) {
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

  const inkCtx = ink.getContext('2d', { alpha: true })
  const fxCtx = fx.getContext('2d', { alpha: true })
  const portalCtx = portal.getContext('2d', { alpha: true })
  if (!inkCtx || !fxCtx || !portalCtx) return () => {}

  const styles = getComputedStyle(document.documentElement)
  const inkColor = styles.getPropertyValue('--ink').trim() || '#241c16'
  const accentColor = styles.getPropertyValue('--accent').trim() || '#c45c26'

  const narrow = window.matchMedia('(max-width: 720px)')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let samples: SpineSample[] = []
  const sparks: Spark[] = []
  const debris: Debris[] = []
  let raf = 0
  let startedAt = performance.now()
  let lastTick = startedAt
  let playbackAt = 0
  let cancelled = false
  let lastInkKey = ''
  let layoutW = 0
  let layoutH = 0
  let mouseX = 0
  let mouseY = 0
  let prevCutX = 0
  let prevCutY = 0
  let mouseOn = false
  let hoverCard: HTMLElement | null = null
  let wounds = new Float32Array(0)
  let drawnLen = 0
  let tipX = 0
  let tipY = 0
  let lastTipY = Number.NEGATIVE_INFINITY
  let marks: HTMLElement[] = []
  let knotStops: { el: HTMLElement; x: number; y: number; dist: number }[] = []
  let knotGrow: number[] = []
  let knotGone: boolean[] = []
  let knotHeart: number[] = []
  let heartBurst: boolean[] = []

  function layout() {
    const width = timeline!.clientWidth
    const height = timeline!.scrollHeight
    if (width === layoutW && height === layoutH && samples.length > 0) {
      paintLine(performance.now())
      return
    }
    layoutW = width
    layoutH = height
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
    wounds = new Float32Array(samples.length)
    marks = [...timeline!.querySelectorAll<HTMLElement>('.timeline-stop, .timeline-year')]
    knotStops = points
      .filter((point) => point.el.classList.contains('timeline-stop'))
      .map((point) => ({
        el: point.el,
        x: point.x,
        y: point.y,
        dist: closestPathSample(samples, point.x, point.y)?.dist ?? 0,
      }))
    if (knotGrow.length !== knotStops.length) {
      knotGrow = knotStops.map(() => 0)
      knotGone = knotStops.map(() => false)
      knotHeart = knotStops.map(() => 0)
      heartBurst = knotStops.map(() => false)
    }
    lastInkKey = ''
    paintLine(performance.now())
  }

  function paintLine(now = performance.now()) {
    const length = spine!.getTotalLength()
    if (!Number.isFinite(length) || length === 0 || samples.length === 0) return

    refreshDrawn()
    const drawn = drawnLen
    const advancing = tipY + 0.5 >= lastTipY

    const knots: KnotSite[] = []
    for (let i = 0; i < knotStops.length; i += 1) {
      const grow = knotGrow[i] ?? 0
      if (grow <= 0.02) continue
      const stop = knotStops[i]
      const card = stop.el.querySelector<HTMLElement>('.timeline-card')
      knots.push({
        x: stop.x,
        y: stop.y,
        dist: stop.dist,
        lit: Boolean(card && (card === hoverCard || card === document.activeElement)),
        grow,
        heart: knotHeart[i] ?? 0,
      })
    }

    const lastFrame = INK_FRAMES - 1
    const canPlay = Boolean(inkProfiles[lastFrame]) && !reduceMotion
    if (canPlay && playbackAt === 0) playbackAt = now
    const playElapsed = playbackAt ? Math.max(0, now - playbackAt) / 1000 : 0
    const elapsed = Math.max(0, now - startedAt) / 1000
    const frameIndex = canPlay
      ? lastFrame - (Math.floor(playElapsed * INK_FPS * INK_SPEED) % INK_FRAMES)
      : 0

    let woundEnergy = 0
    if (wounds.length === samples.length) {
      for (let i = 0; i < wounds.length; i += 1) woundEnergy += wounds[i]
    }

    const noiseTick = reduceMotion ? 0 : Math.floor(elapsed * 36)
    const litKey = knots.some((knot) => knot.heart > 0.02) ? '1' : '0'
    const growKey = knots.reduce((sum, knot) => sum + knot.grow, 0).toFixed(2)
    const heartKey = knots.reduce((sum, knot) => sum + knot.heart, 0).toFixed(3)
    const inkKey = `${frameIndex}:${drawn.toFixed(1)}:${noiseTick}:${woundEnergy.toFixed(2)}:${debris.length}:${knots.length}:${litKey}:${growKey}:${heartKey}`
    if (inkKey !== lastInkKey || sparks.length > 0 || debris.length > 0 || litKey === '1') {
      lastInkKey = inkKey
      const profile = inkProfileAt(frameIndex)
      if (profile) {
        const ribbon = buildRibbonPoints(
          samples,
          drawn,
          profile,
          reduceMotion ? 0 : elapsed,
          wounds,
          {
            frameH: INK_FRAME_H,
            scale: INK_SCALE,
            noise: INK_NOISE,
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
          debris,
          ribbon.cuts,
          knots,
        )
      }
    }

    if (drawn > 40) {
      portal!.hidden = false
      portal!.style.left = `${tipX}px`
      portal!.style.top = `${tipY}px`
      drawCodedPortal(portalCtx!, reduceMotion ? 0 : elapsed, inkColor, accentColor)
    } else {
      portal!.hidden = true
    }

    marks.forEach((el) => {
      const y = el.offsetTop + el.offsetHeight * 0.5
      const onLine = reduceMotion || y <= tipY - (advancing ? 0 : LINE_MARK_PAD)
      el.classList.toggle('is-in', onLine)
      el.querySelector<HTMLElement>('.timeline-dot')?.classList.toggle('is-on', onLine)
    })
    lastTipY = tipY
  }

  function knotWoundAt(dist: number) {
    if (wounds.length !== samples.length) return 0
    let max = 0
    for (let i = 0; i < samples.length; i += 1) {
      if (Math.abs(samples[i].dist - dist) > KNOT_WOUND_SPAN) continue
      if (wounds[i] > max) max = wounds[i]
    }
    return max
  }

  function knotIndexAt(dist: number) {
    let best = -1
    let bestGap = 48
    for (let i = 0; i < knotStops.length; i += 1) {
      const sample = closestPathSample(samples, knotStops[i].x, knotStops[i].y)
      if (!sample) continue
      const gap = Math.abs(sample.dist - dist)
      if (gap < bestGap) {
        bestGap = gap
        best = i
      }
    }
    return best
  }

  function knotHeartReady(dist: number) {
    const i = knotIndexAt(dist)
    if (i < 0) return true
    return (knotGrow[i] ?? 0) > KNOT_HEART && (knotHeart[i] ?? 0) > 0.28 && !knotGone[i]
  }

  function cullDeadKnotSparks() {
    if (sparks.length === 0) return
    for (let i = 0; i < knotStops.length; i += 1) {
      if ((knotGrow[i] ?? 0) > KNOT_HEART && !knotGone[i]) continue
      const dist = knotStops[i].dist
      for (let s = sparks.length - 1; s >= 0; s -= 1) {
        if (Math.abs(sparks[s].home - dist) < 56) sparks.splice(s, 1)
      }
    }
  }

  function stepKnotGrow(dt: number) {
    if (knotGrow.length !== knotStops.length) {
      knotGrow = knotStops.map(() => 0)
      knotGone = knotStops.map(() => false)
      knotHeart = knotStops.map(() => 0)
      heartBurst = knotStops.map(() => false)
    }
    for (let i = 0; i < knotStops.length; i += 1) {
      const stop = knotStops[i]
      let target = 0
      let maxWound = knotWoundAt(stop.dist)
      if (reduceMotion) {
        target = stop.dist <= drawnLen ? 1 : 0
      } else if (drawnLen + KNOT_LEAD >= stop.dist) {
        target = 1
      }
      if (maxWound > 0.55) target = 0
      else if (maxWound > 0.18) target *= Math.max(0, 1 - maxWound)
      if (reduceMotion) {
        knotGrow[i] = target
        knotGone[i] = target <= 0
        continue
      }
      let cur = knotGrow[i] ?? 0
      if (maxWound > 0.55) {
        cur = 0
        knotGone[i] = true
      }
      if (cur <= 0.02 && target < 0.5) knotGone[i] = true
      if (knotGone[i]) {
        const healthy = maxWound <= 0.12
        if (!healthy || target < 1) {
          knotGrow[i] = 0
          knotHeart[i] = 0
          heartBurst[i] = false
          continue
        }
        knotGone[i] = false
        cur = 0
      }
      const sec = target > cur ? KNOT_FORM_SEC : KNOT_UNWIND_SEC
      const step = dt / sec
      knotGrow[i] = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step)
    }
  }

  function stepKnotHeart(dt: number) {
    if (knotHeart.length !== knotStops.length) {
      knotHeart = knotStops.map(() => 0)
      heartBurst = knotStops.map(() => false)
    }
    for (let i = 0; i < knotStops.length; i += 1) {
      const card = knotStops[i].el.querySelector<HTMLElement>('.timeline-card')
      const want =
        !knotGone[i] &&
        (knotGrow[i] ?? 0) > 0.05 &&
        Boolean(card && (card === hoverCard || card === document.activeElement))
      const target = want ? 1 : 0
      if (reduceMotion) {
        knotHeart[i] = target
        continue
      }
      const cur = knotHeart[i] ?? 0
      const sec = target > cur ? HEART_IN_SEC : HEART_OUT_SEC
      const step = dt / sec
      const next = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step)
      knotHeart[i] = next
      if (target < 1) heartBurst[i] = false
      else if (!heartBurst[i] && next > 0.28 && (knotGrow[i] ?? 0) > KNOT_HEART) {
        heartBurst[i] = true
        const sample = closestPathSample(samples, knotStops[i].x, knotStops[i].y)
        if (sample && sample.dist <= drawnLen) spawnSparks(sparks, samples, sample.dist, 11)
      }
    }
  }

  function tick(now: number) {
    const dt = Math.min(1 / 30, (now - lastTick) / 1000)
    lastTick = now
    refreshDrawn()
    if (!reduceMotion) {
      applyCut(dt)
      healWounds(dt)
      stepKnotGrow(dt)
      stepKnotHeart(dt)
      if (hoverCard) {
        const origin = sparkOrigin(hoverCard)
        if (origin && origin.dist <= drawnLen && knotHeartReady(origin.dist) && Math.random() < 0.2) {
          spawnSparks(sparks, samples, origin.dist, 1)
        }
      }
      stepSparks(sparks, samples, dt, (now - startedAt) / 1000, drawnLen)
      stepDebris(debris, dt)
    } else {
      stepKnotGrow(dt)
      stepKnotHeart(dt)
    }
    cullDeadKnotSparks()
    paintLine(now)
    raf = requestAnimationFrame(tick)
  }

  function refreshDrawn() {
    if (samples.length === 0) {
      drawnLen = 0
      return
    }
    const last = samples[samples.length - 1]
    const first = samples[0]
    if (reduceMotion) {
      drawnLen = last.dist
      tipX = last.x
      tipY = last.y
      return
    }
    const rect = timeline!.getBoundingClientRect()
    const view = window.visualViewport
    const viewBottom = (view?.offsetTop ?? 0) + (view?.height ?? window.innerHeight)
    const yTarget = viewBottom - rect.top - PORTAL_PAD
    if (yTarget <= first.y) {
      drawnLen = Math.max(first.dist, 8)
      tipX = first.x
      tipY = first.y
      return
    }
    if (yTarget >= last.y) {
      drawnLen = last.dist
      tipX = last.x
      tipY = last.y
      return
    }
    let lo = 0
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].y <= yTarget) lo = i
      else break
    }
    const a = samples[lo]
    const b = samples[Math.min(lo + 1, samples.length - 1)]
    const span = b.y - a.y
    const u = span <= 0.001 ? 1 : Math.min(1, Math.max(0, (yTarget - a.y) / span))
    drawnLen = a.dist + (b.dist - a.dist) * u
    tipX = a.x + (b.x - a.x) * u
    tipY = a.y + (b.y - a.y) * u
  }

  function healWounds(dt: number) {
    if (wounds.length !== samples.length) return
    const step = INK_HEAL_PX * dt
    for (let i = wounds.length - 1; i >= 0; i -= 1) {
      if (samples[i].dist > drawnLen) {
        wounds[i] = 0
        continue
      }
      if (wounds[i] <= 0.001) {
        wounds[i] = 0
        continue
      }
      const belowHealthy =
        i + 1 >= wounds.length ||
        samples[i + 1].dist > drawnLen ||
        wounds[i + 1] <= 0.001
      if (!belowHealthy) continue
      const spacing = i > 0 ? Math.max(1, samples[i].dist - samples[i - 1].dist) : 4
      const remain = wounds[i] * spacing
      const take = Math.min(step, remain)
      wounds[i] = take >= remain ? 0 : wounds[i] * (1 - take / remain)
    }
  }

  function applyCut(dt: number) {
    if (!mouseOn || samples.length === 0 || wounds.length !== samples.length) {
      prevCutX = mouseX
      prevCutY = mouseY
      return
    }
    const ax = prevCutX
    const ay = prevCutY
    const bx = mouseX
    const by = mouseY
    prevCutX = mouseX
    prevCutY = mouseY
    const sx = bx - ax
    const sy = by - ay
    const seg = Math.hypot(sx, sy)
    if (seg < 0.6) return
    const speed = seg / Math.max(dt, 0.001)
    if (speed < INK_CUT_SPEED) return
    const vx = sx / Math.max(dt, 0.001)
    const vy = sy / Math.max(dt, 0.001)

    const amount = 0.48 + Math.min(0.5, speed / 1100)
    let removed = 0
    const hits: { sample: SpineSample; pulse: number }[] = []
    const tip = Math.max(0, drawnLen - 10)
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i]
      if (sample.dist > tip) continue
      const gap = distPointSeg(sample.x, sample.y, ax, ay, bx, by)
      if (gap > INK_HIT_RADIUS) continue
      const pulse = (1 - gap / INK_HIT_RADIUS) ** 2
      const add = amount * pulse
      let took = 0
      for (let k = -4; k <= 4; k += 1) {
        const j = i + k
        if (j < 0 || j >= wounds.length) continue
        if (samples[j].dist > tip) continue
        const fall = 1 - Math.abs(k) / 5
        const prev = wounds[j]
        wounds[j] = Math.min(1, prev + add * fall)
        took += wounds[j] - prev
      }
      removed += took
      if (took > 0) hits.push({ sample, pulse })
    }
    const bits =
      removed <= 0 || hits.length === 0 ? 0 : Math.min(90, Math.max(8, Math.ceil(removed * 8)))
    if (bits > 0) {
      let sideAcc = 0
      for (const hit of hits) sideAcc += vx * hit.sample.nx + vy * hit.sample.ny
      const side = sideAcc >= 0 ? 1 : -1
      for (let b = 0; b < bits; b += 1) {
        const hit = hits[b % hits.length]
        const sample = hit.sample
        const peel = side * (Math.random() < 0.18 ? -1 : 1)
        const lift = 6 + Math.random() * 16
        const along = (Math.random() - 0.5) * 18
        spawnCutDebris(
          debris,
          sample.x + sample.nx * peel * lift + sample.ny * along,
          sample.y + sample.ny * peel * lift - sample.nx * along,
          vx,
          vy,
          1,
          0,
          sample.nx * peel,
          sample.ny * peel,
        )
      }
    }
    knockSparks(sparks, debris, ax, ay, bx, by, vx, vy, INK_HIT_RADIUS + 8)
  }

  function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const abx = bx - ax
    const aby = by - ay
    const apx = px - ax
    const apy = py - ay
    const ab2 = abx * abx + aby * aby
    const t = ab2 <= 0.0001 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))
    const qx = ax + abx * t
    const qy = ay + aby * t
    return Math.hypot(px - qx, py - qy)
  }

  function onPointerMove(event: PointerEvent) {
    const rect = timeline!.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (!mouseOn) {
      prevCutX = x
      prevCutY = y
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
    if (reduceMotion && origin && origin.dist <= drawnLen && knotHeartReady(origin.dist)) {
      spawnSparks(sparks, samples, origin.dist, 11)
    }
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
  if (samples.length === 0) layout()
  narrow.addEventListener('change', layout)
  const doc = root.querySelector('.doc')
  doc?.addEventListener('animationend', layout)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave)

  void preloadWorkInk()
  onFirstInkProfile(() => {
    if (cancelled) return
    startedAt = performance.now()
    lastTick = startedAt
    lastInkKey = ''
    paintLine(startedAt)
    if (!raf) raf = requestAnimationFrame(tick)
  })

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
