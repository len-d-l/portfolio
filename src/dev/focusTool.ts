import { cropStyle, maxZoom, setImageFocus } from '../content/focus.ts'
import type { Crop } from '../dither.ts'

type Refocus = (frame: HTMLElement, img: HTMLImageElement, focus: Crop) => void

const css = `
  .crop-toggle {
    position: fixed; right: 1rem; bottom: 1rem; z-index: 9999;
    padding: 0.45rem 0.8rem; border: 1px solid var(--ink); border-radius: 999px;
    background: var(--paper); color: var(--ink); cursor: pointer;
    font: 0.72rem/1 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;
  }
  .crop-toggle[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--paper); }
  .is-cropping .work-frame { cursor: grab; touch-action: none; outline: 1px dashed var(--accent); outline-offset: -1px; }
  .is-cropping .work-frame.is-dragging { cursor: grabbing; }
  .is-cropping .work-card .work-img.is-shown { transform: var(--crop); transition: opacity 0.2s; }
  .is-cropping .work-frame img { user-select: none; -webkit-user-drag: none; }
  .crop-hud {
    position: absolute; left: 50%; bottom: 24px; z-index: 5; transform: translateX(-50%);
    display: flex; align-items: center; gap: 0.35rem; max-width: calc(100% - 48px);
    padding: 0.3rem 0.4rem; border-radius: 999px; background: var(--ink); color: var(--paper);
    font: 0.68rem/1 var(--font-mono); white-space: nowrap; cursor: default;
  }
  .crop-hud-label { overflow: hidden; text-overflow: ellipsis; padding: 0 0.3rem; }
  .crop-hud button {
    padding: 0.25rem 0.5rem; border: 0; border-radius: 999px; cursor: pointer;
    background: rgba(239, 228, 208, 0.16); color: inherit; font: inherit;
  }
  .crop-hud button:hover { background: var(--accent); }
`

const round = (value: number, step: number) => Number((Math.round(value / step) * step).toFixed(2))
const clampPercent = (value: number) => round(Math.min(100, Math.max(0, value)), 0.1)
const clampZoom = (value: number) => round(Math.min(maxZoom, Math.max(1, value)), 0.01)

function readFocus(img: HTMLImageElement): Required<Crop> {
  const [x = '50%', y = '50%'] = img.style.objectPosition.split(' ')
  const zoom = parseFloat(img.style.getPropertyValue('--zoom')) || 1
  return [parseFloat(x), parseFloat(y), zoom]
}

/** Frame size, and how far the cover-fitted, zoomed image sticks out past it on each axis, in px. */
function measure(frame: HTMLElement, img: HTMLImageElement, zoom: number) {
  const { left, top, width, height } = frame.getBoundingClientRect()
  if (!img.naturalWidth || !img.naturalHeight) return { left, top, size: [width, height], over: [0, 0] }
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight) * zoom
  return { left, top, size: [width, height], over: [img.naturalWidth * scale - width, img.naturalHeight * scale - height] }
}

/**
 * Dev-only: toggle "Crop", then drag a Work preview to move it and scroll (or pinch) to zoom.
 * Saves to src/content/focus.json through the dev server.
 */
