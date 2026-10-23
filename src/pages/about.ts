import { cropStyle } from '../content/focus.ts'
import { aboutFacts, aboutStory, site } from '../content/site.ts'
import { ditherCover, ditherEntrance, ditherFeather, onFirstView, type Crop } from '../dither.ts'
import { withBase } from '../router.ts'
import { renderShell } from '../ui.ts'

/** Tighter than the full room, so the person reads first and the CAVE stays around them. */
const aboutCrop: Crop = [58, 42, 1.7]

export function renderAbout() {
  const paragraphs = aboutStory.map((text) => `<p>${text}</p>`).join('')
  const facts = aboutFacts.map((fact) => `<div><dt>${fact.term}</dt><dd>${fact.value}</dd></div>`).join('')

  return renderShell(`
    <main class="doc about">
      <header class="doc-head">
        <p class="eyebrow">About</p>
        <h1>${site.fullName}</h1>
      </header>
      <div class="about-layout">
        <figure class="about-figure">
          <div class="about-photo">
            <img src="${withBase('/about/cave.jpg')}" alt="Len Demiri Lazić calibrating the CAVE at UMCG" width="2000" height="1506" style="${cropStyle(aboutCrop)}; --focus-x: ${aboutCrop[0]}%; --focus-y: ${aboutCrop[1]}%">
          </div>
          <figcaption>Calibrating the CAVE at UMCG</figcaption>
        </figure>
        <div class="about-copy">
          <div class="prose">${paragraphs}</div>
          <dl class="about-facts">${facts}</dl>
          <p class="about-next">
            <a href="${withBase('/work')}" data-link>View the work <span aria-hidden="true">→</span></a>
            <a href="${withBase('/contact')}" data-link>Get in touch <span aria-hidden="true">→</span></a>
          </p>
        </div>
      </div>
    </main>
  `)
}

export function mountAbout(root: HTMLElement) {
  const frame = root.querySelector<HTMLElement>('.about-photo')
  const img = frame?.querySelector('img')
  if (!frame || !img) return () => {}

  const dither = ditherCover(frame, img, 140, 'frame', 0, aboutCrop)
  const stopFeather = ditherFeather(frame)
  const entrance = ditherEntrance(frame, dither, () => window.setTimeout(() => dither.set(0), 140))
  let stopView = () => {}
  const start = () => {
    stopView = onFirstView([frame], () => entrance.enter())
  }
  if (img.complete && img.naturalWidth) start()
  else img.addEventListener('load', start, { once: true })

  return () => {
    img.removeEventListener('load', start)
    stopView()
    entrance.wake()
    dither.stop()
    stopFeather()
  }
}
