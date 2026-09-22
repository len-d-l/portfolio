export const PSX_PIXEL = 3

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export type Pt = { x: number; y: number }

export type Spark = {
  dist: number
  home: number
  side: number
  weave: number
  phase: number
  speed: number
  life: number
  max: number
  kind: 0 | 1 | 2
  x: number
  y: number
  prevX: number
  prevY: number
  hasPrev: boolean
}

function snap(n: number) {
  return Math.round(n / PSX_PIXEL) * PSX_PIXEL
}

function pushUnique(list: Pt[], point: Pt) {
  const last = list.at(-1)
  if (last && last.x === point.x && last.y === point.y) return
  list.push(point)
}

export function sizePxCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const pw = Math.max(1, Math.ceil(width / PSX_PIXEL))
  const ph = Math.max(1, Math.ceil(height / PSX_PIXEL))
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}

export function buildRibbonPoints(
  samples: { x: number; y: number; nx: number; ny: number; dist: number }[],
  drawn: number,
  taperTip: boolean,
  profile: number[],
  time: number,
  field: Float32Array,
  opts: {
    frameH: number
    scale: number
    noise: number
    pushMax: number
  },
) {
  const left: Pt[] = []
  const right: Pt[] = []
  if (samples.length < 2 || drawn < 2) return { left, right }

  const tileLen = opts.frameH * opts.scale
  const drift = -time * 0.55

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]
    if (sample.dist > drawn) break
    const u = ((sample.dist / tileLen) % 1) * opts.frameH
    const row = Math.min(opts.frameH - 2, Math.max(0, Math.floor(u)))
    const mix = u - row
    let radius = (profile[row] || 1.1) * (1 - mix) + (profile[row + 1] || 1.1) * mix
    const slow = valueNoise(sample.dist / 58 + drift)
    const mid = valueNoise(sample.dist / 28 + drift * 1.25 + 19)
    radius *= 1 + (slow - 0.5) * 0.45 * opts.noise + (mid - 0.5) * 0.2 * opts.noise
    const push = field.length === samples.length ? field[i] : 0
    const stretch = Math.min(1, Math.abs(push) / opts.pushMax)
    radius *= 1 + stretch * 0.55
    radius = Math.max(0.85, radius * 1.42)
    const wobble = (slow - 0.5) * 1.15 * opts.noise + push
    if (sample.dist < 14) radius *= Math.max(0.15, sample.dist / 14)
    if (taperTip) {
      const remain = drawn - sample.dist
      if (remain < 40) radius *= Math.max(0.06, remain / 40)
    }
    const x = sample.x + sample.nx * wobble
    const y = sample.y + sample.ny * wobble
    const cells = Math.max(3, Math.round(radius / PSX_PIXEL))
    const ox = sample.nx * cells * PSX_PIXEL
    const oy = sample.ny * cells * PSX_PIXEL
    pushUnique(left, { x: snap(x + ox), y: snap(y + oy) })
    pushUnique(right, { x: snap(x - ox), y: snap(y - oy) })
  }
  return { left, right }
}

const FILAMENTS = [
  { amp: 0.08, speed: 2.6, freq: 0.012, phase: 0, dens: 0.8 },
  { amp: 0.26, speed: 3.0, freq: 0.016, phase: 0.8, dens: 0.72 },
  { amp: 0.48, speed: 3.4, freq: 0.019, phase: 1.7, dens: 0.68 },
  { amp: 0.7, speed: 2.4, freq: 0.014, phase: 2.9, dens: 0.64 },
  { amp: 0.9, speed: 3.8, freq: 0.021, phase: 4.0, dens: 0.6 },
  { amp: 0.38, speed: 2.8, freq: 0.024, phase: 5.1, dens: 0.7 },
  { amp: 0.62, speed: 2.2, freq: 0.011, phase: 6.0, dens: 0.66 },
]