export function mountFocusTool(root: HTMLElement, refocus: Refocus) {
  const html = document.documentElement
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'crop-toggle'
  toggle.textContent = 'Crop'
  toggle.setAttribute('aria-pressed', 'false')
  document.body.append(toggle)

  const hud = document.createElement('div')
  hud.className = 'crop-hud'
  hud.innerHTML = `
    <button type="button" data-crop="prev" aria-label="Previous image">‹</button>
    <span class="crop-hud-label"></span>
    <button type="button" data-crop="next" aria-label="Next image">›</button>
    <button type="button" data-crop="out" aria-label="Zoom out">−</button>
    <button type="button" data-crop="in" aria-label="Zoom in">+</button>
    <button type="button" data-crop="reset">Reset</button>
  `
  const label = hud.querySelector<HTMLElement>('.crop-hud-label')!
  let hudFrame: HTMLElement | null = null
  let status = ''
  let saveTimer = 0

  const cropping = () => html.classList.contains('is-cropping')
  const frameAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>('.work-frame') : null
  const shownImg = (frame: HTMLElement) => frame.querySelector<HTMLImageElement>('.work-img.is-shown')
  const keyFor = (frame: HTMLElement, img: HTMLImageElement) => {
    const slug = frame.closest<HTMLElement>('.work-card')?.dataset.slug
    return slug && img.dataset.file ? `${slug}/${img.dataset.file}` : null
  }

  const paintLabel = () => {
    const img = hudFrame && shownImg(hudFrame)
    if (!hudFrame || !img) return
    const all = [...hudFrame.querySelectorAll('.work-img')]
    const [x, y, zoom] = readFocus(img)
    const { over } = measure(hudFrame, img, zoom)
    const axis = over[0] > 1 && over[1] > 1 ? 'drag ✥' : over[0] > 1 ? 'drag ↔' : over[1] > 1 ? 'drag ↕' : 'scroll to zoom'
    label.title = img.dataset.file ?? ''
    label.textContent = `${all.indexOf(img) + 1}/${all.length} · ${x}% ${y}% · ${zoom.toFixed(2)}× · ${axis}${status}`
  }

  const apply = (frame: HTMLElement, img: HTMLImageElement, focus: Required<Crop>) => {
    img.style.cssText = cropStyle(focus)
    refocus(frame, img, focus)
    status = ''
    paintLabel()
  }

  const save = async (frame: HTMLElement, img: HTMLImageElement) => {
    window.clearTimeout(saveTimer)
    const key = keyFor(frame, img)
    if (!key) return
    const focus = readFocus(img)
    setImageFocus(key, focus)
    status = ' · saving'
    paintLabel()
    try {
      const response = await fetch('/__focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, focus }),
      })
      status = response.ok ? ' · saved' : ' · save failed'
    } catch {
      status = ' · save failed'
    }
    paintLabel()
  }

  /** Zooms while keeping the image point under (`cx`, `cy`) in place, then clamps so the frame stays covered. */
  const zoomTo = (frame: HTMLElement, img: HTMLImageElement, next: number, cx?: number, cy?: number) => {
    const [x, y, zoom] = readFocus(img)
    const target = clampZoom(next)
    if (target === zoom) return
    const before = measure(frame, img, zoom)
    const after = measure(frame, img, target)
    const anchor = [cx === undefined ? before.size[0] / 2 : cx - before.left, cy === undefined ? before.size[1] / 2 : cy - before.top]
    const position = [x, y].map((percent, axis) => {
      const rendered = before.size[axis] + before.over[axis]
      const point = (anchor[axis] + (before.over[axis] * percent) / 100) / rendered
      const offset = point * (after.size[axis] + after.over[axis]) - anchor[axis]
      return after.over[axis] > 1 ? clampPercent((offset / after.over[axis]) * 100) : percent
    })
    apply(frame, img, [position[0], position[1], target])
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void save(frame, img), 400)
  }

  const attachHud = (frame: HTMLElement) => {
    if (hudFrame === frame) return
    hudFrame = frame
    status = ''
    frame.append(hud)
    paintLabel()
  }

  const onOver = (event: PointerEvent) => {
    if (!cropping()) return
    const frame = frameAt(event.target)
    if (frame) attachHud(frame)
  }

  let drag: { frame: HTMLElement; img: HTMLImageElement; x: number; y: number; start: Required<Crop> } | null = null

  const onDown = (event: PointerEvent) => {
    if (!cropping() || event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.crop-hud')) return
    const frame = frameAt(event.target)
    const img = frame && shownImg(frame)
    if (!frame || !img) return
    event.preventDefault()
    attachHud(frame)
    frame.setPointerCapture(event.pointerId)
    drag = { frame, img, x: event.clientX, y: event.clientY, start: readFocus(img) }
    frame.classList.add('is-dragging')
  }

  const onMove = (event: PointerEvent) => {
    if (!drag) return
    const [sx, sy, zoom] = drag.start
    const { over } = measure(drag.frame, drag.img, zoom)
    const x = over[0] > 1 ? clampPercent(sx - ((event.clientX - drag.x) / over[0]) * 100) : sx
    const y = over[1] > 1 ? clampPercent(sy - ((event.clientY - drag.y) / over[1]) * 100) : sy
    apply(drag.frame, drag.img, [x, y, zoom])
  }

  const onUp = () => {
    if (!drag) return
    const { frame, img, start } = drag
    drag = null
    frame.classList.remove('is-dragging')
    if (readFocus(img).some((value, index) => value !== start[index])) void save(frame, img)
  }

  const onWheel = (event: WheelEvent) => {
    if (!cropping()) return
    const frame = frameAt(event.target)
    const img = frame && shownImg(frame)
    if (!frame || !img) return
    event.preventDefault()
    attachHud(frame)
    const speed = event.ctrlKey ? 0.01 : 0.0015
    zoomTo(frame, img, readFocus(img)[2] * Math.exp(-event.deltaY * speed), event.clientX, event.clientY)
  }

  const onHud = (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-crop]') : null
    if (!button || !hudFrame) return
    const all = [...hudFrame.querySelectorAll<HTMLImageElement>('.work-img')]
    const img = shownImg(hudFrame)
    if (!img) return
    const action = button.dataset.crop
    if (action === 'reset') {
      apply(hudFrame, img, [50, 50, 1])
      void save(hudFrame, img)
    } else if (action === 'in' || action === 'out') {
      zoomTo(hudFrame, img, readFocus(img)[2] * (action === 'in' ? 1.15 : 1 / 1.15))
    } else {
      const step = action === 'next' ? 1 : -1
      const next = all[(all.indexOf(img) + step + all.length) % all.length]
      all.forEach((still) => still.classList.toggle('is-shown', still === next))
      status = ''
      paintLabel()
    }
  }

  const blockClicks = (event: MouseEvent) => {
    if (!cropping()) return
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.work-card')) return
    event.preventDefault()
    event.stopPropagation()
    if (target.closest('.crop-hud')) onHud(event)
  }

  const onToggle = () => {
    const on = html.classList.toggle('is-cropping')
    toggle.setAttribute('aria-pressed', String(on))
    if (!on) {
      hud.remove()
      hudFrame = null
    }
  }

  toggle.addEventListener('click', onToggle)
  window.addEventListener('click', blockClicks, true)
  root.addEventListener('pointerover', onOver)
  root.addEventListener('pointerdown', onDown)
  root.addEventListener('pointermove', onMove)
  root.addEventListener('pointerup', onUp)
  root.addEventListener('pointercancel', onUp)
  root.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    window.clearTimeout(saveTimer)
    html.classList.remove('is-cropping')
    style.remove()
    toggle.remove()
    hud.remove()
    window.removeEventListener('click', blockClicks, true)
    root.removeEventListener('pointerover', onOver)
    root.removeEventListener('pointerdown', onDown)
    root.removeEventListener('pointermove', onMove)
    root.removeEventListener('pointerup', onUp)
    root.removeEventListener('pointercancel', onUp)
    root.removeEventListener('wheel', onWheel)
  }
}
