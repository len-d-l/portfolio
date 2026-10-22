import { scramble } from './scramble.ts'

type Mode = 'idle' | 'link' | 'open' | 'view' | 'off'

function modeFor(target: EventTarget | null): Mode {
  if (!(target instanceof Element)) return 'idle'
  if (target.closest('.desk-canvas, input, textarea, select, video')) return 'off'
  if (target.closest('.work-card, .pager-link')) return 'open'
  if (target.closest('button.shot')) return 'view'
  if (target.closest('a, button, [role="button"]')) return 'link'
  return 'idle'
}

/** Pixel crosshair that replaces the system cursor on mouse/trackpad devices. Mounted once for the whole app. */
export function mountCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const cursor = document.createElement('div')
  cursor.className = 'cursor'
  cursor.setAttribute('aria-hidden', 'true')
  cursor.innerHTML = `
    <svg class="cursor-cross" viewBox="0 0 17 17" width="17" height="17" shape-rendering="crispEdges">
      <path d="M7 0h3v5H7zM7 12h3v5H7zM0 7h5v3H0zM12 7h5v3h-5z" fill="currentColor" />
      <path d="M8 1h1v4H8zM8 12h1v4H8zM1 8h4v1H1zM12 8h4v1h-4z" class="cursor-core" />
    </svg>
    <span class="cursor-label"></span>
  `
  const label = cursor.querySelector<HTMLElement>('.cursor-label')
  document.body.append(cursor)
  document.documentElement.classList.add('has-cursor')

  let x = -100
  let y = -100
  let labelX = -100
  let labelY = -100
  let mode: Mode = 'idle'
  let frame = 0

  const draw = () => {
    frame = 0
    const follow = still ? 1 : 0.22
    labelX += (x - labelX) * follow
    labelY += (y - labelY) * follow
    cursor.style.transform = `translate(${Math.round(x / 2) * 2}px, ${Math.round(y / 2) * 2}px)`
    if (label) label.style.transform = `translate(${Math.round(labelX - x)}px, ${Math.round(labelY - y)}px)`
    if (Math.abs(labelX - x) > 0.5 || Math.abs(labelY - y) > 0.5) frame = requestAnimationFrame(draw)
  }

  const setMode = (next: Mode) => {
    if (next === mode) return
    mode = next
    cursor.dataset.mode = next
    if (label && (next === 'open' || next === 'view')) {
      label.textContent = next === 'open' ? 'Open' : 'View'
      scramble(label, 260)
    }
  }

  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return
    x = event.clientX
    y = event.clientY
    cursor.classList.add('is-visible')
    setMode(modeFor(event.target))
    if (!frame) frame = requestAnimationFrame(draw)
  })
  document.addEventListener('pointerdown', () => cursor.classList.add('is-pressed'))
  document.addEventListener('pointerup', () => cursor.classList.remove('is-pressed'))
  document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('is-visible'))
  window.addEventListener('popstate', () => setTimeout(() => setMode(modeFor(document.elementFromPoint(x, y))), 60))
}
