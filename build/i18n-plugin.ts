/**
 * 构建时 i18n 插件：源 HTML（中文）为唯一来源，
 * 构建时按 locales/en/*.json 生成 /en/ 子目录下的英文变体（零运行时开销）。
 *
 * 标注约定（写在源 HTML 上）：
 * - data-i18n="key"        → 替换 textContent
 * - data-i18n-html="key"   → 替换 innerHTML（含内联标签的富文本）
 * - data-i18n-attrs="content:key; aria-label:key2" → 替换属性
 * - data-i18n-jsonld="key" → 用字典里的 JSON 对象整体替换 <script type="application/ld+json"> 内容
 * - data-lang-switch       → 语言切换链接，href 由插件按页面填充
 *
 * 英文变体同时获得：lang="en"、og:locale=en_US、内链加 /en 前缀、
 * canonical/og:url 改写、hreflang 三连（与中文版共用注入逻辑）。
 */

import { parse } from 'node-html-parser'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'

const ORIGIN = 'https://speed.ciallo.de'
const PAGES = ['index', 'guide', 'wifi-tips', 'how-it-works', 'why-different', 'faq', '404'] as const
type PageName = (typeof PAGES)[number]

type Dict = Record<string, string | Record<string, unknown>>

const zhPath = (page: PageName) => (page === 'index' ? '/' : `/${page}.html`)
const enPath = (page: PageName) => (page === 'index' ? '/en/' : `/en/${page}.html`)
const enFileName = (page: PageName) => (page === 'index' ? 'en/index.html' : `en/${page}.html`)

// vite.config 会被 Vite 打包到临时目录执行，import.meta.url 不可靠，统一用项目根定位
const projectRoot = () => process.cwd()
const localesDir = () => `${projectRoot()}/locales/en/`

function loadDict(page: PageName): Dict {
  const dir = localesDir()
  const readJson = (path: string): Dict => {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Dict
    } catch {
      console.warn(`[i18n] 缺少词典 ${path}，该页将不生成翻译`)
      return {}
    }
  }
  return { ...readJson(`${dir}shared.json`), ...readJson(`${dir}${page}.json`) }
}

/** hreflang 三连（404 为 noindex，不参与互链） */
function hreflangLinks(page: PageName): string {
  if (page === '404') return ''
  const zh = ORIGIN + zhPath(page)
  const en = ORIGIN + enPath(page)
  return [
    `<link rel="alternate" hreflang="zh-CN" href="${zh}" />`,
    `<link rel="alternate" hreflang="en" href="${en}" />`,
    `<link rel="alternate" hreflang="x-default" href="${zh}" />`,
  ].join('\n')
}

