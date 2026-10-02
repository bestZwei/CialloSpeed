#!/usr/bin/env node
/**
 * i18n 覆盖率校验：把「英文页面漏翻」从人工检查变成构建期硬失败。
 *
 * 两套词典各有职责，都可能悄悄漏键：
 * 1. locales/en/*.json —— 构建期由 build/i18n-plugin.ts 套用。插件对缺失的键是静默跳过
 *    （`typeof dict[key] === 'string'` 才替换），所以英文页面会原样留下中文源文案，不报错。
 * 2. src/i18n/strings/{zh-CN,en}.ts —— 运行时文案。en.ts 由 TS 的 Record<StringKey, string>
 *    约束键集，但 config/speed-targets.json 里的目标名走的是 `t(name as StringKey)`，
 *    字符串来自 JSON，TS 查不出来。
 *
 *   node scripts/check-i18n.mjs
 *
 * 有问题以退出码 1 结束（已接入 npm run build）。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PAGES = ['index', 'guide', 'wifi-tips', 'how-it-works', 'why-different', 'faq', '404']

const errors = []
const warnings = []

const read = (rel) => readFileSync(`${ROOT}${rel}`, 'utf8')

/** 收集一个 HTML 里所有 data-i18n* 标注引用到的键；jsonld 键的值是对象，需单独校验 */
function htmlKeys(html) {
  const text = new Set()
  const jsonld = new Set()
  for (const m of html.matchAll(/\bdata-i18n-html="([^"]+)"/g)) text.add(m[1])
  for (const m of html.matchAll(/\bdata-i18n-jsonld="([^"]+)"/g)) jsonld.add(m[1])
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) text.add(m[1])
  for (const m of html.matchAll(/\bdata-i18n-attrs="([^"]+)"/g)) {
    for (const pair of m[1].split(';')) {
      const idx = pair.indexOf(':')
      if (idx >= 0) {
        const key = pair.slice(idx + 1).trim()
        if (key) text.add(key)
      }
    }
  }
  return { text, jsonld, all: new Set([...text, ...jsonld]) }
}

/** 从 TS 字典源码里抠出键名（形如 `'some.key': '…'`） */
function tsKeys(rel) {
  const keys = new Set()
  for (const m of read(rel).matchAll(/^\s*'([^']+)'\s*:/gm)) keys.add(m[1])
  return keys
}

function checkBuildTimeDicts() {
  const sharedPath = 'locales/en/shared.json'
  if (!existsSync(`${ROOT}${sharedPath}`)) {
    errors.push(`缺少公共词典 ${sharedPath}`)
    return
  }
  const shared = JSON.parse(read(sharedPath))

  for (const page of PAGES) {
    const htmlFile = `${page}.html`
    if (!existsSync(`${ROOT}${htmlFile}`)) {
      errors.push(`缺少页面 ${htmlFile}`)
      continue
    }
    const { text, jsonld, all } = htmlKeys(read(htmlFile))

    const dictFile = `locales/en/${page}.json`
    const dict = existsSync(`${ROOT}${dictFile}`) ? JSON.parse(read(dictFile)) : {}
    if (!existsSync(`${ROOT}${dictFile}`)) warnings.push(`${dictFile} 不存在，该页仅依赖 shared.json`)

    const merged = { ...shared, ...dict }
    for (const key of text) {
      if (typeof merged[key] !== 'string') {
        errors.push(`${htmlFile}: 键 "${key}" 在 ${dictFile} / shared.json 中都没有英文译文（英文页面会残留中文）`)
      }
    }
    for (const key of jsonld) {
      const value = merged[key]
      if (value === undefined || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${htmlFile}: JSON-LD 键 "${key}" 在 ${dictFile} 中不是对象，英文页结构化数据不会被替换`)
      }
    }

    const allDictKeys = new Set([...Object.keys(shared), ...Object.keys(dict)])
    const usedElsewhere = pageKeysUsedElsewhere(page)
    for (const key of allDictKeys) {
      if (!all.has(key) && !usedElsewhere.has(key)) {
        warnings.push(`${dictFile}: 键 "${key}" 无人引用`)
      }
    }
  }
}

/** 某页词典键是否被该页之外的地方引用（避免把公共键误报为死键） */
function pageKeysUsedElsewhere(page) {
  const union = new Set()
  for (const other of PAGES) {
    if (other === page || !existsSync(`${ROOT}${other}.html`)) continue
    for (const key of htmlKeys(read(`${other}.html`)).all) union.add(key)
  }
  return union
}

function checkRuntimeStrings() {
  const zh = tsKeys('src/i18n/strings/zh-CN.ts')
  const en = tsKeys('src/i18n/strings/en.ts')

  for (const key of zh) if (!en.has(key)) errors.push(`en.ts 缺少运行时键 "${key}"`)
  for (const key of en) if (!zh.has(key)) errors.push(`en.ts 多出中文侧没有的键 "${key}"`)

  const used = new Set()
  const srcFiles = readdirSync(`${ROOT}src`, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts'))
  for (const f of srcFiles) {
    for (const m of read(`src/${f}`).matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1])
  }
  for (const key of used) {
    if (!zh.has(key)) errors.push(`src 里引用了不存在的运行时键 t('${key}')`)
  }

  const config = JSON.parse(read('config/speed-targets.json'))
  for (const target of config.cdnTargets) {
    if (!zh.has(target.name)) {
      errors.push(`config/speed-targets.json 的 CDN 目标名 "${target.name}" 不是有效的运行时键`)
    }
  }
}

checkBuildTimeDicts()
checkRuntimeStrings()

if (warnings.length) {
  console.log('提醒（不阻塞构建）：')
  for (const w of warnings) console.log(`  · ${w}`)
}
if (errors.length) {
  console.error(`i18n 校验失败，共 ${errors.length} 处：`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`i18n 校验通过：${PAGES.length} 个页面 + 运行时字典 + 目标清单键均已覆盖`)
