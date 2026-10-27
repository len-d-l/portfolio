import { cropStyle, imageFocus } from '../content/focus.ts'
import { orderedImages } from '../content/order.ts'
import { mediaUrl, projectBySlug, projectsNewestFirst, type Project } from '../content/projects.ts'
import { ditherCover, ditherEntrance, ditherFeather, onFirstView, type DitherCover } from '../dither.ts'
import { mountDeskObjects } from '../fx/deskObjects.ts'
import { scrambleOnView } from '../fx/scramble.ts'
import { layoutGallery, whenDecoded } from '../gallery.ts'
import { closeLightbox, openLightbox } from '../lightbox.ts'
import { withBase } from '../router.ts'
import { renderNotFound } from './notFound.ts'
import { renderShell } from '../ui.ts'

function renderPagerLink(project: Project, side: 'start' | 'end') {
  const cover = orderedImages(project)[0]
  return `
    <a class="pager-link pager-link--${side === 'end' ? 'next' : 'prev'}" href="${withBase(`/work/${project.slug}`)}" data-link>
      ${cover ? `<span class="pager-thumb" data-slug="${project.slug}"><img src="${mediaUrl(project, cover.file)}" data-file="${cover.file}" style="${cropStyle(imageFocus(project, cover.file))}" alt="" loading="lazy" decoding="async"></span>` : ''}
      <span class="pager-copy">
        <span class="pager-dir">${side === 'start' ? '← Older' : 'Newer →'}</span>
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
      ${older ? renderPagerLink(older, 'start') : '<span></span>'}
      ${newer ? renderPagerLink(newer, 'end') : '<span></span>'}
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
  const clipCount = project.videos?.length ?? 0
  const media = project.video
    ? 'Video'
    : [
        project.images.length ? `${project.images.length} ${project.images.length === 1 ? 'image' : 'images'}` : '',
        clipCount ? `${clipCount} ${clipCount === 1 ? 'video' : 'videos'}` : '',
      ]
        .filter(Boolean)
        .join(' · ')

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
      ${
        project.videos?.length
          ? `<div class="project-clips">${project.videos
              .map(
                (clip) => `
            <figure>
              <video controls preload="metadata" src="${mediaUrl(project, clip.file)}"></video>
              ${clip.title ? `<figcaption>${clip.title}</figcaption>` : ''}
            </figure>`,
              )
              .join('')}</div>`
          : ''
      }
      ${renderPager(project)}
    </main>
  `)
}

function mountPager(root: HTMLElement) {
  const dithers: DitherCover[] = []
  const stops: Array<() => void> = []
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches

  root.querySelectorAll<HTMLElement>('.pager-thumb').forEach((frame) => {
    const img = frame.querySelector('img')
    const project = frame.dataset.slug ? projectBySlug(frame.dataset.slug) : undefined
    if (!img || !project) return
    const dither = ditherCover(frame, img, 72, 'frame', 0, imageFocus(project, img.dataset.file ?? ''))
    const entrance = ditherEntrance(frame, dither)
    dithers.push(dither)
    stops.push(ditherFeather(frame, 8, 2))
    const reveal = (on: boolean) => {
      entrance.wake()
      dither.set(on ? 0 : 1)
    }
    const link = frame.closest('a')
    if (fine && link) {
      link.addEventListener('pointerenter', () => reveal(true))
      link.addEventListener('pointerleave', () => reveal(false))
      link.addEventListener('focus', () => reveal(true))
      link.addEventListener('blur', () => reveal(false))
    }
    const start = () => {
      if (!frame.isConnected) return
      stops.push(onFirstView([frame], () => entrance.enter()))
    }
    if (img.complete && img.naturalWidth) start()
    else img.addEventListener('load', start, { once: true })
  })

  return () => {
    stops.forEach((stop) => stop())
    dithers.forEach((dither) => dither.stop())
  }
}

