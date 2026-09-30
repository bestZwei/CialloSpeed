/**
 * Cloudflare 官方测速引擎（@cloudflare/speedtest，MIT）封装：
 * - 测速流量走 Cloudflare 全球边缘节点，本站零带宽成本
 * - 禁用 packetLoss（需自备 TURN 服务器）与结果上报（logAimApiUrl: null）
 * - 原生 UI：进度环 + 实时相位 + 四宫格结果卡 + AIM 场景评分
 * - 完成后回调 addRecord（engine: 'cf'）写入本地历史
 */

import SpeedTest from '@cloudflare/speedtest'
import type { Results } from '@cloudflare/speedtest'
import type { TestRecord } from './history'

/** 测量阶段：不包含 packetLoss（需要 TURN 服务器），带宽档位沿用官方由小到大的策略 */
const MEASUREMENTS = [
  { type: 'latency', numPackets: 10 },
  { type: 'download', bytes: 100_000, count: 9, bypassMinDuration: false },
  { type: 'download', bytes: 1_000_000, count: 8 },
  { type: 'download', bytes: 10_000_000, count: 6 },
  { type: 'upload', bytes: 100_000, count: 9, bypassMinDuration: false },
  { type: 'upload', bytes: 1_000_000, count: 8 },
  { type: 'upload', bytes: 10_000_000, count: 6 },
] as const

type Phase = 'idle' | 'running' | 'paused' | 'done' | 'error'

const PHASE_TEXT: Record<string, string> = {
  latency: '正在测量延迟…',
  latencyUnderLoad: '正在测量负载延迟…',
  download: '正在测下载速度',
  upload: '正在测上传速度',
}

/** 场景评分：基于实测指标本地计算（引擎 AIM 评分依赖 packetLoss，需要 TURN 服务器，故不使用） */
interface SceneVerdict {
  tone: 'ok' | 'warn' | 'bad'
  label: string
}

function sceneVerdicts(m: { down: number; up: number; ping: number; jitter: number }): Array<{ label: string; v: SceneVerdict }> {
  const streaming: SceneVerdict =
    m.down >= 50 ? { tone: 'ok', label: '极佳' } :
    m.down >= 25 ? { tone: 'ok', label: '良好' } :
    m.down >= 10 ? { tone: 'warn', label: '一般' } :
    { tone: 'bad', label: '吃力' }

  const gaming: SceneVerdict =
    m.ping <= 20 && m.jitter <= 3 ? { tone: 'ok', label: '电竞级' } :
    m.ping <= 50 && m.jitter <= 8 ? { tone: 'ok', label: '良好' } :
    m.ping <= 100 ? { tone: 'warn', label: '一般' } :
    { tone: 'bad', label: '偏高' }

  const rtc: SceneVerdict =
    m.up >= 20 && m.ping <= 50 ? { tone: 'ok', label: '极佳' } :
    m.up >= 8 && m.ping <= 80 ? { tone: 'ok', label: '良好' } :
    m.up >= 3 ? { tone: 'warn', label: '一般' } :
    { tone: 'bad', label: '吃力' }

  return [
    { label: '视频流媒体', v: streaming },
    { label: '游戏', v: gaming },
    { label: '视频通话', v: rtc },
  ]
}

const BPS_TO_MBPS = 1e6

