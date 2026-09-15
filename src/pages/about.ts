import { aboutStory, site } from '../content/site.ts'
import { renderShell } from '../ui.ts'

export function renderAbout() {
  const paragraphs = aboutStory.map((text) => `<p>${text}</p>`).join('')

  return renderShell(`
    <main class="doc">
      <header class="doc-head">
        <p class="eyebrow">About</p>
        <h1>${site.fullName}</h1>
        <p class="lede">${site.tagline}</p>
      </header>
      <div class="prose">${paragraphs}</div>
      <p class="meta">${site.location} · ${site.available}</p>
    </main>
  `)
}
