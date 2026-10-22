import './style.css'
import { mountCursor } from './fx/cursor.ts'
import { renderAbout } from './pages/about.ts'
import { mountContact, renderContact } from './pages/contact.ts'
import { mountHome, renderHome } from './pages/home.ts'
import { renderNotFound } from './pages/notFound.ts'
import { mountProject, renderProject } from './pages/project.ts'
import { mountWork, renderWork } from './pages/work.ts'
import { currentRoute } from './router.ts'
import { bindLinks } from './ui.ts'

const appElement = document.querySelector<HTMLDivElement>('#app')
if (!appElement) throw new Error('Missing #app')
const app = appElement

let unmount: (() => void) | undefined

function render() {
  unmount?.()
  unmount = undefined

  const route = currentRoute()
  let html = ''

  switch (route.name) {
    case 'home':
      html = renderHome()
      break
    case 'work':
      html = renderWork()
      break
    case 'project':
      html = renderProject(route.slug)
      break
    case 'about':
      html = renderAbout()
      break
    case 'contact':
      html = renderContact()
      break
    default:
      html = renderNotFound()
  }

  app.innerHTML = html
  bindLinks(app)
  document.title =
    route.name === 'home' ? 'Len DL' : `${document.querySelector('h1')?.textContent ?? 'Len DL'} — Len DL`

  if (route.name === 'home') {
    unmount = mountHome(app)
  }

  if (route.name === 'work') {
    unmount = mountWork(app)
  }

  if (route.name === 'project') {
    unmount = mountProject(app, route.slug)
  }

  if (route.name === 'contact') {
    unmount = mountContact(app)
  }

  window.scrollTo(0, 0)
}

const calm = window.matchMedia('(prefers-reduced-motion: reduce)')

window.addEventListener('popstate', () => {
  if (!document.startViewTransition || calm.matches) {
    render()
    return
  }
  document.startViewTransition(render)
})

render()
mountCursor()
