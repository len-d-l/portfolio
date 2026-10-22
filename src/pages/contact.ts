import { site } from '../content/site.ts'
import { renderShell } from '../ui.ts'

const items = (list: string[]) => list.map((item) => `<span>${item}</span>`).join(' · ')

export function renderContact() {
  return renderShell(`
    <main class="doc">
      <header class="doc-head">
        <p class="eyebrow">Contact</p>
        <h1>Say hello</h1>
        <p class="lede">Studio roles or freelance — 3D, technical art, or the code that makes it playable.</p>
      </header>
      <div class="contact-grid">
        <div class="contact-main">
          <p class="contact-label">Email</p>
          <div class="contact-email">
            <a href="mailto:${site.email}">${site.email}</a>
            <button type="button" class="contact-copy" data-copy="${site.email}">Copy</button>
          </div>
          <ul class="contact-list">
            <li><a href="${site.linkedin}" target="_blank" rel="noreferrer">LinkedIn ↗</a></li>
            <li><a href="${site.artstation}" target="_blank" rel="noreferrer">ArtStation ↗</a></li>
          </ul>
        </div>
        <dl class="contact-facts">
          <div><dt>Based in</dt><dd>${site.location}</dd></div>
          <div><dt>Working</dt><dd>${items(site.workModes)}</dd></div>
          <div><dt>Looking for</dt><dd>${items(site.lookingFor)}</dd></div>
          <div><dt>Tools</dt><dd>${items(site.tools)}</dd></div>
        </dl>
      </div>
    </main>
  `)
}

export function mountContact(root: HTMLElement) {
  const onClick = async (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-copy]') : null
    if (!button?.dataset.copy) return
    try {
      await navigator.clipboard.writeText(button.dataset.copy)
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Selected'
      const link = button.previousElementSibling
      if (link) window.getSelection()?.selectAllChildren(link)
    }
    window.setTimeout(() => (button.textContent = 'Copy'), 1600)
  }
  root.addEventListener('click', onClick)
  return () => root.removeEventListener('click', onClick)
}
