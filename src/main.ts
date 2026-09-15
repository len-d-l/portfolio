import './style.css'
import { renderAbout } from './pages/about.ts'
import { renderContact } from './pages/contact.ts'
import { mountHome, renderHome } from './pages/home.ts'
import { renderNotFound } from './pages/notFound.ts'
import { mountProject, renderProject } from './pages/project.ts'
import { renderWork } from './pages/work.ts'
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

  if (route.name === 'project') {
    mountProject(app, route.slug)
  }

  window.scrollTo(0, 0)
}

window.addEventListener('popstate', () => {
  render()
})

render()
