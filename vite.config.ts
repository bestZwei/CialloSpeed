import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { i18nPlugin } from './build/i18n-plugin'

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url))

// MPA 多入口：5 个内容页 + 404
export default defineConfig({
  // 绝对资源路径，/en/ 子目录下的英文变体才能正确引用 /assets/*
  base: '/',
  plugins: [i18nPlugin()],
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
        whyDifferent: page('why-different'),
        faq: page('faq'),
        notFound: page('404'),
      },
    },
  },
})
