/**
 * LibreSpeed 引擎（社区公共节点版）：
 * - 协议：LibreSpeed（librespeed/speedtest，LGPLv3）标准端点 garbage.php / empty.php
 * - 节点：官方公共列表中实测开启 CORS（Access-Control-Allow-Origin: *）的 Sharktech 节点
 *   （LibreSpeed 跨域测试点依赖节点开 CORS；未开的节点无法在第三方页面调用，不接入）
 * - 海外节点定位：测"用户 → 国际出口"的真实质量，与国内方向的 CF/NDT 引擎互补
 * - 3 连接并行压测（与官方默认一致），延迟取多次空载往返最小值，抖动为相邻样本平均偏差
 * - 结果仅保存在浏览器本地（onResult 回调 addRecord）
 */

import { t } from '../i18n'
import type { TestRecord } from './history'
import { testState } from './test-state'

interface LsNode {
  name: string
  base: string
}

/** 已验证开 CORS 的公共节点（2026-09 实测；如节点失效会被探测阶段自动跳过） */
const NODES: LsNode[] = [
  { name: 'Amsterdam · Sharktech', base: 'https://amsspeed.sharktech.net/backend' },
  { name: 'Chicago · Sharktech', base: 'https://chispeed.sharktech.net/backend' },
  { name: 'Denver · Sharktech', base: 'https://denspeed.sharktech.net/backend' },
  { name: 'Las Vegas · Sharktech', base: 'https://lasspeed.sharktech.net/backend' },
  { name: 'Los Angeles · Sharktech', base: 'https://laxspeed.sharktech.net/backend' },
]

const PROBE_COUNT = 2 // 选节点时每节点试连次数
const PING_COUNT = 8 // 精测延迟次数
const PROBE_TIMEOUT_MS = 4_000
const DL_DURATION_MS = 10_000
const UL_DURATION_MS = 10_000
const PARALLEL = 3
const UL_CHUNK_BYTES = 4 * 1024 * 1024 // 每连接单次 POST 体量，兼顾粒度与吞吐

/** 手动选择的节点偏好（存节点 base 地址），跨语言/会话保持 */
const NODE_STORAGE_KEY = 'ciallospeed-ls-node'

type Phase = 'idle' | 'running' | 'done'

const fmtMbps = (mbps: number): string =>
  mbps >= 100 ? mbps.toFixed(0) : mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2)

