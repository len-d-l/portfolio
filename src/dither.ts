const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** 0–63 rank in an 8×8 ordered pattern; used to dissolve things pixel by pixel. */
export function bayer8(x: number, y: number) {
  const fine = bayer4[(y % 4) * 4 + (x % 4)]
  const coarse = [0, 2, 3, 1][(Math.floor(y / 4) % 2) * 2 + (Math.floor(x / 4) % 2)]
  return fine * 4 + coarse
}

type Rgb = [number, number, number]

const ink: Rgb = [36, 28, 22]
const paper: Rgb = [239, 228, 208]
const inkToPaper: Rgb[] = [ink, [98, 78, 62], [168, 146, 118], paper]

const luma = (color: Rgb) => color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114
const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
]
const distance = (a: Rgb, b: Rgb) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2

/**
 * Four colors taken from the picture itself (k-means), ordered dark to light. The ends lean toward the site's
 * ink and paper so covers still sit on the page.
 */
export function imagePalette(data: ImageData): Rgb[] {
  const pixels = data.data
  const total = data.width * data.height
  const step = Math.max(1, Math.floor(total / 3000))
  const samples: Rgb[] = []
  for (let index = 0; index < total; index += step) {
    if (pixels[index * 4 + 3] < 128) continue
    samples.push([pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]])
  }
  if (samples.length < 8) return inkToPaper
  const sorted = [...samples].sort((a, b) => luma(a) - luma(b))
  let centers = [0.06, 0.36, 0.66, 0.94].map((at) => sorted[Math.floor(at * (sorted.length - 1))])
  for (let round = 0; round < 8; round += 1) {
    const sums = centers.map(() => [0, 0, 0, 0])
    for (const sample of samples) {
      let best = 0
      for (let index = 1; index < centers.length; index += 1) {
        if (distance(sample, centers[index]) < distance(sample, centers[best])) best = index
      }
      const sum = sums[best]
      sum[0] += sample[0]
      sum[1] += sample[1]
      sum[2] += sample[2]
      sum[3] += 1
    }
    centers = centers.map((center, index) => {
      const sum = sums[index]
      return sum[3] ? [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]] : center
    })
  }
  centers.sort((a, b) => luma(a) - luma(b))
  centers[0] = mix(centers[0], ink, 0.4)
  centers[centers.length - 1] = mix(centers[centers.length - 1], paper, 0.3)
  return centers
}

/**
 * Rewrites `data` in place as an ordered dither over `palette` (by default the picture's own colors).
 * Pixels under half alpha are dropped, the rest made opaque.
 */
export function colorDither(data: ImageData, palette = imagePalette(data)) {
  const { width, height } = data
  const pixels = data.data
  let gaps = 0
  for (let index = 1; index < palette.length; index += 1) gaps += Math.sqrt(distance(palette[index], palette[index - 1]) / 9)
  const spread = Math.min(110, Math.max(28, (gaps / Math.max(1, palette.length - 1)) * 1.1))
  const color: Rgb = [0, 0, 0]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      if (pixels[at + 3] < 128) {
        pixels[at + 3] = 0
        continue
      }
      const offset = ((bayer4[(y % 4) * 4 + (x % 4)] + 0.5) / 16 - 0.5) * spread
      color[0] = pixels[at] + offset
      color[1] = pixels[at + 1] + offset
      color[2] = pixels[at + 2] + offset
      let best = palette[0]
      let bestDistance = Infinity
      for (const tone of palette) {
        const gap = distance(color, tone)
        if (gap < bestDistance) {
          bestDistance = gap
          best = tone
        }
      }
      pixels[at] = best[0]
      pixels[at + 1] = best[1]
      pixels[at + 2] = best[2]
      pixels[at + 3] = 255
    }
  }
  return palette
}

/** Position in percent like `object-position`, plus a zoom on top of the cover fit (1 = just fills the frame). */
export type Crop = [x: number, y: number, zoom?: number]

