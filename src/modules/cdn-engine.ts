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
 * - 第三方直链会随版本更迭失效（npmmirror / npm 版本号固定不变），单项失败自动跳过
 * - 仅测下载（up/ping 记 0，历史展示为「—」且不参与质量评级）；
 *   支持粘贴任意 https 直链自定义测速（仅限带跨域头的源）；结果仅保存浏览器本地（onResult 回调 addRecord）
 */

import { t, type StringKey } from '../i18n'
import type { TestRecord } from './history'
import { testState } from './test-state'

interface CdnTarget {
  name: StringKey
  url: string
}

const DL_DURATION_S = 10 // 单目标时间盒时长：期间持续下载（一个文件读完立刻接下一个）
const RAMP_S = 1.5 // 速度计算跳过的 TCP 慢启动窗口（秒）

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

/**
 * 时间盒内连续下载：一个文件读完立刻接下一个（同一个 URL 就重复请求），把时间盒喂满。
 * 速度 = 跳过慢启动窗口（RAMP_S）之后的字节增量 ÷ 对应时长，避免峰值被爬坡期拉低。
 * 连续下载的好处：不要求单个文件足够大，几 MB~几十 MB 的源也能测出稳态速率。
 */
async function measureTimebox(
  url: string,
  onTick?: (mbps: number, frac: number) => void,
): Promise<number | null> {
  const controller = new AbortController()
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
  const errEl = section.querySelector<HTMLElement>('.cf-error')
  if (!valueEl || !phaseEl || !mainBtn) return

  let running = false

  const setValue = (v: number) => {
    valueEl.textContent = fmtMbps(v)
  }

  const setBar = (frac: number) => {
    if (barEl) barEl.style.width = `${Math.round(Math.min(Math.max(frac, 0), 1) * 100)}%`
  }

  interface Row {
    li: HTMLElement
    speedEl: HTMLElement
  }

  /** 渲染目标行（初始 -- 待测态）；开始测速与页面加载时各渲染一次 */
  const renderRows = (names: string[]): Row[] => {
    if (!listEl) return []
    listEl.textContent = ''
    return names.map((name) => {
      const li = document.createElement('li')
      li.className = 'cdn-row'
      const nameEl = document.createElement('span')
      nameEl.className = 'cdn-row-name'
      nameEl.textContent = name
      const speedEl = document.createElement('span')
      speedEl.className = 'cdn-row-speed'
      speedEl.textContent = '--'
      li.append(nameEl, speedEl)
      listEl.appendChild(li)
      return { li, speedEl }
    })
  }

  const showError = (msg: string) => {
    if (errEl) errEl.textContent = msg
    errEl?.classList.add('show')
    phaseEl.textContent = t('cdn.ready')
  }

  /** 跑一批目标（预设或单个自定义），取最高值记入历史 */
  const runBatch = async (targets: CdnTarget[]) => {
    running = true
    testState.running = true
    mainBtn.disabled = true
    if (customBtn) customBtn.disabled = true
    if (urlInput) urlInput.disabled = true
    valueEl.textContent = '--'
    setBar(0)
    errEl?.classList.remove('show')
    const rows = renderRows(targets.map((tg) => t(tg.name)))

    let best = 0 // 已测得的最高速度（最终展示/记录值）
    let bestRow: Row | undefined
    let okCount = 0
    try {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]
        const row = rows[i]
        if (!row) continue

        phaseEl.textContent = t('cdn.testing', { name: t(target.name), i: i + 1, n: targets.length })
        row.li.classList.add('is-active')
        const base = i / targets.length
        const mbps = await measureTimebox(target.url, (v, frac) => {
          setValue(v)
          row.speedEl.textContent = fmtMbps(v)
          setBar(base + frac / targets.length)
        })
        row.li.classList.remove('is-active')
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
        setBar((i + 1) / targets.length)
      }

      if (okCount > 0 && best > 0) {
        bestRow?.li.classList.add('is-best')
        setValue(best)
        phaseEl.textContent = t('cdn.doneBest', { v: fmtMbps(best) })
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
      mainBtn.disabled = false
      if (customBtn) customBtn.disabled = false
      if (urlInput) urlInput.disabled = false
    }
  }

  mainBtn.addEventListener('click', () => {
    if (running) return
    void runBatch(TARGETS)
  })

  customBtn?.addEventListener('click', () => {
    if (running || !urlInput) return
    const raw = urlInput.value.trim()
    if (!/^https:\/\/\S+$/.test(raw)) {
      showError(t('cdn.invalidUrl'))
      return
    }
    void runBatch([{ name: 'cdn.customName', url: raw }])
  })

  // 初始即展示预设目标清单（待测态），让用户在开始前知道会测哪些源
  renderRows(TARGETS.map((tg) => t(tg.name)))
}
