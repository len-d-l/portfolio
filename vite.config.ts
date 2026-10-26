import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { projects } from './src/content/projects.ts'
import { site } from './src/content/site.ts'

function githubPagesBase() {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!repo || repo.endsWith('.github.io')) return '/'
  return `/${repo}/`
}

const base = githubPagesBase()
const owner = process.env.GITHUB_REPOSITORY?.split('/')[0] ?? 'len-d-l'
const siteUrl = `https://${owner.toLowerCase()}.github.io${base}`

type Meta = { title: string; description: string; image: string; path: string }

const attr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

function clip(text: string, length = 160) {
  return text.length <= length ? text : `${text.slice(0, text.lastIndexOf(' ', length - 1))}…`
}

const homeMeta: Meta = {
  title: site.name,
  description: `${site.fullName}: 3D artist and developer. Portfolio of games, models, and interactive work.`,
  image: 'og.jpg',
  path: '',
}

function pageMeta(): Meta[] {
  const pages: Meta[] = [
    { title: `Projects — ${site.name}`, description: 'Games, 3D models and graphic work, newest first.', image: 'og.jpg', path: 'work/' },
    { title: `About — ${site.name}`, description: homeMeta.description, image: 'og.jpg', path: 'about/' },
    { title: `Contact — ${site.name}`, description: site.available, image: 'og.jpg', path: 'contact/' },
  ]
  for (const project of projects) {
    const cover = coverFile(project)
    pages.push({
      title: `${project.title} — ${site.name}`,
      description: clip(`${project.type}. ${project.sections[0]?.body ?? project.role}`),
      image: cover ? `projects/${project.slug}/${cover}` : 'og.jpg',
      path: `work/${project.slug}/`,
    })
  }
  return pages
}

function metaTags(meta: Meta) {
  const url = `${siteUrl}${meta.path}`
  return [
    `<meta name="description" content="${attr(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${attr(site.name)}" />`,
    `<meta property="og:title" content="${attr(meta.title)}" />`,
    `<meta property="og:description" content="${attr(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${siteUrl}${meta.image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ')
}

const metaBlock = /<!-- meta -->[\s\S]*?<!-- \/meta -->/

const focusFile = 'src/content/focus.json'
const orderFile = 'src/content/order.json'

function coverFile(project: (typeof projects)[number]) {
  try {
    const orders = JSON.parse(readFileSync(orderFile, 'utf8')) as Record<string, string[]>
    const known = new Set(project.images.map((image) => image.file))
    return orders[project.slug]?.find((file) => known.has(file)) ?? project.images[0]?.file
  } catch {
    return project.images[0]?.file
  }
}

export default defineConfig({
  base,
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/*.mp4'],
    },
  },
  plugins: [
    {
      name: 'preview-focus',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__focus', (request, response) => {
          if (request.method !== 'POST') {
            response.statusCode = 405
            response.end()
            return
          }
          let raw = ''
          request.on('data', (chunk) => (raw += chunk))
          request.on('end', () => {
            try {
              const { key, focus } = JSON.parse(raw) as { key: string; focus: number[] }
              const [x = 50, y = 50, zoom = 1] = focus
              const points = JSON.parse(readFileSync(focusFile, 'utf8')) as Record<string, number[]>
              if (x === 50 && y === 50 && zoom === 1) delete points[key]
              else points[key] = zoom === 1 ? [x, y] : [x, y, zoom]
              const sorted = Object.fromEntries(Object.entries(points).sort(([a], [b]) => a.localeCompare(b)))
              writeFileSync(focusFile, `${JSON.stringify(sorted, null, 2)}\n`)
              response.statusCode = 204
            } catch {
              response.statusCode = 400
            }
            response.end()
          })
        })
      },
      handleHotUpdate({ file }) {
        const path = file.replaceAll('\\', '/')
        if (path.endsWith(focusFile) || path.endsWith(orderFile)) return []
      },
    },
    {
      name: 'image-order',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__order', (request, response) => {
          if (request.method !== 'POST') {
            response.statusCode = 405
            response.end()
            return
          }
          let raw = ''
          request.on('data', (chunk) => (raw += chunk))
          request.on('end', () => {
            try {
              const { slug, files } = JSON.parse(raw) as { slug: string; files: string[] }
              if (!slug || !Array.isArray(files) || files.some((file) => typeof file !== 'string')) throw new Error('bad order')
              const orders = JSON.parse(readFileSync(orderFile, 'utf8')) as Record<string, string[]>
              orders[slug] = files
              const sorted = Object.fromEntries(Object.entries(orders).sort(([a], [b]) => a.localeCompare(b)))
              writeFileSync(orderFile, `${JSON.stringify(sorted, null, 2)}\n`)
              response.statusCode = 204
            } catch {
              response.statusCode = 400
            }
            response.end()
          })
        })
      },
    },
    {
      name: 'share-meta',
      transformIndexHtml(html) {
        return html.replace(metaBlock, `<!-- meta -->\n    ${metaTags(homeMeta)}\n    <!-- /meta -->`)
      },
    },
    {
      name: 'github-pages-routes',
      closeBundle() {
        if (!existsSync('dist/index.html')) return
        copyFileSync('dist/index.html', 'dist/404.html')
        const shell = readFileSync('dist/index.html', 'utf8')
        for (const meta of pageMeta()) {
          const html = shell
            .replace(metaBlock, `<!-- meta -->\n    ${metaTags(meta)}\n    <!-- /meta -->`)
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(meta.title)}</title>`)
          mkdirSync(`dist/${meta.path}`, { recursive: true })
          writeFileSync(`dist/${meta.path}index.html`, html)
        }
      },
    },
  ],
})
