import { site } from '../content/site.ts'
import { renderShell } from '../ui.ts'

export function renderContact() {
  return renderShell(`
    <main class="doc">
      <header class="doc-head">
        <p class="eyebrow">Contact</p>
        <h1>Say hello</h1>
        <p class="lede">${site.available}</p>
      </header>
      <ul class="contact-list">
        <li><a href="mailto:${site.email}">${site.email}</a></li>
        <li><a href="${site.linkedin}" target="_blank" rel="noreferrer">LinkedIn</a></li>
        <li><a href="${site.artstation}" target="_blank" rel="noreferrer">ArtStation</a></li>
      </ul>
    </main>
  `)
}