export function mountProject(root: HTMLElement, slug: string) {
  const gallery = root.querySelector<HTMLElement>('.gallery')
  const project = projectBySlug(slug)
  if (!gallery || !project) return () => {}

  const stopObject = mountDeskObjects(root, '.project-facts')
  const stopScramble = scrambleOnView(root, '.project-facts dt, .pager-dir')
  const stopDecor = () => {
    stopObject()
    stopScramble()
  }

  const stopPager = mountPager(root)

  // Upright clips are scaled down to the height of a 16:9 clip, so they don't tower over the rest.
  root.querySelectorAll<HTMLVideoElement>('.project-clips video').forEach((video) => {
    const fit = () => {
      if (video.videoHeight <= video.videoWidth) return
      const figure = video.closest<HTMLElement>('figure')
      figure?.classList.add('portrait')
      figure?.style.setProperty('--clip-ratio', String(video.videoWidth / video.videoHeight))
    }
    if (video.readyState >= 1) fit()
    else video.addEventListener('loadedmetadata', fit, { once: true })
  })

  if (project.video) {
    const poster = orderedImages(project)[0] ? ` poster="${mediaUrl(project, orderedImages(project)[0].file)}"` : ''
    const title = project.video.title ? `<figcaption>${project.video.title}</figcaption>` : ''
    gallery.innerHTML = `<figure><video controls preload="metadata"${poster} src="${mediaUrl(project, project.video.file)}"></video>${title}</figure>`
    return () => {
      stopDecor()
      stopPager()
    }
  }

  const layout = layoutGallery(gallery, {
    target: (width, phone) => (phone ? 112 : Math.round(Math.min(210, Math.max(140, width * 0.17)))),
  })
  const dithers: DitherCover[] = []
  const entrances = new Map<Element, () => void>()
  const items = orderedImages(project).map((image) => ({ src: mediaUrl(project, image.file), title: image.title, file: image.file }))
  items.forEach((item, index) => {
    const shot = document.createElement('button')
    shot.type = 'button'
    shot.className = 'shot'
    shot.dataset.file = item.file
    if (item.title) shot.dataset.title = item.title
    shot.setAttribute('aria-label', `View ${item.title || `image ${index + 1} of ${items.length}`} full screen`)
    const img = document.createElement('img')
    img.src = item.src
    img.alt = ''
    shot.append(img)
    const dither = ditherCover(shot, img, 110, 'image', 0)
    const entrance = ditherEntrance(shot, dither, () => window.setTimeout(() => dither.set(0), 140))
    dithers.push(dither)
    entrances.set(shot, entrance.enter)
    shot.addEventListener('click', () => {
      if (document.documentElement.classList.contains('is-arranging')) return
      const current = [...gallery.querySelectorAll<HTMLElement>('.shot')]
      openLightbox(
        current.map((still) => ({ src: still.querySelector('img')?.src ?? '', title: still.dataset.title })),
        current,
        Math.max(0, current.indexOf(shot)),
        project.title,
      )
    })
    gallery.append(shot)
  })
  let stopEntrances = () => {}
  void whenDecoded(gallery).then(() => {
    if (!gallery.isConnected) return
    layout.relayout()
    requestAnimationFrame(() => {
      if (gallery.isConnected) stopEntrances = onFirstView(entrances.keys(), (element) => entrances.get(element)?.())
    })
  })

  let stopArrange = () => {}
  let unmounted = false
  if (import.meta.env.DEV && items.length > 1) {
    void import('../dev/arrangeTool.ts').then(({ mountArrangeTool }) => {
      if (unmounted || !gallery.isConnected) return
      stopArrange = mountArrangeTool(gallery, project.slug, () => layout.relayout())
    })
  }

  return () => {
    unmounted = true
    stopArrange()
    layout.stop()
    stopEntrances()
    dithers.forEach((dither) => dither.stop())
    closeLightbox()
    stopDecor()
    stopPager()
  }
}
