import { projectBySlug } from '../content/projects.ts'
import { withBase } from '../router.ts'
import { renderNotFound } from './notFound.ts'
import { renderShell } from '../ui.ts'

async function imageExists(url: string) {
  try {
    const response = await fetch(url)
    const type = response.headers.get('content-type') ?? ''
    return response.ok && type.startsWith('image/')
  } catch {
    return false
  }
}

async function projectImages(slug: string) {
  const names = ['cover.jpg', 'cover.png', 'cover.webp', '1.jpg', '2.jpg', '3.jpg', '4.jpg']
  const checks = names.map(async (name) => {
    const url = `${import.meta.env.BASE_URL}projects/${slug}/${name}`
    return (await imageExists(url)) ? url : null
  })
  return (await Promise.all(checks)).filter((url): url is string => url !== null)
}

export function renderProject(slug: string) {
  const project = projectBySlug(slug)
  if (!project) return renderNotFound()

  const links = project.links?.length
    ? `<p class="project-links">${project.links.map((link) => `<a href="${link.href}" target="_blank" rel="noreferrer">${link.label}</a>`).join(' · ')}</p>`
    : ''

  const body = project.sections
    .map(
      (section) => `
        ${section.heading ? `<h2>${section.heading}</h2>` : ''}
        <p>${section.body}</p>
      `,
    )
    .join('')

  return renderShell(`
    <main class="doc project">
      <p class="eyebrow"><a href="${withBase('/work')}" data-link>Work</a> / ${project.year}</p>
      <header class="doc-head">
        <h1>${project.title}</h1>
        <p class="meta">${project.type} · ${project.role}</p>
        <p class="tools">${project.tools.join(' · ')}</p>
        ${links}
      </header>
      <div class="gallery" data-slug="${project.slug}"></div>
      <div class="prose">${body}</div>
    </main>
  `)
}

export function mountProject(root: HTMLElement, slug: string) {
  const gallery = root.querySelector('.gallery')
  const project = projectBySlug(slug)
  if (!gallery || !project) return

  void projectImages(slug).then((images) => {
    if (!images.length) return
    gallery.innerHTML = images
      .map((src) => `<img src="${src}" alt="${project.title}">`)
      .join('')
  })
}

