import { describe, expect, it } from 'vitest'

import { rewriteCanonicalZh, rewriteInternalHrefZh } from '../build/i18n-plugin'

const ORIGIN = 'https://speed.ciallo.de'

describe('rewriteInternalHrefZh：中文变体的内链前缀', () => {
  it('站内页面路径加 /zh', () => {
    expect(rewriteInternalHrefZh('/')).toBe('/zh/')
    expect(rewriteInternalHrefZh('/guide.html')).toBe('/zh/guide.html')
    expect(rewriteInternalHrefZh('/faq.html#q1')).toBe('/zh/faq.html#q1')
    expect(rewriteInternalHrefZh('/index.html?x=1')).toBe('/zh/index.html?x=1')
  })

  it('同域绝对地址同样加 /zh', () => {
    expect(rewriteInternalHrefZh(`${ORIGIN}/`)).toBe(`${ORIGIN}/zh/`)
    expect(rewriteInternalHrefZh(`${ORIGIN}/why-different.html`)).toBe(`${ORIGIN}/zh/why-different.html`)
  })

  it('裸域名没有路径，不参与改写', () => {
    expect(rewriteInternalHrefZh(ORIGIN)).toBe(ORIGIN)
  })

  it('静态资源、锚点与外链保持不变', () => {
    for (const href of [
      '/assets/index-abc123.js',
      '/favicon.ico',
      '/theme-init.js',
      '#speedtest',
      'https://speed.cloudflare.com/__down?bytes=10',
      'mailto:hi@example.com',
    ]) {
      expect(rewriteInternalHrefZh(href)).toBe(href)
    }
  })
})

describe('rewriteCanonicalZh：canonical 与 og:url', () => {
  it('首页落到 /zh/，子页插入 /zh 段', () => {
    expect(rewriteCanonicalZh(ORIGIN)).toBe(`${ORIGIN}/zh/`)
    expect(rewriteCanonicalZh(`${ORIGIN}/`)).toBe(`${ORIGIN}/zh/`)
    expect(rewriteCanonicalZh(`${ORIGIN}/wifi-tips.html`)).toBe(`${ORIGIN}/zh/wifi-tips.html`)
  })

  it('非同域地址原样返回', () => {
    expect(rewriteCanonicalZh('https://example.com/')).toBe('https://example.com/')
  })
})