/** 单次 fetch 计时（用于探测/延迟），失败或超时返回 null */
async function timedFetch(url: string): Promise<number | null> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  const start = performance.now()
  try {
    const res = await fetch(`${url}?r=${Math.random()}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    await res.arrayBuffer()
    return performance.now() - start
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** 读取手动节点偏好；节点已下线时清掉并回退自动 */
function loadPreferredNode(nodes: LsNode[]): LsNode | null {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(NODE_STORAGE_KEY)
  } catch {
    /* 隐私模式下忽略 */
  }
  if (!saved) return null
  const found = nodes.find((n) => n.base === saved)
  if (!found) {
    try {
      localStorage.removeItem(NODE_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  return found ?? null
}

export function initLibrespeedEngine(
  section: HTMLElement,
  onResult?: (rec: TestRecord) => void,
): void {
  const valueEl = section.querySelector<HTMLElement>('.ls-value')
  const phaseEl = section.querySelector<HTMLElement>('.ls-phase')
  const barEl = section.querySelector<HTMLElement>('.ls-bar')
  const downEl = section.querySelector<HTMLElement>('.ls-m-down strong')
  const upEl = section.querySelector<HTMLElement>('.ls-m-up strong')
  const pingEl = section.querySelector<HTMLElement>('.ls-m-ping strong')
  const jitterEl = section.querySelector<HTMLElement>('.ls-m-jitter strong')
  const serverEl = section.querySelector<HTMLElement>('.ls-server')
  const nodeTrigger = section.querySelector<HTMLButtonElement>('.ls-node-trigger')
  const nodeTriggerLabel = section.querySelector<HTMLElement>('.ls-node-trigger-label')
  const nodeMenu = section.querySelector<HTMLUListElement>('.ls-node-menu')
  const mainBtn = section.querySelector<HTMLButtonElement>('.ls-main-btn')
  const errEl = section.querySelector<HTMLElement>('.ls-error')
  if (!valueEl || !phaseEl || !mainBtn) return

  let phase: Phase = 'idle'
  let running = false

  /* ---------- 节点选择：自绘下拉（与引擎选择器同风格），手动优先，默认自动 ---------- */

  let preferredNode = nodeMenu ? loadPreferredNode(NODES) : null

  /** 更新触发器文案与选中态 */
  const syncNodeDropdown = () => {
    const active = preferredNode?.base ?? ''
    if (nodeTriggerLabel) nodeTriggerLabel.textContent = preferredNode?.name ?? t('ls.serverAuto')
    for (const li of nodeMenu?.querySelectorAll<HTMLLIElement>('.engine-option') ?? []) {
      const on = li.dataset.value === active
      li.classList.toggle('is-active', on)
      li.setAttribute('aria-selected', String(on))
    }
  }

  /** 应用节点变更：写偏好 + 同步 UI */
  const applyNodeChange = (node: LsNode | null) => {
    preferredNode = node
    try {
      if (node) localStorage.setItem(NODE_STORAGE_KEY, node.base)
      else localStorage.removeItem(NODE_STORAGE_KEY)
    } catch {
      /* 隐私模式下忽略 */
    }
    if (serverEl) {
      serverEl.hidden = !!node
      if (node) serverEl.textContent = node.name
      else serverEl.textContent = t('ls.serverAuto')
    }
    syncNodeDropdown()
  }

  if (nodeMenu && nodeTrigger) {
    // 填充菜单：自动 + 全部节点（带与引擎选择器一致的勾选标记）
    const CHECK_SVG =
      '<svg class="engine-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>'
    const addItem = (value: string, label: string) => {
      const li = document.createElement('li')
      li.className = 'engine-option'
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', 'false')
      li.dataset.value = value
      li.tabIndex = -1
      li.innerHTML = `<span>${label}</span>${CHECK_SVG}`
      nodeMenu.appendChild(li)
    }
    addItem('', t('ls.serverAuto'))
    for (const n of NODES) addItem(n.base, n.name)
    syncNodeDropdown()
    if (serverEl && preferredNode) {
      serverEl.hidden = true
      serverEl.textContent = preferredNode.name
    }

    const isOpen = () => !nodeMenu.hidden
    const openMenu = () => {
      nodeMenu.hidden = false
      nodeTrigger.setAttribute('aria-expanded', 'true')
      nodeMenu.querySelector<HTMLElement>('.engine-option.is-active')?.focus()
    }
    const closeMenu = (focusTrigger = false) => {
      nodeMenu.hidden = true
      nodeTrigger.setAttribute('aria-expanded', 'false')
      if (focusTrigger) nodeTrigger.focus()
    }
    const pick = (li: HTMLElement) => {
      applyNodeChange(NODES.find((n) => n.base === li.dataset.value) ?? null)
      closeMenu(true)
    }

    nodeTrigger.addEventListener('click', () => (isOpen() ? closeMenu() : openMenu()))
    nodeTrigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu()
      }
    })
    for (const li of nodeMenu.querySelectorAll<HTMLElement>('.engine-option')) {
      li.addEventListener('click', () => pick(li))
    }
    nodeMenu.addEventListener('keydown', (e) => {
      const items = [...nodeMenu.querySelectorAll<HTMLElement>('.engine-option')]
      const idx = items.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Escape') {
        closeMenu(true)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        items[(idx + 1 + items.length) % items.length]?.focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        items[(idx - 1 + items.length) % items.length]?.focus()
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (document.activeElement instanceof HTMLElement && items.includes(document.activeElement)) pick(document.activeElement)
      } else if (e.key === 'Tab') {
        closeMenu()
      }
    })
    document.addEventListener('click', (e) => {
      if (isOpen() && e.target instanceof Element && !e.target.closest('.ls-node-select')) closeMenu()
    })
  }

  const setPhase = (text: string) => {
    phaseEl.textContent = text
  }

  const setValue = (v: number) => {
    valueEl.textContent = fmtMbps(v)
  }

  const reset = () => {
    valueEl.textContent = '--'
    if (downEl) downEl.textContent = '--'
    if (upEl) upEl.textContent = '--'
    if (pingEl) pingEl.textContent = '--'
    if (jitterEl) jitterEl.textContent = '--'
    if (barEl) barEl.style.width = '0%'
    errEl?.classList.remove('show')
  }

  const showError = () => {
    if (errEl) errEl.textContent = t('ls.error')
    errEl?.classList.add('show')
    setPhase(t('ls.ready'))
    if (serverEl && !preferredNode) serverEl.textContent = t('ls.serverAuto')
  }

  /** 并行探测全部节点，按延迟升序返回可达节点；全部失败返回空 */
  const pickNodes = async (): Promise<LsNode[]> => {
    const results = await Promise.all(
      NODES.map(async (node) => {
        let best = Infinity
        for (let i = 0; i < PROBE_COUNT; i++) {
          const ms = await timedFetch(`${node.base}/empty.php`)
          if (ms !== null && ms < best) best = ms
        }
        return { node, best }
      }),
    )
    return results
      .filter((r) => isFinite(r.best))
      .sort((a, b) => a.best - b.best)
      .map((r) => r.node)
  }

  /** 精测延迟：取最小值为延迟，相邻样本平均偏差为抖动 */
  const measureLatency = async (node: LsNode): Promise<{ ping: number; jitter: number }> => {
    const samples: number[] = []
    for (let i = 0; i < PING_COUNT; i++) {
      const ms = await timedFetch(`${node.base}/empty.php`)
      if (ms !== null) samples.push(ms)
    }
    if (samples.length < 3) throw new Error('latency samples insufficient')
    const min = Math.min(...samples)
    let jitterSum = 0
    for (let i = 1; i < samples.length; i++) {
      jitterSum += Math.abs(samples[i] - samples[i - 1])
    }
    return { ping: min, jitter: jitterSum / (samples.length - 1) }
  }

  /** 下载：PARALLEL 路并行读流，时间盒内累计字节；单流提前结束则续发新请求 */
  const measureDownload = async (node: LsNode): Promise<number> => {
    const deadline = performance.now() + DL_DURATION_MS
    let totalBytes = 0
    const startOne = async (): Promise<void> => {
      while (performance.now() < deadline) {
        const ctrl = new AbortController()
        const remain = deadline - performance.now()
        const timer = window.setTimeout(() => ctrl.abort(), Math.max(remain, 1))
      try {
        const res = await fetch(`${node.base}/garbage.php?ckSize=100&r=${Math.random()}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        })
        const reader = res.body?.getReader()
        if (!reader) return
        for (;;) {
          if (performance.now() >= deadline) {
            ctrl.abort()
            return
          }
          const { done, value } = await reader.read()
          if (done) break
          totalBytes += value.byteLength
          const elapsed = (performance.now() + 1 - (deadline - DL_DURATION_MS)) / 1000
          setValue((totalBytes * 8) / elapsed / 1e6)
        }
      } catch {
        return
      } finally {
        window.clearTimeout(timer)
      }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, () => startOne()))
    const elapsed = (performance.now() - (deadline - DL_DURATION_MS)) / 1000
    return (totalBytes * 8) / elapsed / 1e6
  }

  /** 上传：PARALLEL 路并行 POST，按已完成请求的字节计吞吐 */
  const measureUpload = async (node: LsNode): Promise<number> => {
    // getRandomValues 单次上限 64KB，分块填充（body 经 TLS 加密，无需真随机防压缩）
    const chunk = new Uint8Array(UL_CHUNK_BYTES)
    for (let off = 0; off < chunk.length; off += 65536) {
      crypto.getRandomValues(chunk.subarray(off, Math.min(off + 65536, chunk.length)))
    }
    const deadline = performance.now() + UL_DURATION_MS
    let totalBytes = 0
    const startOne = async (): Promise<void> => {
      while (performance.now() < deadline) {
        const ctrl = new AbortController()
        const remain = deadline - performance.now()
        const timer = window.setTimeout(() => ctrl.abort(), Math.max(remain, 1))
        try {
          await fetch(`${node.base}/empty.php?r=${Math.random()}`, {
            method: 'POST',
            body: chunk,
            signal: ctrl.signal,
            cache: 'no-store',
          })
          totalBytes += UL_CHUNK_BYTES
          const elapsed = (performance.now() + 1 - (deadline - UL_DURATION_MS)) / 1000
          setValue((totalBytes * 8) / elapsed / 1e6)
        } catch {
          return
        } finally {
          window.clearTimeout(timer)
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, () => startOne()))
    const elapsed = (performance.now() - (deadline - UL_DURATION_MS)) / 1000
    return (totalBytes * 8) / elapsed / 1e6
  }

  const runTest = async () => {
    if (running) return
    running = true
    phase = 'running'
    testState.running = true
    mainBtn.disabled = true
    reset()

    try {
      // 1. 选节点：手动指定则直接用；否则并行探测取延迟最低者
      let node: LsNode
      let candidates: LsNode[]
      if (preferredNode) {
        node = preferredNode
        candidates = [node]
      } else {
        setPhase(t('ls.selecting'))
        candidates = await pickNodes()
        if (candidates.length === 0) throw new Error('no reachable node')
        node = candidates[0]
        if (serverEl) serverEl.textContent = node.name
      }

      // 2. 空载延迟
      setPhase(t('phase.latency'))
      const { ping, jitter } = await measureLatency(node)
      if (pingEl) pingEl.textContent = Math.round(ping).toString()
      if (jitterEl) jitterEl.textContent = jitter.toFixed(1)

      // 3. 下载（仅自动模式：主节点 0 字节时换次优节点重试一次，防节点瞬时抖动）
      setPhase(t('phase.download'))
      let down = await measureDownload(node)
      if (down <= 0 && !preferredNode && candidates.length > 1) {
        const fallback = candidates[1]
        if (serverEl) serverEl.textContent = `${fallback.name} (${t('ls.retry')})`
        down = await measureDownload(fallback)
        if (serverEl) serverEl.textContent = fallback.name
      }
      if (downEl) downEl.textContent = fmtMbps(down)

      // 4. 上传
      setPhase(t('phase.upload'))
      const up = await measureUpload(node)
      if (upEl) upEl.textContent = fmtMbps(up)

      if (barEl) barEl.style.width = '100%'
      if (down > 0) {
        setValue(down)
        setPhase(t('ls.done'))
        phase = 'done'
        onResult?.({ down, up, ping: Math.round(ping), ts: Date.now(), engine: 'ls' })
      } else {
        showError()
      }
    } catch (err) {
      console.error('[librespeed]', err)
      showError()
    } finally {
      running = false
      phase = phase === 'running' ? 'idle' : phase
      testState.running = false
      mainBtn.disabled = false
    }
  }

  mainBtn.addEventListener('click', runTest)
}
