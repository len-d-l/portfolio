const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/_+<>'
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const running = new WeakMap<Element, number>()
const originals = new WeakMap<Text, string>()

function textNodes(element: Element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.data.trim()) nodes.push(node)
  }
  return nodes
}

/** Letters settle left to right out of random glyphs. Only for monospace text, so the width never changes. */
export function scramble(element: Element, duration = 520, pool = glyphs) {
  if (still()) return
  cancelAnimationFrame(running.get(element) ?? 0)
  const nodes = textNodes(element)
  const finals = nodes.map((node) => {
    const text = originals.get(node) ?? node.data
    originals.set(node, text)
    return text
  })
  const total = finals.reduce((sum, text) => sum + text.length, 0)
  if (!total) return
  const start = performance.now()

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration)
    const settled = Math.floor(progress * total * 1.15 - total * 0.15)
    let offset = 0
    nodes.forEach((node, at) => {
      const text = finals[at]
      let next = ''
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        next += offset + index < settled || char === ' ' || char === '·' ? char : pool[Math.floor(Math.random() * pool.length)]
      }
      node.data = next
      offset += text.length
    })
    if (progress < 1) running.set(element, requestAnimationFrame(tick))
    else nodes.forEach((node, at) => (node.data = finals[at]))
  }
  running.set(element, requestAnimationFrame(tick))
}

/** Scrambles each matching element once, when it first scrolls into view. */
export function scrambleOnView(root: ParentNode, selector: string) {
  if (still()) return () => {}
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        observer.unobserve(entry.target)
        scramble(entry.target)
      })
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  root.querySelectorAll(selector).forEach((element) => observer.observe(element))
  return () => observer.disconnect()
}