export type DitherCover = {
  /** 1 = fully dithered, 0 = fully revealed. `done` runs once the dissolve reaches the target. */
  set(target: number, done?: () => void): void
  /** Moves the crop and repaints. */
  refocus(focus: Crop): void
  /** Fires once, on the frame a dissolve actually starts painting. */
  shown(callback: () => void): void
  stop(): void
}

/**
 * Paints `img` into a low-res canvas over `frame` with a 4-tone ordered dither, cropped like `object-fit: cover`.
 * Revealing dissolves the canvas pixel by pixel in a second Bayer order, so the transition itself reads as dither.
 */
export function ditherCover(
  frame: HTMLElement,
  img: HTMLImageElement,
  columns: number,
  fit: 'frame' | 'image' = 'frame',
  initial = 1,
  focus: Crop = [50, 50],
): DitherCover {
  const canvas = document.createElement('canvas')
  canvas.className = 'work-dither'
  canvas.setAttribute('aria-hidden', 'true')
  frame.append(canvas)
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let base: ImageData | null = null
  let rank: Uint8Array | null = null
  let shown = initial
  let goal = initial
  let frameId = 0
  let last = 0
  let stopped = false
  let settled: (() => void) | undefined
  let notifyShown: (() => void) | undefined

  const paint = () => {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context || !base || !rank) return
    const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height)
    const cut = (1 - shown) * 64
    if (cut > 0) {
      for (let index = 0; index < rank.length; index += 1) {
        if (rank[index] < cut) out.data[index * 4 + 3] = 0
      }
    }
    context.putImageData(out, 0, 0)
  }

  const finish = () => {
    const done = settled
    settled = undefined
    done?.()
  }

  const step = (time: number) => {
    const dt = last ? Math.min(64, time - last) : 16
    last = time
    const speed = dt / 520
    shown = goal > shown ? Math.min(goal, shown + speed) : Math.max(goal, shown - speed)
    paint()
    if (shown !== goal && !stopped) {
      frameId = requestAnimationFrame(step)
      return
    }
    frameId = 0
    finish()
  }

  const build = () => {
    if (stopped || !img.naturalWidth) return
    const box = frame.getBoundingClientRect()
    const aspect = fit === 'frame' && box.width && box.height ? box.width / box.height : img.naturalWidth / img.naturalHeight
    const width = columns
    const height = Math.max(1, Math.round(columns / aspect))
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return

    const source = img.naturalWidth / img.naturalHeight
    let sw = img.naturalWidth
    let sh = img.naturalHeight
    if (source > aspect) sw = sh * aspect
    else sh = sw / aspect
    const zoom = Math.max(1, focus[2] ?? 1)
    sw /= zoom
    sh /= zoom
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    const sx = ((img.naturalWidth - sw) * focus[0]) / 100
    const sy = ((img.naturalHeight - sh) * focus[1]) / 100
    context.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)
    const data = context.getImageData(0, 0, width, height)
    colorDither(data)
    rank = new Uint8Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) rank[y * width + x] = bayer8(x, y)
    }
    base = data
    paint()
    // A dissolve requested before the bitmap existed (the usual case on a page change) starts now.
    if (goal !== shown || settled) begin()
  }

  const begin = () => {
    if (stopped || !base) return
    if (shown === goal) {
      finish()
      return
    }
    if (frameId) return
    notifyShown?.()
    notifyShown = undefined
    last = 0
    frameId = requestAnimationFrame(step)
  }

  const prepare = () => {
    if (stopped || !img.naturalWidth) return
    // decoding="async" can report the file complete before pixels are paintable. Drawing then
    // captures a blank frame and the fade appears to have been skipped.
    const decoded = img.decode?.() ?? Promise.resolve()
    decoded.then(() => {
      if (!stopped) build()
    }).catch(() => {
      if (!stopped) build()
    })
  }

  if (img.complete && img.naturalWidth) prepare()
  else img.addEventListener('load', prepare, { once: true })

  return {
    set(target, done) {
      if (stopped) return
      goal = target
      settled = done
      if (still) {
        shown = goal
        paint()
        finish()
        return
      }
      begin()
    },
    refocus(next) {
      focus = next
      build()
    },
    shown(callback) {
      notifyShown = callback
    },
    stop() {
      stopped = true
      settled = undefined
      notifyShown = undefined
      cancelAnimationFrame(frameId)
      img.removeEventListener('load', prepare)
    },
  }
}