export function drawInkRibbon(
  ctx: CanvasRenderingContext2D,
  left: Pt[],
  right: Pt[],
  color: string,
  time: number,
  sparks: Spark[],
  accent: string,
) {
  if (left.length < 2 || right.length < 2) return
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.clearRect(0, 0, w, h)
  const rgb = hexRgb(color)
  const image = ctx.createImageData(w, h)
  const data = image.data
  const count = Math.max(left.length, right.length)

  for (const fil of FILAMENTS) {
    let prevX = 0
    let prevY = 0
    let hasPrev = false
    for (let i = 0; i < count; i += 1) {
      const a = sampleEdge(left, i, count)
      const b = sampleEdge(right, i, count)
      const mx = (a.x + b.x) * 0.5
      const my = (a.y + b.y) * 0.5
      const dx = b.x - a.x
      const dy = b.y - a.y
      const span = Math.hypot(dx, dy) || 1
      const nx = dx / span
      const ny = dy / span
      const dist = i * 4
      const wave = Math.sin(dist * fil.freq + time * fil.speed + fil.phase)
      const turb = (valueNoise(dist / 36 + time * 1.35 + fil.phase) - 0.5) * 2
      const off = (wave * 0.72 + turb * 0.4) * fil.amp * (span * 0.5 + 14)
      const x = Math.round((mx + nx * off) / PSX_PIXEL)
      const y = Math.round((my + ny * off) / PSX_PIXEL)
      if (hasPrev) plotStroke(data, w, h, prevX, prevY, x, y, rgb, time + fil.phase, fil.dens)
      const ember = valueNoise(dist / 18 + time * 3.2 + fil.phase + 9)
      if (ember > 0.62 && hasPrev) {
        const lift = Math.round((ember - 0.62) * 10)
        plotDot(data, w, h, x + Math.round((prevX - x) * 0.4), y + Math.round((prevY - y) * 0.4) - lift, rgb)
      }
      prevX = x
      prevY = y
      hasPrev = true
    }
  }

  if (sparks.length > 0) {
    const accentRgb = hexRgb(accent)
    for (const spark of sparks) {
      const travel = Math.min(1, Math.abs(spark.dist - spark.home) / 520)
      const t = travel * travel
      const mixed: [number, number, number] = [
        Math.round(accentRgb[0] + (rgb[0] - accentRgb[0]) * t),
        Math.round(accentRgb[1] + (rgb[1] - accentRgb[1]) * t),
        Math.round(accentRgb[2] + (rgb[2] - accentRgb[2]) * t),
      ]
      const x = Math.round(spark.x / PSX_PIXEL)
      const y = Math.round(spark.y / PSX_PIXEL)
      const dens = 0.8 * (1 - t * 0.4)
      if (spark.hasPrev) {
        plotStroke(data, w, h, spark.prevX, spark.prevY, x, y, mixed, time + spark.phase, dens)
      } else {
        plotDot(data, w, h, x, y, mixed)
      }
      spark.prevX = x
      spark.prevY = y
      spark.hasPrev = true
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function drawCodedPortal(
  ctx: CanvasRenderingContext2D,
  time: number,
  ink: string,
  accent: string,
) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const cx = (w - 1) * 0.5
  const cy = (h - 1) * 0.5
  const rx = w * 0.46
  const ry = h * 0.3
  const spin = Math.floor(time * 6) * 0.32
  const inkRgb = hexRgb(ink)
  const accentRgb = hexRgb(accent)
  ctx.clearRect(0, 0, w, h)
  const image = ctx.createImageData(w, h)
  const data = image.data

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      const r = Math.hypot(nx, ny)
      if (r > 1.04) continue
      const ang = Math.atan2(ny, nx) + spin
      const arm = fract(ang / (Math.PI * 2) + r * 1.9)
      const band = Math.min(arm, 1 - arm)
      const rim = r > 0.9 && r < 1.02
      const hole = r < 0.12
      const spiral = !hole && r < 0.86 && band < 0.045
      const bayer = BAYER[y & 3][x & 3] / 16
      if (rim && bayer > 0.94) continue
      if (spiral && bayer > 0.88) continue
      let rgb = inkRgb
      if (spiral && r < 0.4) rgb = accentRgb
      if (!rim && !spiral) continue
      const i = (y * w + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function spawnSparks(
  list: Spark[],
  samples: { x: number; y: number; nx: number; ny: number; dist: number }[],
  dist: number,
  count: number,
) {
  if (samples.length === 0) return
  const lanes = [-3, 0, 3]
  for (let i = 0; i < count; i += 1) {
    list.push({
      dist: dist - Math.random() * 8,
      home: dist,
      side: lanes[i % lanes.length] + (Math.random() - 0.5) * 2,
      weave: 0.2 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      speed: -(72 + Math.random() * 70),
      life: 1,
      max: 2.2 + Math.random() * 1.1,
      kind: Math.random() < 0.88 ? 1 : 0,
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      hasPrev: false,
    })
  }
}

export function stepSparks(
  list: Spark[],
  samples: { x: number; y: number; nx: number; ny: number; dist: number }[],
  dt: number,
  time: number,
) {
  if (samples.length === 0) {
    list.length = 0
    return
  }
  const minDist = samples[0].dist
  const maxDist = samples[samples.length - 1].dist
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const spark = list[i]
    spark.life -= dt / spark.max
    spark.dist += spark.speed * dt
    if (spark.life <= 0 || spark.dist < minDist || spark.dist > maxDist) {
      list.splice(i, 1)
      continue
    }
    const sample = sampleAt(samples, spark.dist)
    const wave = Math.sin(spark.dist * 0.016 + time * 3.1 + spark.phase)
    const wave2 = Math.sin(spark.dist * 0.024 + time * 2.4 + spark.phase * 1.3)
    const turb = (valueNoise(spark.dist / 36 + time * 1.35 + spark.phase) - 0.5) * 2
    const off = spark.side + (wave * 0.72 + wave2 * 0.22 + turb * 0.28) * spark.weave * 12
    spark.x = sample.x + sample.nx * off
    spark.y = sample.y + sample.ny * off
  }
}

export function drawSparks(
  ctx: CanvasRenderingContext2D,
  list: Spark[],
  ink: string,
  accent: string,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  for (const spark of list) {
    const x = Math.round(spark.x / PSX_PIXEL)
    const y = Math.round(spark.y / PSX_PIXEL)
    ctx.fillStyle = spark.kind === 1 ? accent : ink
    ctx.fillRect(x, y, 2, 1)
    ctx.fillRect(x, y, 1, 2)
  }
}

export function closestPathSample(
  samples: { x: number; y: number; nx: number; ny: number; dist: number }[],
  x: number,
  y: number,
) {
  if (samples.length === 0) return null
  let best = samples[0]
  let bestGap = Infinity
  for (const sample of samples) {
    const dx = sample.x - x
    const dy = sample.y - y
    const gap = dx * dx + dy * dy
    if (gap < bestGap) {
      bestGap = gap
      best = sample
    }
  }
  return best
}

function sampleAt(
  samples: { x: number; y: number; nx: number; ny: number; dist: number }[],
  dist: number,
) {
  if (samples.length === 1) return samples[0]
  let lo = 0
  let hi = samples.length - 1
  if (dist <= samples[0].dist) return samples[0]
  if (dist >= samples[hi].dist) return samples[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid].dist < dist) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  const t = (dist - a.dist) / (b.dist - a.dist || 1)
  const nx = a.nx + (b.nx - a.nx) * t
  const ny = a.ny + (b.ny - a.ny) * t
  const n = Math.hypot(nx, ny) || 1
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    nx: nx / n,
    ny: ny / n,
    dist,
  }
}

function hexRgb(color: string): [number, number, number] {
  const raw = color.trim()
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ]
    }
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ]
  }
  const rgb = raw.match(/(\d+)/g)
  if (rgb && rgb.length >= 3) {
    return [Number(rgb[0]), Number(rgb[1]), Number(rgb[2])]
  }
  return [36, 28, 22]
}

function sampleEdge(list: Pt[], i: number, count: number) {
  if (list.length === 1) return list[0]
  const t = i / Math.max(1, count - 1)
  return list[Math.min(list.length - 1, Math.round(t * (list.length - 1)))]
}

function plotStroke(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
  time: number,
  dens: number,
) {
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  const tick = Math.floor(time * 28)
  while (true) {
    const bayer = BAYER[(y + tick) & 3][(x + tick * 2) & 3] / 16
    const n = valueNoise(x * 0.31 + y * 0.27 + time * 2.6)
    if (n < dens && bayer < dens + 0.12) {
      plotDot(data, w, h, x, y, rgb)
      plotDot(data, w, h, x - sy, y + sx, rgb)
      if (n < dens * 0.32) plotDot(data, w, h, x, y - 1, rgb)
    }
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

function plotDot(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  rgb: [number, number, number],
) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const i = (y * w + x) * 4
  data[i] = rgb[0]
  data[i + 1] = rgb[1]
  data[i + 2] = rgb[2]
  data[i + 3] = 255
}

function fract(n: number) {
  return n - Math.floor(n)
}

function hash(i: number) {
  return fract(Math.sin(i * 127.1 + 311.7) * 43758.5453)
}

function valueNoise(x: number) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u
}