export function initCloudflareEngine(
  section: HTMLElement,
  onResult?: (rec: TestRecord) => void,
): void {
  const valueEl = section.querySelector<HTMLElement>('.cf-value')
  const unitEl = section.querySelector<HTMLElement>('.cf-unit')
  const phaseEl = section.querySelector<HTMLElement>('.cf-phase')
  const ringEl = section.querySelector<SVGCircleElement>('.cf-ring-fill')
  const stageEl = section.querySelector<HTMLElement>('.cf-stage')
  const mainBtn = section.querySelector<HTMLButtonElement>('.cf-main-btn')
  const downEl = section.querySelector<HTMLElement>('.cf-metric-down strong')
  const upEl = section.querySelector<HTMLElement>('.cf-metric-up strong')
  const pingEl = section.querySelector<HTMLElement>('.cf-metric-ping strong')
  const jitterEl = section.querySelector<HTMLElement>('.cf-metric-jitter strong')
  const aimEl = section.querySelector<HTMLElement>('.cf-aim')
  const errEl = section.querySelector<HTMLElement>('.cf-error')
  if (!valueEl || !unitEl || !phaseEl || !mainBtn) return

  const RING_LEN = 2 * Math.PI * 88

  const engine = new SpeedTest({
    autoStart: false,
    measurements: [...MEASUREMENTS],
    measureDownloadLoadedLatency: true,
    measureUploadLoadedLatency: true,
    // 结果仅存本地：不向 Cloudflare 上报测速结果，也不记录单次测量日志
    logAimApiUrl: null,
    logMeasurementApiUrl: null,
  })

  let phase: Phase = 'idle'
  let finished = false
  let rafId = 0

  /* ---------- 渲染辅助 ---------- */

  const setRing = (fraction: number) => {
    if (!ringEl) return
    const len = Math.max(0, Math.min(1, fraction)) * RING_LEN
    ringEl.style.strokeDasharray = `${len} ${RING_LEN - len}`
    ringEl.classList.toggle('is-on', fraction > 0)
  }

  const fmtMbps = (mbps: number): string =>
    mbps >= 100 ? mbps.toFixed(0) : mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2)

  const renderMetrics = (r: Results) => {
    const down = r.getDownloadBandwidth()
    const up = r.getUploadBandwidth()
    const ping = r.getUnloadedLatency()
    const jitter = r.getUnloadedJitter()
    if (downEl) downEl.textContent = down !== undefined ? fmtMbps(down / BPS_TO_MBPS) : '--'
    if (upEl) upEl.textContent = up !== undefined ? fmtMbps(up / BPS_TO_MBPS) : '--'
    if (pingEl) pingEl.textContent = ping !== undefined ? ping.toFixed(0) : '--'
    if (jitterEl) jitterEl.textContent = jitter != null ? jitter.toFixed(1) : '--'
  }

  const renderAim = (r: Results) => {
    if (!aimEl) return
    const down = (r.getDownloadBandwidth() ?? 0) / BPS_TO_MBPS
    const up = (r.getUploadBandwidth() ?? 0) / BPS_TO_MBPS
    const ping = r.getUnloadedLatency() ?? 999
    const jitter = r.getUnloadedJitter() ?? 999

    aimEl.innerHTML = ''
    for (const { label, v } of sceneVerdicts({ down, up, ping, jitter })) {
      const chip = document.createElement('span')
      chip.className = 'metric-chip'
      chip.innerHTML = `<span class="dot dot-${v.tone}"></span>${label} <small>${v.label}</small>`
      aimEl.appendChild(chip)
    }
    aimEl.hidden = aimEl.childElementCount === 0
  }

  const clearError = () => errEl?.classList.remove('show')

  const showError = (msg: string) => {
    phase = 'error'
    setPhase('idle')
    if (errEl) {
      errEl.textContent = msg
      errEl.classList.add('show')
    }
    mainBtn.textContent = '重 试'
  }

  /* ---------- 相位 / 实时数值 ---------- */

  const setPhase = (key: string) => {
    if (phaseEl) phaseEl.textContent = PHASE_TEXT[key] ?? '准备中…'
    stageEl?.classList.toggle('is-down', key.startsWith('download'))
    stageEl?.classList.toggle('is-up', key.startsWith('upload'))
  }

  // 测速中：进度环做旋转动画（rAF 驱动，暂停时停止）
  const spinRing = () => {
    const start = performance.now()
    const tick = (now: number) => {
      if (phase !== 'running') return
      const deg = ((now - start) / 20) % 360
      setRing(0.25 + 0.5 * (0.5 - 0.5 * Math.cos((deg * Math.PI) / 180)))
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  const updateLiveValue = (currentType: string) => {
    const r = engine.results
    if (currentType.startsWith('download')) {
      const bps = r.getDownloadBandwidth()
      if (bps !== undefined) {
        valueEl.textContent = fmtMbps(bps / BPS_TO_MBPS)
        unitEl.textContent = 'Mbps'
      }
    } else if (currentType.startsWith('upload')) {
      const bps = r.getUploadBandwidth()
      if (bps !== undefined) {
        valueEl.textContent = fmtMbps(bps / BPS_TO_MBPS)
        unitEl.textContent = 'Mbps'
      }
    } else if (currentType.startsWith('latency')) {
      const ping = r.getUnloadedLatency()
      if (ping !== undefined) {
        valueEl.textContent = ping.toFixed(0)
        unitEl.textContent = 'ms'
      }
    }
  }

  /* ---------- 引擎事件 ---------- */

  engine.onPhaseChange = ({ measurement }) => setPhase(measurement.type)

  engine.onResultsChange = ({ type }) => {
    if (phase === 'running') {
      updateLiveValue(type)
      renderMetrics(engine.results)
    }
  }

  engine.onRunningChange = (running) => {
    window.cancelAnimationFrame(rafId)
    // 完成瞬间 running 会先变为 false，须避免误判为“已暂停”
    if (finished || engine.isFinished) return
    phase = running ? 'running' : 'paused'
    mainBtn.textContent = running ? '暂 停' : '继续测速'
    if (running) {
      spinRing()
    } else {
      if (phaseEl) phaseEl.textContent = '已暂停，点击继续'
    }
  }

  engine.onFinish = (r) => {
    finished = true
    phase = 'done'
    window.cancelAnimationFrame(rafId)

    const downBps = r.getDownloadBandwidth()
    const upBps = r.getUploadBandwidth()
    const ping = r.getUnloadedLatency() ?? 0
    const down = (downBps ?? 0) / BPS_TO_MBPS
    const up = (upBps ?? 0) / BPS_TO_MBPS

    // 结束态：进度环满格 + 渐变色 + 大号展示下载速度
    setRing(1)
    stageEl?.classList.remove('is-down', 'is-up')
    stageEl?.classList.add('is-done')
    valueEl.textContent = fmtMbps(down)
    unitEl.textContent = 'Mbps'
    if (phaseEl) phaseEl.textContent = '测速完成 · 结果已存入本地历史'

    renderMetrics(r)
    renderAim(r)
    mainBtn.textContent = '再测一次'

    if (onResult && downBps !== undefined && upBps !== undefined) {
      onResult({ down, up, ping, ts: Date.now(), engine: 'cf' })
    }
  }

  engine.onError = (message) => {
    window.cancelAnimationFrame(rafId)
    showError(`测速出错：${message}。请检查网络后重试。`)
  }

  /* ---------- 交互 ---------- */

  mainBtn.addEventListener('click', () => {
    clearError()
    stageEl?.classList.remove('is-done')
    if (phase === 'idle' || phase === 'error') {
      finished = false
      phase = 'running'
      if (phaseEl) phaseEl.textContent = '正在连接 Cloudflare 节点…'
      mainBtn.textContent = '暂 停'
      engine.play()
      spinRing()
    } else if (phase === 'running') {
      engine.pause()
    } else if (phase === 'paused') {
      engine.play()
      spinRing()
    } else if (phase === 'done') {
      finished = false
      phase = 'running'
      stageEl?.classList.remove('is-done')
      setRing(0)
      aimEl && (aimEl.hidden = true)
      if (downEl) downEl.textContent = '--'
      if (upEl) upEl.textContent = '--'
      if (pingEl) pingEl.textContent = '--'
      if (jitterEl) jitterEl.textContent = '--'
      valueEl.textContent = '--'
      unitEl.textContent = 'Mbps'
      if (phaseEl) phaseEl.textContent = '正在连接 Cloudflare 节点…'
      mainBtn.textContent = '暂 停'
      engine.restart()
      spinRing()
    }
  })
}
