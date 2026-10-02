import { vi } from 'vitest'

/**
 * 被测模块在 import 期就会读 document（src/i18n 按 <html lang> 判定当前语言），
 * node 环境下补一个最小桩即可，不必为几个纯函数引入 jsdom。
 */
vi.stubGlobal('document', {
  documentElement: { lang: 'zh-CN', dataset: {} },
})

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
})
