/**
 * 运行时 i18n：TS 模块中的动态文案字典。
 * 当前语言由构建期写入的 <html lang> 决定（en 变体由 build/i18n-plugin.ts 生成），
 * 两种语言都打进 bundle，仅几 KB。
 */

export type Locale = 'zh-CN' | 'en'

export const LOCALE_STORAGE_KEY = 'ciallospeed-locale'

export const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'zh-CN'

import { strings as zhCN } from './strings/zh-CN'
import { strings as en } from './strings/en'

const DICTS: Record<Locale, Record<StringKey, string>> = {
  'zh-CN': zhCN,
  en,
}

export type StringKey = keyof typeof zhCN

/** 取文案并做 {param} 插值；en 缺键时回落中文 */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  let s: string = DICTS[locale][key] ?? zhCN[key]
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v))
    }
  }
  return s
}
