/**
 * 构建时 i18n 插件：源 HTML（中文）为唯一来源。
 * 路径约定：根路径为英文主站，中文变体放在 /zh/ 子目录。
 *
 * 标注约定（写在源 HTML 上）：
 * - data-i18n="key"        → 替换 textContent
 * - data-i18n-html="key"   → 替换 innerHTML（含内联标签的富文本）
 * - data-i18n-attrs="content:key; aria-label:key2" → 替换属性
 * - data-i18n-jsonld="key" → 用字典里的 JSON 对象整体替换 <script type="application/ld+json"> 内容
 * - data-lang-switch       → 语言切换链接，href 由插件按页面填充
 *
 * 两个变体都注入 hreflang 三连（zh-CN → /zh/，en → 根路径，x-default → 英文根）：
 * - 英文变体：lang="en"、og:locale=en_US、JSON-LD 由词典整体替换
 * - 中文变体：内链与 canonical/og:url 加 /zh 前缀
 */

import { parse } from 'node-html-parser'
import { readFileSync } from 'node:fs'
import type { Plugin, ViteDevServer } from 'vite'

const ORIGIN = 'https://speed.ciallo.de'
const PAGES = ['index', 'guide', 'wifi-tips', 'how-it-works', 'why-different', 'faq', '404'] as const
type PageName = (typeof PAGES)[number]

type Dict = Record<string, string | Record<string, unknown>>

/** 英文（主站）路径：根目录原文件名 */
const rootPath = (page: PageName) => (page === 'index' ? '/' : `/${page}.html`)
/** 中文变体路径：/zh/ 子目录 */
const zhPath = (page: PageName) => (page === 'index' ? '/zh/' : `/zh/${page}.html`)
const zhFileName = (page: PageName) => (page === 'index' ? 'zh/index.html' : `zh/${page}.html`)

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

/** hreflang 三连（404 为 noindex，不参与互链）；x-default 指向英文主站 */
function hreflangLinks(page: PageName): string {
  if (page === '404') return ''
  const en = ORIGIN + rootPath(page)
  const zh = ORIGIN + zhPath(page)
  return [
    `<link rel="alternate" hreflang="zh-CN" href="${zh}" />`,
    `<link rel="alternate" hreflang="en" href="${en}" />`,
    `<link rel="alternate" hreflang="x-default" href="${en}" />`,
  ].join('\n')
}

/** 注入语言切换链接 + hreflang（正则做最小改动，保留原文件格式） */
function injectLang(html: string, page: PageName, switchHref: string): string {
  let out = html.replace(
    /(<a\b[^>]*data-lang-switch[^>]*?href=")[^"]*(")/,
    `$1${switchHref}$2`,
  )
  const links = hreflangLinks(page)
  if (links) out = out.replace('</head>', `${links}\n  </head>`)
  return out
}

/** 英文变体注入：切换链接指向中文 /zh/ */
const injectEn = (html: string, page: PageName) => injectLang(html, page, zhPath(page))
/** 中文变体注入：切换链接指向英文根路径 */
const injectZh = (html: string, page: PageName) => injectLang(html, page, rootPath(page))

/** 站内链接加 /zh 前缀：仅匹配 "/"、"/xxx.html" 及同域绝对路径（不动锚点/外链/静态资源） */
function rewriteInternalHrefZh(href: string): string {
  let m = href.match(/^\/(?:([\w-]+\.html))?(#.*|\?.*)?$/)
  if (m) return '/zh' + (m[1] ? `/${m[1]}` : '/') + (m[2] ?? '')
  m = href.match(new RegExp(`^${ORIGIN}/(?:([\\w-]+\\.html))?(#.*|\\?.*)?$`))
  if (m) return ORIGIN + '/zh' + (m[1] ? `/${m[1]}` : '/') + (m[2] ?? '')
  return href
}

function rewriteCanonicalZh(url: string): string {
  if (url === ORIGIN || url === `${ORIGIN}/`) return `${ORIGIN}/zh/`
  if (url.startsWith(`${ORIGIN}/`)) return `${ORIGIN}/zh/${url.slice(ORIGIN.length + 1)}`
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

/** 由中文源 HTML 生成英文主站页面：内链/canonical 保持根路径不变 */
function toEnglish(html: string, dict: Dict): string {
  const root = parse(html, { blockTextElements: { script: true, noscript: false, style: true, pre: true } })
  root.querySelector('html')?.setAttribute('lang', 'en')
  root.querySelector('meta[property="og:locale"]')?.setAttribute('content', 'en_US')
  applyDict(root, dict)
  return root.outerHTML
}

/** 由中文源 HTML 生成 /zh/ 中文变体：内链与 canonical/og:url 加 /zh 前缀 */
function toChinese(html: string): string {
  const root = parse(html, { blockTextElements: { script: true, noscript: false, style: true, pre: true } })

  for (const a of root.querySelectorAll('a[href]')) {
    // 语言切换链接由 injectLang 填充（指向英文根路径），不参与 /zh 前缀改写
    if (a.hasAttribute('data-lang-switch')) continue
    const href = a.getAttribute('href') ?? ''
    const next = rewriteInternalHrefZh(href)
    if (next !== href) a.setAttribute('href', next)
  }
  const canonical = root.querySelector('link[rel="canonical"]')
  if (canonical) canonical.setAttribute('href', rewriteCanonicalZh(canonical.getAttribute('href') ?? ''))
  const ogUrl = root.querySelector('meta[property="og:url"]')
  if (ogUrl) ogUrl.setAttribute('content', rewriteCanonicalZh(ogUrl.getAttribute('content') ?? ''))

  // JSON-LD 内的同域 URL 同步加 /zh 前缀（面包屑等结构化数据）
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.innerHTML ?? ''
    const next = raw.replaceAll(`${ORIGIN}/`, `${ORIGIN}/zh/`)
    if (next !== raw) script.innerHTML = next
  }

  return root.outerHTML
}

/** dev 下按路径实时生成变体：根路径 = 英文主站，/zh/* = 中文变体 */
function devMiddleware(server: ViteDevServer): void {
  server.middlewares.use((req, res, next) => {
    void (async () => {
      const raw = (req.url ?? '').split(/[?#]/)[0]
      const isZh = raw === '/zh' || raw === '/zh/' || raw.startsWith('/zh/')
      let rel: string | null = null
      if (isZh) {
        const p = raw === '/zh' || raw === '/zh/' ? '/index.html' : raw.slice('/zh'.length)
        if (p.endsWith('.html')) rel = p
      } else if (raw === '/' || raw.endsWith('.html')) {
        rel = raw === '/' ? '/index.html' : raw
      }
      if (rel === null) return next()

      const page = rel.replace(/^\//, '').replace(/\.html$/, '') as PageName
      if (!PAGES.includes(page)) return next()

      const fsPath = `${projectRoot()}${rel}`
      let html: string
      try {
        html = readFileSync(fsPath, 'utf8')
      } catch {
        return next()
      }
      const url = isZh ? zhPath(page) : rootPath(page)
      html = await server.transformIndexHtml(url, html)
      html = isZh ? toChinese(injectZh(html, page)) : toEnglish(injectEn(html, page), loadDict(page))
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html)
    })().catch((err) => {
      console.error('[i18n] 变体渲染失败:', err)
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

        const source = String(asset.source)

        // 英文主站：原文件名原路径（根目录）
        asset.source = toEnglish(injectEn(source, page), loadDict(page))

        // 中文变体：/zh/ 子目录
        this.emitFile({
          type: 'asset',
          fileName: zhFileName(page),
          source: toChinese(injectZh(source, page)),
        })
      }
      },
    },
  }
}
