import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url))

// MPA 多入口：5 个内容页 + 404
export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: page('index'),
        guide: page('guide'),
        wifiTips: page('wifi-tips'),
        howItWorks: page('how-it-works'),
        faq: page('faq'),
        notFound: page('404'),
      },
    },
  },
})
