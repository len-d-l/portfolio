import { projects } from '../content/projects.ts'
import { withBase } from '../router.ts'
import { renderShell } from '../ui.ts'

export function renderWork() {
  const items = projects
    .map(
      (project) => `
        <a class="work-row" href="${withBase(`/work/${project.slug}`)}" data-link>
          <span class="work-year">${project.year}</span>
          <span class="work-title">${project.title}</span>
          <span class="work-type">${project.type}</span>
        </a>
      `,
    )
    .join('')

  return renderShell(`
    <main class="doc">
      <header class="doc-head">
        <p class="eyebrow">Selected work</p>
        <h1>Projects</h1>
        <p class="lede">Older pieces from the previous site, kept here so the new one has something real in it. Newer work comes next.</p>
      </header>
      <div class="work-list">${items}</div>
    </main>
  `)
}
