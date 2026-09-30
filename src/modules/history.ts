/**
 * 测速历史记录：localStorage 本地存储（不上传任何服务器）
 * 支持手动录入 + 测速组件自动回传两种来源。
 */

/** 测速引擎来源：cf = Cloudflare 边缘引擎；ost = OpenSpeedTest；manual = 手动录入（旧记录缺省视为 manual） */
export type EngineId = 'cf' | 'ost' | 'manual'

export const ENGINE_LABEL: Record<EngineId, string> = {
  cf: 'Cloudflare 引擎',
  ost: 'OpenSpeedTest',
  manual: '手动录入',
}

export interface TestRecord {
  /** 下载速度 Mbps */
  down: number
  /** 上传速度 Mbps */
  up: number
  /** 延迟 ms */
  ping: number
  /** 时间戳 */
  ts: number
  /** 测速引擎来源（旧记录可能缺失） */
  engine?: EngineId
}

const HISTORY_KEY = 'ciallospeed-history'
const MAX_RECORDS = 20

export function loadHistory(): TestRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecord)
  } catch {
    return []
  }
}

function isRecord(v: unknown): v is TestRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (
    typeof r.down !== 'number' || !isFinite(r.down) || r.down < 0 ||
    typeof r.up !== 'number' || !isFinite(r.up) || r.up < 0 ||
    typeof r.ping !== 'number' || !isFinite(r.ping) || r.ping < 0 ||
    typeof r.ts !== 'number' || r.ts <= 0
  ) return false
  // engine 为可选字段：缺失（旧记录）按 manual 处理，非法值一律丢弃
  const eng: unknown = r.engine
  if (eng !== undefined && (typeof eng !== 'string' || !(eng in ENGINE_LABEL))) return false
  return true
}

/** 保存一条记录并刷新 UI（若已初始化） */
export function addRecord(rec: TestRecord): TestRecord[] {
  const list = [rec, ...loadHistory()].slice(0, MAX_RECORDS)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {
    /* 存储不可用时静默降级 */
  }
  refresh?.(list)
  return list
}

export function clearAllRecords(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    /* ignore */
  }
  refresh?.([])
}

/* ---------- UI 渲染 ---------- */

let refresh: ((list: TestRecord[]) => void) | null = null

interface Quality {
  tone: 'ok' | 'warn' | 'bad'
  label: string
}

function downQuality(v: number): Quality {
  if (v >= 100) return { tone: 'ok', label: '极佳' }
  if (v >= 25) return { tone: 'ok', label: '良好' }
  if (v >= 10) return { tone: 'warn', label: '一般' }
  return { tone: 'bad', label: '偏慢' }
}

function pingQuality(v: number): Quality {
  if (v <= 20) return { tone: 'ok', label: '电竞级' }
  if (v <= 50) return { tone: 'ok', label: '优秀' }
  if (v <= 100) return { tone: 'warn', label: '良好' }
  return { tone: 'bad', label: '偏高' }
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function initHistory(root: HTMLElement): void {
  if (!root) return

  const listEl = root.querySelector<HTMLUListElement>('.history-list')
  const emptyEl = root.querySelector<HTMLElement>('.history-empty')
  const clearBtn = root.querySelector<HTMLButtonElement>('.history-clear')
  const form = root.querySelector<HTMLFormElement>('.history-form')

  const render = (list: TestRecord[]) => {
    if (!listEl || !emptyEl) return

    emptyEl.hidden = list.length > 0
    if (clearBtn) clearBtn.hidden = list.length === 0
    listEl.innerHTML = ''

    for (const rec of list) {
      const li = document.createElement('li')
      li.className = 'history-item'

      const time = document.createElement('span')
      time.className = 'time'
      time.textContent = fmtTime(rec.ts)

      const metrics = document.createElement('div')
      metrics.className = 'metrics'

      const dq = downQuality(rec.down)
      const pq = pingQuality(rec.ping)
      const engine: EngineId = rec.engine ?? 'manual'

      metrics.innerHTML =
        `<span class="metric-chip engine-chip">${ENGINE_LABEL[engine]}</span>` +
        `<span class="metric-chip"><span class="dot dot-${dq.tone}"></span>↓ ${fmtNum(rec.down)} <small>Mbps · ${dq.label}</small></span>` +
        `<span class="metric-chip">↑ ${fmtNum(rec.up)} <small>Mbps</small></span>` +
        `<span class="metric-chip"><span class="dot dot-${pq.tone}"></span>${fmtNum(rec.ping)} <small>ms · ${pq.label}</small></span>`

      li.append(time, metrics)
      listEl.appendChild(li)
    }
  }

  refresh = render
  render(loadHistory())

  clearBtn?.addEventListener('click', () => {
    if (confirm('确定清空所有本地测速记录吗？')) clearAllRecords()
  })

  // 手动录入
  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    const inputs = form.querySelectorAll<HTMLInputElement>('input[type="number"]')
    const down = Number(inputs[0]?.value)
    const up = Number(inputs[1]?.value)
    const ping = Number(inputs[2]?.value)

    if (![down, up, ping].every((n) => isFinite(n) && n >= 0)) return

    addRecord({ down, up, ping, ts: Date.now() })
    form.reset()
    inputs[0]?.focus()
  })
}

function fmtNum(n: number): string {
  return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)
}
