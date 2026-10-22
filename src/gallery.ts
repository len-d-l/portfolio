const galleryGap = 6
const rowSpans = [0.84, 1, 0.9, 0.97, 0.78]
const phoneSpans = [1, 0.86]

type Tile = { shot: HTMLElement; row: number; x: number; y: number; w: number; h: number }
type Pose = { tx: number; ty: number; scale: number }

export type GalleryOptions = {
  /** Row height the layout aims for, given the container width. */
  target?: (width: number, phone: boolean) => number
  /** Hovered tile grows until it is about this tall. */
  focusHeight?: number
  onFocus?: (shot: HTMLElement | null) => void
}

const defaultTarget = (width: number, phone: boolean) => (phone ? 112 : Math.round(Math.min(178, Math.max(140, width * 0.19))))

/**
 * Lays `.shot` children out in centered rows that share one height and keep each picture's ratio, but end at different widths so the block reads as a staggered wall.
 * Hover enlarges downward with transforms only, so content above never moves. The pick is computed from the planned poses, not from the moving DOM, so the cursor can't bounce between two tiles mid-animation.
 */
export function layoutGallery(gallery: HTMLElement, options: GalleryOptions = {}) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
  const targetFor = options.target ?? defaultTarget
  const focusHeight = options.focusHeight ?? 330
  let frame = 0
  let moveFrame = 0
  let tiles: Tile[] = []
  let poses: Pose[] = []
  let active = -1
  let lockUntil = 0
  let pointerX = 0
  let pointerY = 0

  const rest = () => tiles.map(() => ({ tx: 0, ty: 0, scale: 1 }))

  const visual = (index: number) => {
    const tile = tiles[index]
    const pose = poses[index]
    const w = tile.w * pose.scale
    const h = tile.h * pose.scale
    const cx = tile.x + tile.w / 2 + pose.tx
    const cy = tile.y + tile.h / 2 + pose.ty
    return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }
  }

  const inside = (index: number, x: number, y: number, pad: number) => {
    const box = visual(index)
    return x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad
  }

  const apply = (next: number) => {
    if (next === active) return
    active = next
    gallery.classList.toggle('is-focusing', next >= 0)

    if (next < 0) {
      poses = rest()
    } else {
      const focus = tiles[next]
      const scale = Math.min(1.55, Math.max(1.22, focusHeight / focus.h))
      const dx = (focus.w * (scale - 1)) / 2
      const dy = (focus.h * (scale - 1)) / 2
      const width = gallery.clientWidth
      let shiftX = 0
      if (focus.x - dx < 0) shiftX = dx - focus.x
      else if (focus.x + focus.w + dx > width) shiftX = width - (focus.x + focus.w + dx)
      poses = tiles.map((tile, index) => {
        if (index === next) return { tx: shiftX, ty: dy, scale }
        if (tile.row === focus.row) return { tx: (tile.x < focus.x ? -dx : dx) + shiftX, ty: dy, scale: 1 }
        return { tx: 0, ty: tile.row < focus.row ? 0 : dy * 2, scale: 1 }
      })
    }

    tiles.forEach((tile, index) => {
      const pose = poses[index]
      tile.shot.classList.toggle('is-active', index === next)
      tile.shot.style.transform =
        pose.tx || pose.ty || pose.scale !== 1 ? `translate(${pose.tx}px, ${pose.ty}px) scale(${pose.scale})` : ''
    })
    const rested = Math.max(0, ...tiles.map((tile) => tile.y + tile.h))
    const reach = Math.max(0, ...tiles.map((_, index) => visual(index).bottom))
    gallery.style.paddingBottom = reach > rested + 1 ? `${Math.ceil(reach - rested)}px` : ''
    options.onFocus?.(next >= 0 ? tiles[next].shot : null)
  }

  const pick = () => {
    const x = pointerX
    const y = pointerY
    if (active >= 0 && inside(active, x, y, -4)) return active
    if (active >= 0 && performance.now() < lockUntil) return active
    for (let index = 0; index < tiles.length; index += 1) {
      if (index !== active && inside(index, x, y, 0)) return index
    }
    if (active >= 0 && inside(active, x, y, 26)) return active
    return -1
  }

  const onMove = (event: Event) => {
    if (!fine.matches || !(event instanceof PointerEvent)) return
    const box = gallery.getBoundingClientRect()
    pointerX = event.clientX - box.left
    pointerY = event.clientY - box.top
    if (moveFrame) return
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0
      const next = pick()
      if (next !== active && next >= 0) lockUntil = performance.now() + 110
      apply(next)
    })
  }

  const onLeave = () => {
    cancelAnimationFrame(moveFrame)
    moveFrame = 0
    apply(-1)
  }

  const run = () => {
    const shots = [...gallery.querySelectorAll<HTMLElement>('.shot')]
    if (!shots.length) return
    const width = gallery.clientWidth
    if (width < 20) return

    active = -1
    gallery.style.paddingBottom = ''
    gallery.classList.remove('is-focusing')
    shots.forEach((shot) => {
      shot.style.transform = ''
      shot.classList.remove('is-active')
    })

    const aspects = shots.map((shot) => {
      const img = shot.querySelector('img')
      if (!img?.naturalWidth || !img.naturalHeight) return 1.5
      return img.naturalWidth / img.naturalHeight
    })
    const phone = width < 720
    const spans = phone ? phoneSpans : rowSpans
    const target = targetFor(width, phone)

    const groups: number[][] = []
    let indexes: number[] = []
    let sum = 0
    for (let index = 0; index < aspects.length; index += 1) {
      const span = width * spans[groups.length % spans.length]
      const grown = sum + aspects[index]
      const withNext = (span - galleryGap * indexes.length) / grown
      if (indexes.length && withNext < target) {
        const without = (span - galleryGap * (indexes.length - 1)) / sum
        if (Math.abs(withNext - target) <= Math.abs(without - target)) {
          indexes.push(index)
          groups.push(indexes)
          indexes = []
          sum = 0
          continue
        }
        groups.push(indexes)
        indexes = []
        sum = 0
      }
      indexes.push(index)
      sum += aspects[index]
    }
    const tail = indexes.length > 0
    if (tail) groups.push(indexes)

    const strips = groups.map((group, row) => {
      const span = width * spans[row % spans.length]
      const total = group.reduce((acc, index) => acc + aspects[index], 0)
      const gaps = galleryGap * (group.length - 1)
      const fit = (span - gaps) / total
      const settled = tail && row === groups.length - 1 ? Math.min(target, fit) : fit
      const height = Math.round(Math.min((width - gaps) / total, Math.max(target * 0.78, Math.min(target * 1.22, settled))))
      const strip = document.createElement('div')
      strip.className = 'gallery-row'
      group.forEach((index) => {
        const shot = shots[index]
        shot.style.width = `${Math.max(1, Math.round(aspects[index] * height))}px`
        shot.style.height = `${height}px`
        shot.dataset.row = String(row)
        strip.append(shot)
      })
      return strip
    })
    gallery.replaceChildren(...strips)

    const origin = gallery.getBoundingClientRect()
    tiles = shots.map((shot) => {
      const box = shot.getBoundingClientRect()
      return {
        shot,
        row: Number(shot.dataset.row),
        x: box.left - origin.left,
        y: box.top - origin.top,
        w: box.width,
        h: box.height,
      }
    })
    poses = rest()
    options.onFocus?.(null)
  }

  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(run)
  }
  const observer = new ResizeObserver(schedule)
  observer.observe(gallery)
  gallery.addEventListener('pointermove', onMove)
  gallery.addEventListener('pointerleave', onLeave)

  return {
    relayout: schedule,
    stop() {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(moveFrame)
      observer.disconnect()
      gallery.removeEventListener('pointermove', onMove)
      gallery.removeEventListener('pointerleave', onLeave)
    },
  }
}

export function whenDecoded(root: ParentNode) {
  return Promise.all(
    [...root.querySelectorAll('img')].map((img) =>
      img.decode().then(
        () => undefined,
        () => undefined,
      ),
    ),
  )
}
