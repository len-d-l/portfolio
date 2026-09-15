import { copyFileSync, existsSync } from 'node:fs'
import { defineConfig } from 'vite'

function githubPagesBase() {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!repo || repo.endsWith('.github.io')) return '/'
  return `/${repo}/`
}

export default defineConfig({
  base: githubPagesBase(),
  server: {
    host: true,
    port: 5173,
  },
  plugins: [
    {
      name: 'github-pages-spa-fallback',
      closeBundle() {
        if (existsSync('dist/index.html')) {
          copyFileSync('dist/index.html', 'dist/404.html')
        }
      },
    },
  ],
})
