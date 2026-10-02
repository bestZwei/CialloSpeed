/**
 * Cloudflare 官方测速引擎（@cloudflare/speedtest，MIT）封装：
 * - 测速流量走 Cloudflare 全球边缘节点，本站零带宽成本
 * - 禁用 packetLoss（需自备 TURN 服务器）与结果上报（logAimApiUrl: null）
 * - 原生 UI：仪表刻度环 + 量级弧 + 实时轨迹线 + 四宫格结果卡 + 场景评分
 * - 完成后回调 addRecord（engine: 'cf'）写入本地历史
 */

import SpeedTest from '@cloudflare/speedtest'
import type { Results } from '@cloudflare/speedtest'
import { t, type StringKey } from '../i18n'
import { mainBtnLabel, stoppedPhase } from './engine-state'
import type { TestRecord } from './history'
import { renderSceneVerdicts } from './quality'
import { testState } from './test-state'

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

type Phase = 'idle' | 'running' | 'done' | 'error'

const PHASE_KEY: Record<string, StringKey> = {
  latency: 'phase.latency',
  latencyUnderLoad: 'phase.latencyUnderLoad',
  download: 'phase.download',
  upload: 'phase.upload',
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
  const aimEl = section.querySelector<HTMLElement>('.scene-aim')
  const errEl = section.querySelector<HTMLElement>('.cf-error')
  const ticksG = section.querySelector<SVGGElement>('.cf-ticks')
  const magFill = section.querySelector<SVGCircleElement>('.cf-mag-fill')
  const sparkEl = section.querySelector<SVGSVGElement>('.cf-spark')
  const sparkDown = section.querySelector<SVGPolylineElement>('.cf-spark-down')
  const sparkUp = section.querySelector<SVGPolylineElement>('.cf-spark-up')
  if (!valueEl || !unitEl || !phaseEl || !mainBtn) return

  const RING_LEN = 2 * Math.PI * 88
  const MAG_LEN = 2 * Math.PI * 62
  const SPARK_W = 140
  const SPARK_H = 34
  const SPARK_N = 40
  const TICK_COUNT = 60
  const TICK_R1 = 95
  const TICK_R2 = 99.5

  /* ---------- 仪表：刻度环 / 量级弧 / 轨迹线 ---------- */

  // 生成 60 根仪表刻度
  if (ticksG) {
    const NS = 'http://www.w3.org/2000/svg'
    for (let i = 0; i < TICK_COUNT; i++) {
      const a = (i / TICK_COUNT) * Math.PI * 2 - Math.PI / 2
      const line = document.createElementNS(NS, 'line')
      line.setAttribute('x1', (100 + TICK_R1 * Math.cos(a)).toFixed(2))
      line.setAttribute('y1', (100 + TICK_R1 * Math.sin(a)).toFixed(2))
      line.setAttribute('x2', (100 + TICK_R2 * Math.cos(a)).toFixed(2))
      line.setAttribute('y2', (100 + TICK_R2 * Math.sin(a)).toFixed(2))
      ticksG.appendChild(line)
    }
  }

  /** 青色 → 紫色插值 */
  const lerpColor = (t: number): string => {
    const c1 = [0, 184, 230]
    const c2 = [124, 92, 255]
    const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * t))
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
  }

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

  /** 对数量级：1 Mbps → 0，10 Mbps → 0.25，100 Mbps → 0.5，1 Gbps → 0.75，10 Gbps → 1 */
  const magnitudeOf = (mbps: number) => clamp01(Math.log10(Math.max(mbps, 1)) / 4)

  const setMagnitude = (mbps: number) => {
    const frac = magnitudeOf(mbps)
    if (magFill) {
      const len = frac * MAG_LEN
      magFill.style.strokeDasharray = `${len} ${MAG_LEN - len}`
      magFill.classList.toggle('is-on', frac > 0)
    }
    if (ticksG) {
      const lit = Math.round(frac * TICK_COUNT)
      const lines = ticksG.children
      for (let i = 0; i < lines.length; i++) {
        const el = lines[i] as SVGLineElement
        if (i < lit) {
          el.classList.add('lit')
          el.style.stroke = lerpColor(i / TICK_COUNT)
        } else {
          el.classList.remove('lit')
          el.style.stroke = ''
        }
      }
    }
  }

  /** 实时速度轨迹（最近 N 个带宽采样点，青=下载 紫=上传） */
  const updateSpark = () => {
    if (!sparkDown || !sparkUp) return
    const r = engine.results
    const down = r.getDownloadBandwidthPoints().slice(-SPARK_N).map((p) => p.bps / BPS_TO_MBPS)
    const up = r.getUploadBandwidthPoints().slice(-SPARK_N).map((p) => p.bps / BPS_TO_MBPS)
    const max = Math.max(1, ...down, ...up)
    const toPoints = (arr: number[]) =>
      arr.length < 2
        ? ''
        : arr
            .map((v, i) => `${((i / (arr.length - 1)) * SPARK_W).toFixed(1)},${(SPARK_H - 2 - (v / max) * (SPARK_H - 6)).toFixed(1)}`)
            .join(' ')
    sparkDown.setAttribute('points', toPoints(down))
    sparkUp.setAttribute('points', toPoints(up))
    sparkEl?.classList.toggle('is-on', down.length > 1 || up.length > 1)
  }

  const resetGauge = () => {
    setMagnitude(0)
    sparkDown?.setAttribute('points', '')
    sparkUp?.setAttribute('points', '')
    sparkEl?.classList.remove('is-on')
  }

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
  let needsRestart = false // 曾中途停止：引擎残留半轮数据，下次启动必须 restart
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
    renderSceneVerdicts(aimEl, {
      down: (r.getDownloadBandwidth() ?? 0) / BPS_TO_MBPS,
      up: (r.getUploadBandwidth() ?? 0) / BPS_TO_MBPS,
      ping: r.getUnloadedLatency(),
      jitter: r.getUnloadedJitter() ?? undefined,
    })
  }

  const clearError = () => errEl?.classList.remove('show')

  /** 清空全部读数（重新开始 / 切走引擎时作废上一轮结果） */
  const clearReadouts = () => {
    valueEl.textContent = '--'
    unitEl.textContent = 'Mbps'
    if (downEl) downEl.textContent = '--'
    if (upEl) upEl.textContent = '--'
    if (pingEl) pingEl.textContent = '--'
    if (jitterEl) jitterEl.textContent = '--'
    if (aimEl) aimEl.hidden = true
  }

  const showError = (msg: string) => {
    phase = 'error'
    if (phaseEl) phaseEl.textContent = t('phase.ready')
    if (errEl) {
      errEl.textContent = msg
      errEl.classList.add('show')
    }
    mainBtn.textContent = mainBtnLabel('error')
  }

  /* ---------- 相位 / 实时数值 ---------- */

  const setPhase = (key: string) => {
    if (phaseEl) phaseEl.textContent = PHASE_KEY[key] ? t(PHASE_KEY[key]) : t('phase.preparing')
    stageEl?.classList.toggle('is-down', key.startsWith('download'))
    stageEl?.classList.toggle('is-up', key.startsWith('upload'))
  }

  // 测速中：进度环做旋转动画（rAF 驱动，暂停时停止；显式调用与 onRunningChange 回调重复触发时保持幂等）
  const spinRing = () => {
    window.cancelAnimationFrame(rafId)
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

  /** 作废本轮并交还测速锁：界面清空读数、下一次启动必然 restart */
  const voidRound = (): void => {
    finished = true
    needsRestart = true
    window.cancelAnimationFrame(rafId)
    engine.pause()
    phase = 'idle'
    testState.release('cf')
    stageEl?.classList.remove('is-done', 'is-down', 'is-up')
    setRing(0)
    resetGauge()
    clearReadouts()
    if (phaseEl) phaseEl.textContent = stoppedPhase()
    mainBtn.textContent = mainBtnLabel('idle')
  }

  engine.onPhaseChange = ({ measurement }) => {
    // 已作废或已结束的一轮，SDK 迟到的回调不得改写状态行
    if (phase === 'running') setPhase(measurement.type)
  }

  engine.onResultsChange = ({ type }) => {
    if (phase === 'running') {
      updateLiveValue(type)
      renderMetrics(engine.results)
      // 仪表联动：量级刻度 + 轨迹线
      const r = engine.results
      if (type.startsWith('download')) setMagnitude((r.getDownloadBandwidth() ?? 0) / BPS_TO_MBPS)
      else if (type.startsWith('upload')) setMagnitude((r.getUploadBandwidth() ?? 0) / BPS_TO_MBPS)
      updateSpark()
    }
  }

  engine.onRunningChange = (running) => {
    window.cancelAnimationFrame(rafId)
    // 完成瞬间 running 会先变为 false，须避免误判为"停跑"
    if (finished || engine.isFinished) return
    if (running) {
      phase = 'running'
      mainBtn.textContent = mainBtnLabel('running')
      spinRing()
      return
    }
    // 既没完成也没被用户停止却停跑了：按作废处理，否则面板卡在「停 止」且锁再也拿不回来
    voidRound()
  }

  engine.onFinish = (r) => {
    finished = true
    phase = 'done'
    testState.release('cf')
    window.cancelAnimationFrame(rafId)

    const downBps = r.getDownloadBandwidth()
    const upBps = r.getUploadBandwidth()
    const ping = r.getUnloadedLatency() ?? 0
    const down = (downBps ?? 0) / BPS_TO_MBPS
    const up = (upBps ?? 0) / BPS_TO_MBPS

    // 结束态：进度环满格 + 渐变色 + 大号展示下载速度
    setRing(1)
    setMagnitude(down)
    updateSpark()
    stageEl?.classList.remove('is-down', 'is-up')
    stageEl?.classList.add('is-done')
    valueEl.textContent = fmtMbps(down)
    unitEl.textContent = 'Mbps'
    if (phaseEl) phaseEl.textContent = t('phase.done')

    renderMetrics(r)
    renderAim(r)
    mainBtn.textContent = mainBtnLabel('done')

    if (onResult && downBps !== undefined && upBps !== undefined) {
      onResult({ down, up, ping, ts: Date.now(), engine: 'cf' })
    }
  }

  engine.onError = (message) => {
    if (finished) return // 已作废/已完成的一轮：残留请求的报错不该复活界面
    testState.release('cf')
    window.cancelAnimationFrame(rafId)
    showError(t('engine.error', { message }))
  }

  /* ---------- 交互 ---------- */

  /** 启动一轮测速；restart 为真时复用引擎重跑（"再测一次"） */
  const startTest = (restart: boolean) => {
    if (!testState.acquire('cf')) {
      showError(testState.busyMessage())
      return
    }
    finished = false
    phase = 'running'
    stageEl?.classList.remove('is-done')
    setRing(0)
    resetGauge()
    clearReadouts()
    if (phaseEl) phaseEl.textContent = t('phase.connecting')
    mainBtn.textContent = mainBtnLabel('running')
    if (restart || needsRestart) engine.restart()
    else engine.play()
    needsRestart = false
    spinRing()
  }

  /**
   * 停止：SDK 只提供 pause 而没有真正的取消，这里暂停引擎、复位界面并作废结果。
   * finished 置真以屏蔽引擎的迟到回调；下一次启动总是走 restart 开新一轮
   */
  const stop = () => {
    if (phase !== 'running') return
    voidRound()
  }
  testState.register('cf', stop)

  mainBtn.addEventListener('click', () => {
    clearError()
    if (phase === 'idle' || phase === 'error') startTest(false)
    else if (phase === 'running') stop()
    else if (phase === 'done') startTest(true)
  })
}
