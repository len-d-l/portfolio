import { cropStyle } from '../content/focus.ts'
import { aboutFacts, aboutStory, site } from '../content/site.ts'
import { ditherCover, ditherEntrance, ditherFeather, onFirstView, type Crop } from '../dither.ts'
import { withBase } from '../router.ts'
import { renderShell } from '../ui.ts'

/** Face and the game, with the cropped arm at the left edge kept out of frame. */
const playCrop: Crop = [58, 38, 1.45]
/** Tighter than the full room, so the person reads first and the CAVE stays around them. */
const caveCrop: Crop = [58, 46, 1.35]

const crops: Record<string, Crop> = { play: playCrop, cave: caveCrop }

function projectLink(slug: string, label: string) {
  return `<a href="${withBase(`/work/${slug}`)}" data-link>${label}</a>`
}

function photo(name: 'play' | 'cave', src: string, alt: string, width: number, height: number, caption: string) {
  const crop = crops[name]
  return `
    <figure class="about-figure about-figure--${name}">
      <div class="about-photo" data-photo="${name}">
        <img src="${withBase(src)}" alt="${alt}" width="${width}" height="${height}" style="${cropStyle(crop)}; --focus-x: ${crop[0]}%; --focus-y: ${crop[1]}%">
      </div>
      <figcaption>${caption}</figcaption>
    </figure>`
}

const emphasis = [
  'creative developer',
  'game development and 3D art',
  'moved much further into programming',
  'my full effort',
  'indie studio',
]

function paragraph(text: string) {
  let html = text.replace('University Medical Center Groningen', projectLink('umcg-cave', 'University Medical Center Groningen'))
  for (const phrase of emphasis) html = html.replace(phrase, `<strong>${phrase}</strong>`)
  return `<p>${html}</p>`
}

export function renderAbout() {
  const paragraphs = aboutStory.map(paragraph)
  const lead = paragraphs.slice(0, 2).join('')
  const rest = paragraphs.slice(2).join('')
  const facts = aboutFacts.map((fact) => `<div><dt>${fact.term}</dt><dd>${fact.value}</dd></div>`).join('')

  return renderShell(`
    <main class="doc about">
      <header class="doc-head">
        <p class="eyebrow">About</p>
        <h1>${site.fullName}</h1>
      </header>
      <div class="about-layout">
        ${photo('play', '/about/demo.jpg', 'Len Demiri Lazić smiling at a Bug Brigade demo', 768, 1024, `Showing ${projectLink('bug-brigade', 'Bug Brigade')}`)}
        <div class="about-copy about-copy--lead"><div class="prose">${lead}</div></div>
        <div class="about-copy about-copy--rest"><div class="prose">${rest}</div></div>
        ${photo('cave', '/about/cave.jpg', 'Len Demiri Lazić calibrating the CAVE at UMCG', 2000, 1506, `Calibrating the CAVE at ${projectLink('umcg-cave', 'UMCG')}`)}
        <dl class="about-facts">${facts}</dl>
        <p class="about-next">
          <a href="${withBase('/work')}" data-link>View the work <span aria-hidden="true">→</span></a>
          <a href="${withBase('/contact')}" data-link>Get in touch <span aria-hidden="true">→</span></a>
        </p>
      </div>
    </main>
  `)
}

export function mountAbout(root: HTMLElement) {
  const frames = [...root.querySelectorAll<HTMLElement>('.about-photo')]
  const mounted = frames.flatMap((frame) => {
    const img = frame.querySelector('img')
    const crop = crops[frame.dataset.photo ?? '']
    if (!img || !crop) return []
    const dither = ditherCover(frame, img, 140, 'frame', 0, crop)
    const entrance = ditherEntrance(frame, dither, () => window.setTimeout(() => dither.set(0), 140))
    const stopFeather = ditherFeather(frame)
    return [{ frame, dither, entrance, stopFeather }]
  })
  if (!mounted.length) return () => {}

  const stopView = onFirstView(
    mounted.map((item) => item.frame),
    (element) => mounted.find((item) => item.frame === element)?.entrance.enter(),
  )

  return () => {
    stopView()
    for (const item of mounted) {
      item.entrance.wake()
      item.dither.stop()
      item.stopFeather()
    }
  }
}
