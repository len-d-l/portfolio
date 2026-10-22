import { mediaUrl, projectBySlug, projectsNewestFirst, type Project } from '../content/projects.ts'
import { ditherCover, ditherEntrance, onFirstView, type DitherCover } from '../dither.ts'
import { mountDeskObjects } from '../fx/deskObjects.ts'
import { scrambleOnView } from '../fx/scramble.ts'
import { layoutGallery, whenDecoded } from '../gallery.ts'
import { closeLightbox, openLightbox } from '../lightbox.ts'
import { withBase } from '../router.ts'
import { renderNotFound } from './notFound.ts'
import { renderShell } from '../ui.ts'

function renderPagerLink(project: Project, direction: 'prev' | 'next') {
  const cover = project.images[0]
  return `
    <a class="pager-link pager-link--${direction}" href="${withBase(`/work/${project.slug}`)}" data-link>
      ${cover ? `<img src="${mediaUrl(project, cover.file)}" alt="" loading="lazy" decoding="async">` : ''}
      <span class="pager-copy">
        <span class="pager-dir">${direction === 'prev' ? '← Newer' : 'Older →'}</span>
        <span class="pager-title">${project.title}</span>
        <span class="pager-type">${project.type}</span>
      </span>
    </a>
  `
}

function renderPager(project: Project) {
  const order = projectsNewestFirst()
  const at = order.findIndex((item) => item.slug === project.slug)
  const newer = order[at - 1]
  const older = order[at + 1]
  return `
    <nav class="project-pager" aria-label="More projects">
      ${newer ? renderPagerLink(newer, 'prev') : '<span></span>'}
      ${older ? renderPagerLink(older, 'next') : ''}
    </nav>
  `
}

export function renderProject(slug: string) {
  const project = projectBySlug(slug)
  if (!project) return renderNotFound()

  const fact = (term: string, value: string) => `<div><dt>${term}</dt><dd>${value}</dd></div>`
  const links = project.links?.length
    ? fact('Links', project.links.map((link) => `<a href="${link.href}" target="_blank" rel="noreferrer">${link.label} ↗</a>`).join('<br>'))
    : ''
  const media = project.video ? 'Video' : `${project.images.length} ${project.images.length === 1 ? 'image' : 'images'}`

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
      </header>
      <div class="project-body">
        <aside class="project-facts" aria-label="Project facts">
          ${project.desk ? `<span class="desk-object" data-slug="${project.slug}" aria-hidden="true"></span>` : ''}
          <dl>
            ${fact('When', project.dateLabel)}
            ${fact('Type', project.type)}
            ${fact('My part', project.role)}
            ${fact('Tools', project.tools.join('<br>'))}
            ${links}
            ${fact('Media', media)}
          </dl>
        </aside>
        <div class="prose">${body}</div>
      </div>
      <div class="gallery" data-slug="${project.slug}"></div>
      ${renderPager(project)}
    </main>
  `)
}

export function mountProject(root: HTMLElement, slug: string) {
  const gallery = root.querySelector<HTMLElement>('.gallery')
  const project = projectBySlug(slug)
  if (!gallery || !project) return () => {}

  const stopObject = mountDeskObjects(root, '.project-facts')
  const stopScramble = scrambleOnView(root, '.eyebrow, .project-facts dt, .pager-dir')
  const stopDecor = () => {
    stopObject()
    stopScramble()
  }

  if (project.video) {
    const poster = project.images[0] ? ` poster="${mediaUrl(project, project.images[0].file)}"` : ''
    gallery.innerHTML = `<video controls preload="metadata"${poster} src="${mediaUrl(project, project.video)}"></video>`
    return stopDecor
  }

  const layout = layoutGallery(gallery, {
    target: (width, phone) => (phone ? 112 : Math.round(Math.min(210, Math.max(140, width * 0.17)))),
  })
  const dithers: DitherCover[] = []
  const entrances = new Map<Element, () => void>()
  const items = project.images.map((image) => ({ src: mediaUrl(project, image.file), title: image.title }))
  const shots = items.map((item, index) => {
    const shot = document.createElement('button')
    shot.type = 'button'
    shot.className = 'shot'
    shot.setAttribute('aria-label', `View ${item.title || `image ${index + 1} of ${items.length}`} full screen`)
    const img = document.createElement('img')
    img.src = item.src
    img.alt = ''
    shot.append(img)
    const dither = ditherCover(shot, img, 110, 'image', 0)
    const entrance = ditherEntrance(shot, dither, () => window.setTimeout(() => dither.set(0), 140))
    dithers.push(dither)
    entrances.set(shot, entrance.enter)
    shot.addEventListener('click', () => openLightbox(items, shots, index, project.title))
    gallery.append(shot)
    return shot
  })
  let stopEntrances = () => {}
  void whenDecoded(gallery).then(() => {
    if (!gallery.isConnected) return
    layout.relayout()
    requestAnimationFrame(() => {
      if (gallery.isConnected) stopEntrances = onFirstView(entrances.keys(), (element) => entrances.get(element)?.())
    })
  })

  return () => {
    layout.stop()
    stopEntrances()
    dithers.forEach((dither) => dither.stop())
    closeLightbox()
    stopDecor()
  }
}
