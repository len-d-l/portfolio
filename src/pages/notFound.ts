import { withBase } from '../router.ts'
import { renderShell } from '../ui.ts'

export function renderNotFound() {
  return renderShell(`
    <main class="doc">
      <header class="doc-head">
        <p class="eyebrow">404</p>
        <h1>Nothing on this part of the desk.</h1>
        <p class="lede"><a href="${withBase('/work')}" data-link>Back to work</a></p>
      </header>
    </main>
  `)
}
