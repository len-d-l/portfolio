export type LightboxItem = { src: string; title?: string }

const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
const backdrop = (alpha: number) => `rgba(36, 28, 22, ${alpha})`

let closeCurrent: (() => void) | null = null

export function closeLightbox() {
  closeCurrent?.()
}

/**
 * Full-screen viewer. Opens by zooming out of `thumbs[index]` and closes back into whichever thumb matches the image on screen.
 * Touch: drag sideways to change image; the picture follows the finger.
 */
export function openLightbox(items: LightboxItem[], thumbs: HTMLElement[], index: number, label: string) {
  closeCurrent?.()
  let current = index
  let showToken = 0
  let closing = false
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const many = items.length > 1

  const dialog = document.createElement('div')
  dialog.className = 'lightbox'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', label)

  const figure = document.createElement('img')
  figure.draggable = false
  const caption = document.createElement('p')
  caption.className = 'lightbox-caption'
  const count = document.createElement('p')
  count.className = 'lightbox-count'
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'lightbox-close'
  closeButton.textContent = 'Close'
  const prev = document.createElement('button')
  prev.type = 'button'
  prev.className = 'lightbox-prev'
  prev.setAttribute('aria-label', 'Previous image')
  prev.textContent = '←'
  const next = document.createElement('button')
  next.type = 'button'
  next.className = 'lightbox-next'
  next.setAttribute('aria-label', 'Next image')
  next.textContent = '→'

  const chrome = () => [closeButton, caption, count, ...(many ? [prev, next] : [])]

  const describe = () => {
    const text = items[current].title ?? ''
    caption.textContent = text
    caption.hidden = !text
    figure.alt = text || `${label}, image ${current + 1} of ${items.length}`
    count.textContent = `${current + 1} / ${items.length}`
  }

  const flipFrom = (from: DOMRect) => {
    const to = figure.getBoundingClientRect()
    if (!to.width || !to.height) return 'none'
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`
  }

  const visibleThumb = () => {
    const thumb = thumbs[current]
    const box = thumb?.getBoundingClientRect()
    if (!thumb || !box || box.bottom < 0 || box.top > window.innerHeight) return null
    return { thumb, box }
  }

  const show = async (nextIndex: number, direction: number) => {
    current = (nextIndex + items.length) % items.length
    const token = ++showToken
    const loader = new Image()
    loader.src = items[current].src
    await loader.decode().catch(() => undefined)
    if (token !== showToken || closing) return
    figure.getAnimations().forEach((animation) => animation.cancel())
    figure.style.transform = ''
    figure.style.opacity = ''
    figure.src = items[current].src
    describe()
    if (still) return
    figure.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 36}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 360, easing: ease },
    )
    caption.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: ease })
  }

  const finish = () => {
    dialog.remove()
    thumbs.forEach((thumb) => (thumb.style.visibility = ''))
    document.body.classList.remove('lightbox-open')
    if (closeCurrent === instantClose) closeCurrent = null
  }

  const close = (instant = false) => {
    if (closing) return
    closing = true
    document.removeEventListener('keydown', onKey)
    figure.getAnimations().forEach((animation) => animation.cancel())
    figure.style.transform = ''
    figure.style.opacity = ''
    const target = visibleThumb()
    if (still || instant) return finish()
    if (!target) {
      dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease' }).finished.then(finish, finish)
      return
    }
    target.thumb.style.visibility = 'hidden'
    chrome().forEach((element) => element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }))
    dialog.animate([{ backgroundColor: backdrop(0.97) }, { backgroundColor: backdrop(0) }], {
      duration: 380,
      easing: ease,
      fill: 'forwards',
    })
    figure
      .animate([{ transform: 'none' }, { transform: flipFrom(target.box) }], { duration: 380, easing: ease, fill: 'forwards' })
      .finished.then(finish, finish)
  }
  const instantClose = () => close(true)

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
    if (event.key === 'ArrowRight') void show(current + 1, 1)
    if (event.key === 'ArrowLeft') void show(current - 1, -1)
  }

  let drag: { id: number; x: number; y: number; dx: number; sideways: boolean | null } | null = null
  let swallowClick = false

  dialog.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || !many || closing || drag) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, sideways: null }
  })

  dialog.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (drag.sideways === null && Math.hypot(dx, dy) > 8) drag.sideways = Math.abs(dx) > Math.abs(dy)
    if (!drag.sideways) return
    drag.dx = dx
    figure.getAnimations().forEach((animation) => animation.cancel())
    figure.style.transform = `translateX(${dx}px)`
    figure.style.opacity = String(1 - Math.min(Math.abs(dx) / 700, 0.35))
  })

  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    const { dx, sideways } = drag
    drag = null
    if (!sideways) return
    swallowClick = true
    setTimeout(() => (swallowClick = false), 0)
    const from = `translateX(${dx}px)`
    const opacity = figure.style.opacity || '1'
    figure.style.transform = ''
    figure.style.opacity = ''
    if (Math.abs(dx) < Math.min(80, window.innerWidth * 0.18)) {
      figure.animate([{ transform: from, opacity }, { transform: 'none', opacity: 1 }], { duration: 300, easing: ease })
      return
    }
    const direction = dx < 0 ? 1 : -1
    figure
      .animate([{ transform: from, opacity }, { transform: `translateX(${-direction * window.innerWidth * 0.5}px)`, opacity: 0 }], {
        duration: 180,
        easing: 'ease-in',
        fill: 'forwards',
      })
      .finished.then(() => show(current + direction, direction), () => undefined)
  }
  dialog.addEventListener('pointerup', endDrag)
  dialog.addEventListener('pointercancel', endDrag)

  closeButton.addEventListener('click', () => close())
  prev.addEventListener('click', () => void show(current - 1, -1))
  next.addEventListener('click', () => void show(current + 1, 1))
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !swallowClick) close()
  })

  dialog.append(closeButton, figure, caption, count)
  if (many) dialog.append(prev, next)
  figure.src = items[current].src
  describe()
  document.addEventListener('keydown', onKey)
  document.body.classList.add('lightbox-open')
  closeCurrent = instantClose

  const origin = visibleThumb()
  dialog.style.visibility = 'hidden'
  document.body.append(dialog)
  void figure
    .decode()
    .catch(() => undefined)
    .then(() => {
      if (closing) return
      dialog.style.visibility = ''
      closeButton.focus({ preventScroll: true })
      if (still) return
      dialog.animate([{ backgroundColor: backdrop(0) }, { backgroundColor: backdrop(0.97) }], { duration: 420, easing: ease })
      chrome().forEach((element) =>
        element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 180, easing: 'ease', fill: 'backwards' }),
      )
      if (!origin) {
        figure.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: ease })
        return
      }
      origin.thumb.style.visibility = 'hidden'
      const reveal = () => (origin.thumb.style.visibility = '')
      figure.animate([{ transform: flipFrom(origin.box) }, { transform: 'none' }], { duration: 460, easing: ease }).finished.then(reveal, reveal)
    })
}
