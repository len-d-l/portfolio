import { setImageOrder } from '../content/order.ts'

const css = `
  .arrange-toggle {
    position: fixed; right: 1rem; bottom: 1rem; z-index: 9999;
    padding: 0.45rem 0.8rem; border: 1px solid var(--ink); border-radius: 999px;
    background: var(--paper); color: var(--ink); cursor: pointer;
    font: 0.72rem/1 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;
  }
  .arrange-toggle[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--paper); }
  .is-arranging .shot { cursor: grab; touch-action: none; outline: 1px dashed var(--accent); outline-offset: -1px; transition: none; }
  .is-arranging .shot.is-lifted { cursor: grabbing; outline-style: solid; z-index: 3; }
  .is-arranging .shot.is-cover::after {
    content: 'Cover';
    position: absolute; left: 6px; bottom: 6px; z-index: 2;
    padding: 0.2rem 0.4rem; border-radius: 999px;
    background: var(--ink); color: var(--paper);
    font: 0.62rem/1 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;
  }
`

/**
 * Dev-only: toggle "Arrange", then drag stills on a project page.
 * The first image is the cover. Saves to src/content/order.json through the dev server.
 */
export function mountArrangeTool(gallery: HTMLElement, slug: string, relayout: () => void) {
  const html = document.documentElement
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'arrange-toggle'
  toggle.textContent = 'Arrange'
  toggle.setAttribute('aria-pressed', 'false')
  document.body.append(toggle)

  const shots = () => [...gallery.querySelectorAll<HTMLElement>('.shot')]
  const files = () => shots().map((shot) => shot.dataset.file ?? '')
  const markCover = () => shots().forEach((shot, index) => shot.classList.toggle('is-cover', index === 0))

  let drag: HTMLElement | null = null
  let dragged = ''
  let status = ''

  const arranging = () => html.classList.contains('is-arranging')

  const paint = () => {
    toggle.textContent = arranging() ? `Arrange${status}` : 'Arrange'
  }

  const save = async () => {
    const order = files()
    setImageOrder(slug, order)
    status = ' · saving'
    paint()
    try {
      const response = await fetch('/__order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, files: order }),
      })
      status = response.ok ? ' · saved' : ' · save failed'
    } catch {
      status = ' · save failed'
    }
    paint()
  }

  const place = (x: number, y: number) => {
    if (!drag) return
    const hit = shots().find((shot) => {
      if (shot === drag) return false
      const box = shot.getBoundingClientRect()
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
    })
    if (!hit?.parentElement) return
    const box = hit.getBoundingClientRect()
    const before = x < box.left + box.width / 2
    if ((before && hit.previousElementSibling === drag) || (!before && hit.nextElementSibling === drag)) return
    hit.parentElement.insertBefore(drag, before ? hit : hit.nextSibling)
    markCover()
    relayout()
  }

  const onDown = (event: PointerEvent) => {
    if (!arranging() || event.button !== 0) return
    const shot = event.target instanceof Element ? event.target.closest<HTMLElement>('.shot') : null
    if (!shot) return
    event.preventDefault()
    drag = shot
    dragged = files().join('\n')
    shot.classList.add('is-lifted')
    shot.setPointerCapture(event.pointerId)
  }

  const onMove = (event: PointerEvent) => {
    if (!drag) return
    place(event.clientX, event.clientY)
  }

  const onUp = () => {
    if (!drag) return
    drag.classList.remove('is-lifted')
    drag = null
    markCover()
    relayout()
    if (files().join('\n') !== dragged) void save()
  }

  const onToggle = () => {
    const on = html.classList.toggle('is-arranging')
    toggle.setAttribute('aria-pressed', String(on))
    if (on) markCover()
    else shots().forEach((shot) => shot.classList.remove('is-cover', 'is-lifted'))
    status = ''
    paint()
    relayout()
  }

  const blockClick = (event: MouseEvent) => {
    if (!arranging()) return
    if (event.target instanceof Element && event.target.closest('.shot')) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  toggle.addEventListener('click', onToggle)
  gallery.addEventListener('pointerdown', onDown)
  gallery.addEventListener('pointermove', onMove)
  gallery.addEventListener('pointerup', onUp)
  gallery.addEventListener('pointercancel', onUp)
  gallery.addEventListener('click', blockClick, true)

  return () => {
    html.classList.remove('is-arranging')
    style.remove()
    toggle.remove()
    shots().forEach((shot) => shot.classList.remove('is-cover', 'is-lifted'))
    toggle.removeEventListener('click', onToggle)
    gallery.removeEventListener('pointerdown', onDown)
    gallery.removeEventListener('pointermove', onMove)
    gallery.removeEventListener('pointerup', onUp)
    gallery.removeEventListener('pointercancel', onUp)
    gallery.removeEventListener('click', blockClick, true)
  }
}
