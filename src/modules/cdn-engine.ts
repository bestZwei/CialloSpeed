/**
 * CDN 直链下载测速引擎：
 * - 目标：大厂 CDN 固定大文件（阿里 npmmirror / 腾讯云 npm 镜像 / Vultr 多地域），
 *   测「用户网络 → 该 CDN」的下载速度；与其他引擎（裸带宽口径）互补，用于对比各 CDN 到本机质量
 * - 只收录「精确计量」的源：全部实测开放 CORS（返回 ACAO），可流式读取 + 时间盒截断，
 *   速度 = 跳过前 1.5s 的 TCP 慢启动窗口后的字节增量 ÷ 对应时长，字节与耗时都精确。
 *   不开 CORS 的源（腾讯软件下载站 / 学习强国 / Apple / 各镜像站的 ISO）在 Web 里只能整包
 *   下载、且读不到状态码，属参考值，已全部剔除 —— 宁缺毋滥。
 * - 时间盒内「连续下载」：一个读完立刻接下一个（同一个 URL 就重复请求），把 10s 喂满。
 *   于是不再依赖单个大文件 —— 几 MB~几十 MB 的源也能量出稳态速率，否则高速线路上
 *   几秒就下完，只能退化成整包平均速度、丢掉「跳过慢启动取稳态」的意义。
 *   代价：流量 = 时间盒 × 线路速度；且单次传输时间需明显大于 RTT，否则请求间隙
 *   （同域复用连接约 1 个 RTT）会显著拉低读数 —— 故单文件仍不宜小于 1MB 量级。
 * - 目标可由用户勾选（状态存 localStorage），测速期间可随时「停止」（结果作废，不记历史）
 * - 第三方直链会随版本更迭失效（npmmirror / npm 版本号固定不变），单项失败自动跳过
 * - 仅测下载（up/ping 记 0，历史展示为「—」且不参与质量评级）；
 *   支持粘贴任意 https 直链自定义测速（仅限带跨域头的源）；结果仅保存浏览器本地（onResult 回调 addRecord）
 */

import { t, type StringKey } from '../i18n'
import type { TestRecord } from './history'
import { renderSceneVerdicts } from './quality'
import { testState } from './test-state'

interface CdnTarget {
  name: StringKey
  url: string
}

const DL_DURATION_S = 10 // 单目标时间盒时长：期间持续下载（一个文件读完立刻接下一个）
const RAMP_S = 1.5 // 速度计算跳过的 TCP 慢启动窗口（秒）

/** 勾选状态存储键（存选中目标的 URL 数组，跨语言/会话保持） */
const PICKED_STORAGE_KEY = 'ciallospeed-cdn-targets'

/**
 * 预设测速目标（2026-10 实测，均返回 ACAO 且支持流式读取）。
 * 顺序即测速顺序；前两个为国内方向，后三个为国际出口方向的同一厂商多地域对比。
 */
const TARGETS: CdnTarget[] = [
  {
    name: 'cdn.aliElectron',
    url: 'https://cdn.npmmirror.com/binaries/electron/33.0.0/electron-v33.0.0-win32-x64.zip',
  },
  {
    name: 'cdn.tencentNpm',
    url: 'https://mirrors.cloud.tencent.com/npm/onnxruntime-node/-/onnxruntime-node-1.18.0.tgz',
  },
  { name: 'cdn.vultrSg', url: 'https://sgp-ping.vultr.com/vultr.com.1000MB.bin' },
  { name: 'cdn.vultrTyo', url: 'https://hnd-jp-ping.vultr.com/vultr.com.1000MB.bin' },
  { name: 'cdn.vultrLax', url: 'https://lax-ca-us-ping.vultr.com/vultr.com.1000MB.bin' },
]

const fmtMbps = (mbps: number): string =>
  mbps >= 100 ? mbps.toFixed(0) : mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2)

/** 读取勾选的目标；未设置过、或保存项已全部失效时回落为全选 */
function loadPicked(): Set<string> {
  const all = TARGETS.map((tg) => tg.url)
  try {
    const raw = localStorage.getItem(PICKED_STORAGE_KEY)
    if (!raw) return new Set(all)
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(all)
    const valid = new Set(all)
    const kept = parsed.filter((u): u is string => typeof u === 'string' && valid.has(u))
    return kept.length > 0 ? new Set(kept) : new Set(all)
  } catch {
    return new Set(all)
  }
}

function savePicked(picked: Set<string>): void {
  try {
    localStorage.setItem(PICKED_STORAGE_KEY, JSON.stringify([...picked]))
  } catch {
    /* 隐私模式下忽略 */
  }
}

/**
 * 时间盒内连续下载：一个文件读完立刻接下一个（同一个 URL 就重复请求），把时间盒喂满。
 * 速度 = 跳过慢启动窗口（RAMP_S）之后的字节增量 ÷ 对应时长，避免峰值被爬坡期拉低。
 * external 用于外部「停止」：一旦 abort，立即中断当前请求并结束。
 */
