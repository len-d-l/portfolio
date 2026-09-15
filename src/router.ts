export type Route =
  | { name: 'home' }
  | { name: 'work' }
  | { name: 'project'; slug: string }
  | { name: 'about' }
  | { name: 'contact' }
  | { name: 'not-found' }

function baseUrl() {
  const base = import.meta.env.BASE_URL
  return base.endsWith('/') ? base : `${base}/`
}

export function withBase(path: string) {
  const base = baseUrl()
  if (path === '/') return base
  return `${base}${path.replace(/^\//, '')}`
}

export function stripBase(pathname: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  if (!base) return pathname || '/'
  if (pathname === base || pathname === `${base}/`) return '/'
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || '/'
  return pathname || '/'
}

export function parseRoute(pathname: string): Route {
  const path = stripBase(pathname).replace(/\/+$/, '') || '/'
  if (path === '/') return { name: 'home' }
  if (path === '/work') return { name: 'work' }
  if (path === '/about') return { name: 'about' }
  if (path === '/contact') return { name: 'contact' }

  const project = path.match(/^\/work\/([^/]+)$/)
  if (project) return { name: 'project', slug: decodeURIComponent(project[1]) }

  return { name: 'not-found' }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return withBase('/')
    case 'work':
      return withBase('/work')
    case 'project':
      return withBase(`/work/${route.slug}`)
    case 'about':
      return withBase('/about')
    case 'contact':
      return withBase('/contact')
    default:
      return withBase('/')
  }
}

export function navigate(path: string) {
  const full = withBase(stripBase(path))
  const current = `${window.location.pathname}${window.location.search}`
  if (current === full || current === full.replace(/\/$/, '')) {
    window.dispatchEvent(new PopStateEvent('popstate'))
    return
  }
  window.history.pushState({}, '', full)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function currentRoute(): Route {
  return parseRoute(window.location.pathname)
}
