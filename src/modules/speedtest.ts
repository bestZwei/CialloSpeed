/**
 * 第三方测速挂件（跨域 iframe）加载管理，OST / Meter.net / SpeedMeter.dev 共用：
 * - iframe 地址由 config/speed-targets.json 提供，首次切到对应面板才加载（懒加载）
 * - 骨架屏在 iframe load 后移除
 * - 加载超时展示兜底提示（外链域名无法控制，需给用户出路）
 * - 监听 widget postMessage，若挂件回传结果则自动记录（尽力而为，需配置 messageOrigin）
 */

import type { EngineId, TestRecord } from './history'

const LOAD_TIMEOUT_MS = 20_000

export interface SpeedtestHandle {
  /** 首次切换到对应引擎时才真正加载 iframe（懒加载） */
  ensureLoaded: () => void
}

export interface SpeedtestOptions {
  /** iframe 加载地址 */
  src: string
  /** postMessage 结果回传的来源域名（本身或其子域）；缺省不监听 */
  messageOrigin?: string
  /** 结果写入历史时标注的引擎来源；缺省 ost */
  engineId?: EngineId
}

export function initSpeedtest(
  section: HTMLElement,
  options: SpeedtestOptions,
  onResult?: (rec: TestRecord) => void,
): SpeedtestHandle | null {
  const WIDGET_SRC = options.src
  const frame = section.querySelector<HTMLIFrameElement>('iframe')
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

  // 加载失败兜底里的「刷新页面」：由脚本绑定，HTML 侧不写内联 onclick（会被 CSP 拦掉）
  fallback
    ?.querySelectorAll<HTMLButtonElement>('[data-reload]')
    .forEach((btn) => btn.addEventListener('click', () => location.reload()))

  // 尽力而为的结果回传：widget 若通过 postMessage 上报则自动记录
  // 数值可能在顶层（OST）或 results 子对象（SpeedMeter.dev）里，两处都取
  if (onResult && options.messageOrigin) {
    const origin = options.messageOrigin
    const engineId = options.engineId ?? 'ost'
    window.addEventListener('message', (ev) => {
      if (!isTrustedOrigin(ev.origin, origin)) return
      const data: unknown = ev.data
      if (typeof data !== 'object' || data === null) return

      const d = data as Record<string, unknown>
      const nested =
        typeof d.results === 'object' && d.results !== null
          ? (d.results as Record<string, unknown>)
          : d
      const down = pickNumber(nested, ['download', 'down', 'Download', 'Down'])
      const up = pickNumber(nested, ['upload', 'up', 'Upload', 'Up'])
      const ping = pickNumber(nested, ['ping', 'Ping', 'latency', 'Latency'])

      if (down !== undefined && up !== undefined) {
        onResult({ down, up, ping: ping ?? 0, ts: Date.now(), engine: engineId })
      }
    })
  }

  return { ensureLoaded }
}

/**
 * postMessage 来源校验：只接受 `expect` 本身或其子域。
 * 用 includes/indexOf 会把 `https://evil-speedmeter.dev.attacker.com` 当成合法来源。
 */
function isTrustedOrigin(raw: string, expect: string): boolean {
  let host: string
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    return false
  }
  const want = expect.toLowerCase()
  return host === want || host.endsWith(`.${want}`)
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
