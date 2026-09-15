import { site } from './content/site.ts'
import { currentRoute, navigate, withBase } from './router.ts'

const links = [
  { href: '/work', label: 'Work' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const

function isCurrent(href: string) {
  const route = currentRoute()
  if (href === '/work') return route.name === 'work' || route.name === 'project'
  if (href === '/about') return route.name === 'about'
  if (href === '/contact') return route.name === 'contact'
  return false
}

export function renderShell(main: string, options?: { home?: boolean }) {
  const home = options?.home ?? false
  return `
    <div class="page ${home ? 'page--home' : ''}">
      <a class="skip" href="${withBase('/work')}" data-link>Skip to work</a>
      <header class="hud">
        <a class="brand" href="${withBase('/')}" data-link>${site.name}</a>
        <nav class="nav" aria-label="Primary">
          ${links
            .map(
              (link) => `
            <a href="${withBase(link.href)}" data-link class="${isCurrent(link.href) ? 'is-current' : ''}">${link.label}</a>
          `,
            )
            .join('')}
        </nav>
      </header>
      ${main}
    </div>
  `
}

export function bindLinks(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>('a[data-link]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('http')) return
      event.preventDefault()
      navigate(href)
    })
  })
}