async function measureTimebox(
  url: string,
  onTick?: (mbps: number, frac: number) => void,
  external?: AbortSignal,
): Promise<number | null> {
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  external?.addEventListener('abort', onExternalAbort, { once: true })
  const hardTimer = window.setTimeout(() => controller.abort(), DL_DURATION_S * 1000 + 3000)
  const start = performance.now()
  const deadline = start + DL_DURATION_S * 1000
  let got = 0
  let rampGot = -1 // 越过慢启动窗口时的累计字节
  let finished = false
  try {
    while (performance.now() < deadline) {
      let res: Response
      try {
        res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      } catch {
        break // 网络错误，或被 abort
      }
      if (!res.ok) break
      const reader = res.body?.getReader()
      if (!reader) break

      let timedOut = false
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break // 本文件下完：回到外层，立刻接下一个
          got += value.byteLength
          const elapsed = (performance.now() - start) / 1000
          if (rampGot < 0 && elapsed >= RAMP_S) rampGot = got
          if (rampGot >= 0) {
            const eff = elapsed - RAMP_S
            if (eff > 0.2) onTick?.(((got - rampGot) * 8) / eff / 1e6, elapsed / DL_DURATION_S)
          }
          if (performance.now() >= deadline) {
            timedOut = true
            break
          }
        }
      } catch {
        timedOut = true // abort 或读取中断
      }
      if (timedOut) {
        try {
          await reader.cancel()
        } catch {
          /* 已中断，忽略 */
        }
        break
      }
    }
    finished = true
  } finally {
    window.clearTimeout(hardTimer)
    external?.removeEventListener('abort', onExternalAbort)
    controller.abort()
  }

  const elapsed = (performance.now() - start) / 1000
  if (!finished || got === 0) return null
  // 线路极快时可能在慢启动窗口内就跑满时间盒：回退为全窗口计量（有轻微爬坡偏差，好于失败）
  const effStart = rampGot >= 0 ? RAMP_S : 0
  const effBytes = rampGot >= 0 ? got - rampGot : got
  if (elapsed - effStart < 0.2) return null
  if (rampGot < 0 && got < 8 * 1024 * 1024) return null // 总量太小，不足计时
  return (effBytes * 8) / (elapsed - effStart) / 1e6
}

