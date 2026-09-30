/**
 * 测速组件（OpenSpeedTest Widget）加载管理：
 * - iframe loading="lazy" 原生懒加载（无 JS 时也可用）
 * - 骨架屏在 iframe load 后移除
 * - 加载超时展示兜底提示（外链域名无法控制，需给用户出路）
 * - 监听 widget postMessage，若官方组件回传结果则自动记录（尽力而为）
 */

import type { TestRecord } from './history'

const WIDGET_SRC = 'https://openspeedtest.com/speedtest'
const LOAD_TIMEOUT_MS = 20_000

export interface SpeedtestHandle {
  /** 首次切换到 OpenSpeedTest Tab 时才真正加载 iframe（懒加载） */
  ensureLoaded: () => void
}

export function initSpeedtest(
  section: HTMLElement,
  onResult?: (rec: TestRecord) => void,
): SpeedtestHandle | null {
  const frame = section.querySelector<HTMLIFrameElement>('#speedtest-frame')
  const skeleton = section.querySelector<HTMLElement>('.speedtest-skeleton')
  const fallback = section.querySelector<HTMLElement>('.speedtest-fallback')
  const retestBtn = section.querySelector<HTMLButtonElement>('.speedtest-retest')
  if (!frame) return null

  let loaded = false
  let requested = false

  const showSkeleton = () => {
    loaded = false
    skeleton?.classList.remove('hidden')
    fallback?.classList.remove('show')
  }

  frame.addEventListener('load', () => {
    loaded = true
    skeleton?.classList.add('hidden')
    fallback?.classList.remove('show')
  })

  // 加载超时兜底：跨域 iframe 无法探测内部错误，只能以超时判断
  let timeoutId = 0
  const armTimeout = () => {
    window.clearTimeout(timeoutId)
    timeoutId = window.setTimeout(() => {
      if (!loaded) {
        skeleton?.classList.add('hidden')
        fallback?.classList.add('show')
      }
    }, LOAD_TIMEOUT_MS)
  }

  /** 双 Tab 懒加载：用户首次切到 OpenSpeedTest 引擎时才发起 iframe 加载 */
  const ensureLoaded = () => {
    if (requested) return
    requested = true
    if (!frame.getAttribute('src')) frame.src = WIDGET_SRC
    armTimeout()
  }

  // HTML 中预置了 src 时直接进入加载流程（兼容无 JS 场景）
  if (frame.getAttribute('src')) {
    requested = true
    armTimeout()
  }

  // 重新测速：重载 widget（带时间戳防缓存），回到初始 Start 状态
  retestBtn?.addEventListener('click', () => {
    showSkeleton()
    armTimeout()
    frame.src = `${WIDGET_SRC}?r=${Date.now()}`
    frame.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })

  // 尽力而为的结果回传：官方 widget 若通过 postMessage 上报则自动记录
  if (onResult) {
    window.addEventListener('message', (ev) => {
      if (!ev.origin.includes('openspeedtest')) return
      const data: unknown = ev.data
      if (typeof data !== 'object' || data === null) return

      const d = data as Record<string, unknown>
      const down = pickNumber(d, ['download', 'down', 'Download', 'Down'])
      const up = pickNumber(d, ['upload', 'up', 'Upload', 'Up'])
      const ping = pickNumber(d, ['ping', 'Ping', 'latency', 'Latency'])

      if (down !== undefined && up !== undefined) {
        onResult({ down, up, ping: ping ?? 0, ts: Date.now(), engine: 'ost' })
      }
    })
  }

  return { ensureLoaded }
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'number' && isFinite(v) && v >= 0 && v < 1_000_000) {
      return v
    }
  }
  return undefined
}
