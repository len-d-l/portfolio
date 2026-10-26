import { site } from './content/site.ts'
import { currentRoute, navigate, withBase } from './router.ts'

const links = [
  { href: '/', label: 'Home', mark: 'home' },
  { href: '/work', label: 'Work', mark: 'work' },
  { href: '/about', label: 'About', mark: 'about' },
  { href: '/contact', label: 'Contact', mark: 'contact' },
] as const

function isCurrent(href: string) {
  const route = currentRoute()
  if (href === '/') return route.name === 'home'
  if (href === '/work') return route.name === 'work' || route.name === 'project'
  if (href === '/about') return route.name === 'about'
  if (href === '/contact') return route.name === 'contact'
  return false
}

export function renderChrome() {
  return `
    <a class="skip" href="${withBase('/work')}" data-link>Skip to work</a>
    <header class="hud">
      <a class="brand" href="${withBase('/')}" data-link>${site.name}</a>
      <nav class="nav" aria-label="Primary">
        ${links
          .map(
            (link) => `
          <a href="${withBase(link.href)}" data-link data-nav="${link.mark}" class="nav-mark nav-mark-${link.mark}${isCurrent(link.href) ? ' is-current' : ''}"><span>${link.label}</span><i class="nav-line" aria-hidden="true"></i></a>
        `,
          )
          .join('')}
      </nav>
    </header>
  `
}

export function syncNav(root: ParentNode) {
  const route = currentRoute()
  const mark = route.name === 'project' ? 'work' : route.name
  root.querySelectorAll<HTMLAnchorElement>('.nav-mark').forEach((anchor) => {
    anchor.classList.toggle('is-current', anchor.dataset.nav === mark)
    anchor.classList.remove('is-armed')
  })
}

export function renderShell(main: string, options?: { home?: boolean }) {
  const home = options?.home ?? false
  return `<div class="page ${home ? 'page--home' : ''}">${main}</div>`
}

export function bindLinks(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>('a[data-link]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('http')) return
      event.preventDefault()
      if (anchor.classList.contains('nav-mark') && !anchor.classList.contains('is-current')) {
        anchor.classList.add('is-armed')
      }
      navigate(href)
    })
  })
}