export function initCdnEngine(
  section: HTMLElement,
  onResult?: (rec: TestRecord) => void,
): void {
  const valueEl = section.querySelector<HTMLElement>('.ls-value')
  const phaseEl = section.querySelector<HTMLElement>('.ls-phase')
  const barEl = section.querySelector<HTMLElement>('.ls-bar')
  const listEl = section.querySelector<HTMLElement>('.cdn-results')
  const mainBtn = section.querySelector<HTMLButtonElement>('.cdn-main-btn')
  const customBtn = section.querySelector<HTMLButtonElement>('.cdn-custom-btn')
  const urlInput = section.querySelector<HTMLInputElement>('.cdn-url-input')
  const aimEl = section.querySelector<HTMLElement>('.scene-aim')
  const errEl = section.querySelector<HTMLElement>('.cf-error')
  if (!valueEl || !phaseEl || !mainBtn) return

  let running = false
  let batchAbort: AbortController | null = null
  const picked = loadPicked() // 用户勾选的测速目标（URL 集合）

  const setValue = (v: number) => {
    valueEl.textContent = fmtMbps(v)
  }

  const setBar = (frac: number) => {
    if (barEl) barEl.style.width = `${Math.round(Math.min(Math.max(frac, 0), 1) * 100)}%`
  }

  interface Row {
    li: HTMLElement
    speedEl: HTMLElement
    box: HTMLInputElement | null
  }

  /**
   * 渲染目标行（速度重置为 --）。
   * withCheck 控制是否带勾选框（预设清单带、自定义单行不带）；
   * enabled 控制勾选框是否可用（测速期间禁用，避免中途改动）。
   */
  const renderRows = (targets: CdnTarget[], withCheck: boolean, enabled: boolean): Row[] => {
    if (!listEl) return []
    listEl.textContent = ''
    return targets.map((tg) => {
      const li = document.createElement('li')
      li.className = 'cdn-row'

      const wrap = document.createElement('label')
      wrap.className = 'cdn-row-pick'
      let box: HTMLInputElement | null = null
      if (withCheck) {
        box = document.createElement('input')
        box.type = 'checkbox'
        box.className = 'cdn-row-check'
        box.checked = picked.has(tg.url)
        box.disabled = !enabled
        box.addEventListener('change', () => {
          if (box?.checked) picked.add(tg.url)
          else picked.delete(tg.url)
          savePicked(picked)
        })
        wrap.appendChild(box)
      }
      const nameEl = document.createElement('span')
      nameEl.className = 'cdn-row-name'
      nameEl.textContent = t(tg.name)
      wrap.appendChild(nameEl)

      const speedEl = document.createElement('span')
      speedEl.className = 'cdn-row-speed'
      speedEl.textContent = '--'
      li.append(wrap, speedEl)
      listEl.appendChild(li)
      return { li, speedEl, box }
    })
  }

  const showError = (msg: string) => {
    if (errEl) errEl.textContent = msg
    errEl?.classList.add('show')
    phaseEl.textContent = t('cdn.ready')
  }

  /**
   * 跑一批目标：list 为要渲染的行（预设=全部目标，自定义=单行），
   * execute 为实际要测的目标（预设=勾选子集，自定义=同一行）。
   * restoreToPreset 为真时，结束后把列表恢复成预设清单（自定义测速用）。
   */
  const runBatch = async (list: CdnTarget[], execute: CdnTarget[], restoreToPreset: boolean) => {
    running = true
    testState.running = true
    mainBtn.disabled = false
    mainBtn.textContent = t('btn.stop') // 测速中可随时停止
    if (customBtn) customBtn.disabled = true
    if (urlInput) urlInput.disabled = true
    valueEl.textContent = '--'
    setBar(0)
    if (aimEl) {
      aimEl.innerHTML = ''
      aimEl.hidden = true
    }
    errEl?.classList.remove('show')

    const rows = renderRows(list, list === TARGETS, false)
    const rowOf = new Map<CdnTarget, Row>()
    list.forEach((tg, i) => {
      const r = rows[i]
      if (r) rowOf.set(tg, r)
    })

    const ctrl = new AbortController()
    batchAbort = ctrl

    let best = 0 // 已测得的最高速度（最终展示/记录值）
    let bestRow: Row | undefined
    let okCount = 0
    let done = 0
    let stopped = false
    try {
      for (const target of execute) {
        if (ctrl.signal.aborted) {
          stopped = true
          break
        }
        const row = rowOf.get(target)
        if (!row) continue

        phaseEl.textContent = t('cdn.testing', { name: t(target.name), i: done + 1, n: execute.length })
        row.li.classList.add('is-active')
        const mbps = await measureTimebox(
          target.url,
          (v, frac) => {
            setValue(v)
            row.speedEl.textContent = fmtMbps(v)
            setBar((done + frac) / execute.length)
          },
          ctrl.signal,
        )
        row.li.classList.remove('is-active')

        if (ctrl.signal.aborted) {
          stopped = true
          break
        }

        done += 1
        if (mbps !== null) {
          okCount++
          row.li.classList.add('is-done')
          if (mbps > best) {
            best = mbps
            bestRow = row
          }
        } else {
          row.speedEl.textContent = t('cdn.failed')
          row.li.classList.add('is-fail')
        }
        setBar(done / execute.length)
      }

      if (stopped) {
        // 用户主动停止：本轮结果作废，不写入历史
        valueEl.textContent = '--'
        setBar(0)
        phaseEl.textContent = t('state.stopped')
        return
      }

      if (okCount > 0 && best > 0) {
        bestRow?.li.classList.add('is-best')
        setValue(best)
        phaseEl.textContent = t('cdn.doneBest', { v: fmtMbps(best) })
        // CDN 直链只有下载指标：仅给出「视频流媒体」一个场景评价
        renderSceneVerdicts(aimEl, { down: best })
        onResult?.({ down: best, up: 0, ping: 0, ts: Date.now(), engine: 'cdn' })
      } else {
        showError(t('cdn.failedAll'))
      }
    } catch (err) {
      console.error('[cdn-engine]', err)
      showError(t('cdn.failedAll'))
    } finally {
      running = false
      testState.running = false
      batchAbort = null
      mainBtn.disabled = false
      mainBtn.textContent = t('btn.start')
      if (customBtn) customBtn.disabled = false
      if (urlInput) urlInput.disabled = false
      if (restoreToPreset) {
        renderRows(TARGETS, true, true)
      } else {
        for (const r of rows) if (r.box) r.box.disabled = false
      }
    }
  }

  mainBtn.addEventListener('click', () => {
    if (running) {
      batchAbort?.abort() // 停止当前测速
      return
    }
    const selected = TARGETS.filter((tg) => picked.has(tg.url))
    if (selected.length === 0) {
      showError(t('cdn.selectAtLeastOne'))
      return
    }
    void runBatch(TARGETS, selected, false)
  })

  customBtn?.addEventListener('click', () => {
    if (running || !urlInput) return
    const raw = urlInput.value.trim()
    if (!/^https:\/\/\S+$/.test(raw)) {
      showError(t('cdn.invalidUrl'))
      return
    }
    const target: CdnTarget = { name: 'cdn.customName', url: raw }
    void runBatch([target], [target], true)
  })

  // 初始即展示预设目标清单（可勾选），让用户在开始前决定要测哪些源
  renderRows(TARGETS, true, true)
}
