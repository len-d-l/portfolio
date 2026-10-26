import './style.css'
import { mountCursor } from './fx/cursor.ts'
import { mountAbout, renderAbout } from './pages/about.ts'
import { mountContact, renderContact } from './pages/contact.ts'
import { mountHome, renderHome } from './pages/home.ts'
import { renderNotFound } from './pages/notFound.ts'
import { mountProject, renderProject } from './pages/project.ts'
import { mountWork, renderWork } from './pages/work.ts'
import { scrambleOnView } from './fx/scramble.ts'
import { currentRoute } from './router.ts'
import { bindLinks, renderChrome, syncNav } from './ui.ts'

const appElement = document.querySelector<HTMLDivElement>('#app')
if (!appElement) throw new Error('Missing #app')
const app = appElement

let unmount: (() => void) | undefined
let stopScramble = () => {}

const labelScramble =
  '.doc-head .eyebrow, .about-facts dt, .about-figure figcaption, .about-next a, .contact-label, .contact-facts dt'

function render() {
  unmount?.()
  unmount = undefined
  stopScramble()
  stopScramble = () => {}

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

  app.querySelector('.page')?.remove()
  app.querySelector('.work-rail')?.remove()
  app.insertAdjacentHTML('beforeend', html)
  window.scrollTo(0, 0)
  const page = app.querySelector('.page')
  if (page) {
    bindLinks(page)
    stopScramble = scrambleOnView(page, labelScramble)
  }
  syncNav(app)
  app.classList.toggle('is-home', route.name === 'home')
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

  if (route.name === 'about') {
    unmount = mountAbout(app)
  }

  if (route.name === 'contact') {
    unmount = mountContact(app)
  }
}

window.addEventListener('popstate', render)

app.innerHTML = renderChrome()
bindLinks(app)
render()
mountCursor()