/**
 * Scroll entrance: `host` starts as blank paper (its images hidden via `.is-waiting`), the dither builds in, then
 * the real image is let through. `wake` skips straight to the image, e.g. when hovered mid-entrance.
 * The draw starts with the page fade, not after it.
 */
export function ditherEntrance(host: HTMLElement, dither: DitherCover, then?: () => void) {
  let waiting = true
  let armed = false
  host.classList.add('is-waiting')
  const wake = () => {
    if (!waiting) return
    waiting = false
    host.classList.remove('is-waiting')
  }
  return {
    enter() {
      if (!waiting || armed) return
      armed = true
      dither.set(1, () => {
        wake()
        then?.()
      })
    },
    wake,
  }
}

/**
 * Masks `element`'s edges with an ordered-dither falloff `edge` px deep, in `cell` px blocks, so a picture breaks
 * up into the page instead of ending on a hard line. Rebuilt when the element resizes.
 */
export function ditherFeather(element: HTMLElement, edge = 18, cell = 3) {
  let url = ''
  let timer = 0
  let stopped = false

  const build = () => {
    const width = Math.round(element.clientWidth)
    const height = Math.round(element.clientHeight)
    if (!width || !height) return
    const columns = Math.ceil(width / cell)
    const rows = Math.ceil(height / cell)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return
    const depth = edge / cell
    context.fillStyle = '#000'
    for (let y = 0; y < rows; y += 1) {
      const rowInset = Math.min(y + 0.5, rows - y - 0.5)
      if (rowInset >= depth) {
        const first = Math.ceil(depth - 0.5)
        context.fillRect(first * cell, y * cell, (columns - first * 2) * cell, cell)
      }
      for (let x = 0; x < columns; x += 1) {
        const t = Math.min(1, Math.min(x + 0.5, columns - x - 0.5, rowInset) / depth)
        if (t >= 1) continue
        if (bayer8(x, y) < t * t * (3 - 2 * t) * 64) context.fillRect(x * cell, y * cell, cell, cell)
      }
    }
    canvas.toBlob((blob) => {
      if (!blob || stopped) return
      if (url) URL.revokeObjectURL(url)
      url = URL.createObjectURL(blob)
      element.style.setProperty('--feather', `url("${url}")`)
      element.classList.add('is-feathered')
    })
  }

  const observer = new ResizeObserver(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(build, 120)
  })
  observer.observe(element)

  return () => {
    stopped = true
    window.clearTimeout(timer)
    observer.disconnect()
    if (url) URL.revokeObjectURL(url)
  }
}

/** Runs `enter` for each element the first time it scrolls into view. */
export function onFirstView(elements: Iterable<Element>, enter: (element: Element) => void) {
  const pending = new Set(elements)
  if (!pending.size) return () => {}

  const take = (element: Element) => {
    if (!pending.delete(element)) return
    observer.unobserve(element)
    enter(element)
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) take(entry.target)
      })
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.12 },
  )
  for (const element of pending) observer.observe(element)

  // Inserting a page and scrolling it in the same turn can drop the observer's first callback.
  requestAnimationFrame(() => {
    const limit = window.innerHeight * 0.94
    for (const element of pending) {
      const box = element.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) continue
      const visible = Math.min(box.bottom, limit) - Math.max(box.top, 0)
      if (visible / box.height >= 0.12) take(element)
    }
  })

  return () => observer.disconnect()
}