/** 中文版注入：切换链接 + hreflang（正则做最小改动，保留原文件格式） */
function injectZh(html: string, page: PageName): string {
  let out = html
  out = out.replace(
    /(<a\b[^>]*data-lang-switch[^>]*?href=")[^"]*(")/,
    `$1${enPath(page)}$2`,
  )
  const links = hreflangLinks(page)
  if (links) out = out.replace('</head>', `${links}\n  </head>`)
  return out
}

/** 站内链接加 /en 前缀：仅匹配 "/"、"/xxx.html" 及同域绝对路径（不动锚点/外链/静态资源） */
function rewriteInternalHref(href: string): string {
  let m = href.match(/^\/(?:([\w-]+\.html))?(#.*|\?.*)?$/)
  if (m) return '/en' + (m[1] ? `/${m[1]}` : '/') + (m[2] ?? '')
  m = href.match(new RegExp(`^${ORIGIN}/(?:([\\w-]+\\.html))?(#.*|\\?.*)?$`))
  if (m) return '/en' + (m[1] ? `/${m[1]}` : '/') + (m[2] ?? '')
  return href
}

function rewriteCanonical(url: string): string {
  if (url === ORIGIN || url === `${ORIGIN}/`) return `${ORIGIN}/en/`
  if (url.startsWith(`${ORIGIN}/`)) return `${ORIGIN}/en/${url.slice(ORIGIN.length + 1)}`
  return url
}

function applyDict(root: ReturnType<typeof parse>, dict: Dict): void {
  for (const el of root.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-attrs],[data-i18n-jsonld]')) {
    const key = el.getAttribute('data-i18n')
    if (key && typeof dict[key] === 'string') el.textContent = dict[key] as string

    const keyHtml = el.getAttribute('data-i18n-html')
    if (keyHtml && typeof dict[keyHtml] === 'string') el.innerHTML = dict[keyHtml] as string

    const attrs = el.getAttribute('data-i18n-attrs')
    if (attrs) {
      for (const pair of attrs.split(';')) {
        const idx = pair.indexOf(':')
        if (idx < 0) continue
        const attr = pair.slice(0, idx).trim()
        const key = pair.slice(idx + 1).trim()
        if (attr && typeof dict[key] === 'string') el.setAttribute(attr, dict[key] as string)
      }
    }

    const keyLd = el.getAttribute('data-i18n-jsonld')
    if (keyLd && dict[keyLd] && typeof dict[keyLd] === 'object') {
      el.innerHTML = `\n      ${JSON.stringify(dict[keyLd], null, 2)}\n    `
    }
  }
}

/** 由已构建（或 dev 源码）的中文 HTML 生成英文变体 */
function toEnglish(html: string, dict: Dict, page: PageName): string {
  // noscript 内容需可解析才能翻译；script 保持原文（JSON-LD 走 data-i18n-jsonld 整体替换）
  const root = parse(html, { blockTextElements: { script: true, noscript: false, style: true, pre: true } })
  root.querySelector('html')?.setAttribute('lang', 'en')
  root.querySelector('meta[property="og:locale"]')?.setAttribute('content', 'en_US')

  applyDict(root, dict)

  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? ''
    const next = rewriteInternalHref(href)
    if (next !== href) a.setAttribute('href', next)
  }
  const canonical = root.querySelector('link[rel="canonical"]')
  if (canonical) canonical.setAttribute('href', rewriteCanonical(canonical.getAttribute('href') ?? ''))
  const ogUrl = root.querySelector('meta[property="og:url"]')
  if (ogUrl) ogUrl.setAttribute('content', rewriteCanonical(ogUrl.getAttribute('content') ?? ''))

  const langSwitch = root.querySelector('[data-lang-switch]')
  langSwitch?.setAttribute('href', zhPath(page))

  return root.outerHTML
}

/** dev 下拦截 /en/* 请求，实时生成英文页面 */
function devMiddleware(server: ViteDevServer): void {
  server.middlewares.use((req, res, next) => {
    void (async () => {
      const raw = (req.url ?? '').split(/[?#]/)[0]
      if (!/^\/en(?:\/|$)/.test(raw)) return next()
      const rel =
        raw === '/en' || raw === '/en/' ? '/index.html' : raw.replace(/^\/en\//, '/')
      if (!rel.endsWith('.html')) return next()

      const page = rel.replace(/^\//, '').replace(/\.html$/, '') as PageName
      if (!PAGES.includes(page)) return next()

      const fsPath = `${projectRoot()}${rel}`
      let html: string
      try {
        html = readFileSync(fsPath, 'utf8')
      } catch {
        return next()
      }
      html = await server.transformIndexHtml(req.url ?? raw, html)
      html = injectZh(html, page)
      html = toEnglish(html, loadDict(page), page)
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html)
    })().catch((err) => {
      console.error('[i18n] en 渲染失败:', err)
      next()
    })
  })
}

export function i18nPlugin(): Plugin {
  return {
    name: 'ciallospeed-i18n',
    configureServer: devMiddleware,
    // post：等 vite:build-html 把 html 入口转成 asset 后再处理
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!fileName.endsWith('.html')) continue
        const page = fileName.replace(/\.html$/, '') as PageName
        if (!PAGES.includes(page)) continue
        const asset = bundle[fileName]
        if (asset.type !== 'asset') continue

        const zhHtml = injectZh(String(asset.source), page)
        asset.source = zhHtml
        this.emitFile({
          type: 'asset',
          fileName: enFileName(page),
          source: toEnglish(zhHtml, loadDict(page), page),
        })
      }
      },
    },
  }
}
