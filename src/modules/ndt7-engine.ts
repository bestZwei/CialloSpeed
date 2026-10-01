/**
 * M-Lab NDT7 测速引擎（@m-lab/ndt7 官方客户端，Apache-2.0）封装：
 * - 浏览器经 WebSocket 直连 M-Lab 全球节点（locate 服务自动就近选择），本站零带宽成本
 * - 单 TCP 连接学术级测量：与多线程压满带宽的引擎互补，额外给出负载下延迟增量（bufferbloat）
 * - worker 通过 Vite `?worker&url` 注入，避免打包后相对路径失效
 * - 结果仅保存在浏览器本地（onResult 回调 addRecord），同时按 M-Lab 数据政策贡献匿名测量数据
 */

import ndt7 from '@m-lab/ndt7'
import type { Ndt7Measurement } from '@m-lab/ndt7'
import { t } from '../i18n'
import type { TestRecord } from './history'
import { renderSceneVerdicts } from './quality'
import { testState } from './test-state'

/** 每方向测量时长（毫秒），NDT7 默认 10s */
const DURATION_MS = 10_000

/**
 * worker 以静态资源直接提供（public/ndt7/，源自 @m-lab/ndt7，Apache-2.0）：
 * 经 Vite 管线转换会注入 ESM 语法导致经典 Worker 崩溃，故绕过打包
 */
const downloadWorkerUrl = '/ndt7/ndt7-download-worker.js'
const uploadWorkerUrl = '/ndt7/ndt7-upload-worker.js'

/** 服务端 tcp-info 的 RTT 单位为微秒 */
const US_TO_MS = 1 / 1000

type Phase = 'idle' | 'running' | 'done'

export function initNdt7Engine(
  section: HTMLElement,
  onResult?: (rec: TestRecord) => void,
): void {
  const valueEl = section.querySelector<HTMLElement>('.ndt-value')
  const phaseEl = section.querySelector<HTMLElement>('.ndt-phase')
  const barEl = section.querySelector<HTMLElement>('.ndt-bar')
  const downEl = section.querySelector<HTMLElement>('.ndt-m-down strong')
  const upEl = section.querySelector<HTMLElement>('.ndt-m-up strong')
  const pingEl = section.querySelector<HTMLElement>('.ndt-m-ping strong')
  const bloatEl = section.querySelector<HTMLElement>('.ndt-m-bloat strong')
  const mainBtn = section.querySelector<HTMLButtonElement>('.ndt-main-btn')
  const aimEl = section.querySelector<HTMLElement>('.scene-aim')
  const errEl = section.querySelector<HTMLElement>('.ndt-error')
  if (!valueEl || !phaseEl || !mainBtn) return

  let phase: Phase = 'idle'
  let running = false
  let stopped = false // 用户主动停止：本轮结果作废（库内部 worker 无法中断，测量会在后台自然结束）

  const setPhase = (text: string) => {
    phaseEl.textContent = text
  }

  const setValue = (v: number) => {
    valueEl.textContent = v >= 100 ? Math.round(v).toString() : v.toFixed(1)
  }

  const reset = () => {
    valueEl.textContent = '--'
    if (downEl) downEl.textContent = '--'
    if (upEl) upEl.textContent = '--'
    if (pingEl) pingEl.textContent = '--'
    if (bloatEl) bloatEl.textContent = '--'
    if (barEl) barEl.style.width = '0%'
    if (aimEl) {
      aimEl.innerHTML = ''
      aimEl.hidden = true
    }
    errEl?.classList.remove('show')
  }

  const showError = () => {
    if (errEl) errEl.textContent = t('ndt.error')
    errEl?.classList.add('show')
    setPhase(t('ndt.ready'))
  }

  const runTest = async () => {
    if (running) return
    running = true
    phase = 'running'
    testState.running = true
    stopped = false
    mainBtn.disabled = false
    mainBtn.textContent = t('btn.stop') // 测速中可停止
    reset()

    // 指标收集容器
    let downMbps = 0
    let upMbps = 0
    let minRttUs = Infinity // 下载期间的最小 RTT ≈ 空载延迟
    let uploadAvgRttUs = 0
    let uploadRttSamples = 0
    let currentMean = 0
    let phaseStart = 0

    const progressTick = () => {
      if (phaseStart > 0) {
        const pct = Math.min(100, ((performance.now() - phaseStart) / DURATION_MS) * 100)
        if (barEl) barEl.style.width = `${pct.toFixed(1)}%`
      }
    }

    const handleMeasurement = (m: Ndt7Measurement, isUpload: boolean) => {
      if (stopped) return
      if (m.Source === 'client' && typeof m.Data.MeanClientMbps === 'number') {
        currentMean = m.Data.MeanClientMbps
        // 主数字始终跟随当前阶段的实时速度（上传阶段不能停留在下载末值）
        setValue(currentMean)
        const fmt = currentMean >= 100 ? Math.round(currentMean).toString() : currentMean.toFixed(1)
        if (isUpload && upEl) {
          upEl.textContent = fmt
        } else if (!isUpload && downEl) {
          downEl.textContent = fmt
        }
        progressTick()
      } else if (m.Source === 'server') {
        // NDT7 服务端消息为 tcp-info 快照：RTT 字段嵌套在 TCPInfo/BBRInfo 内，单位微秒
        const data = m.Data as { TCPInfo?: { MinRTT?: number; RTT?: number }; BBRInfo?: { MinRTT?: number } }
        const min = data.TCPInfo?.MinRTT ?? data.BBRInfo?.MinRTT
        const smoothed = data.TCPInfo?.RTT
        if (!isUpload && min !== undefined) {
          minRttUs = Math.min(minRttUs, min)
        }
        if (isUpload && smoothed !== undefined) {
          uploadAvgRttUs += smoothed
          uploadRttSamples += 1
        }
      }
    }

    try {
      const code = await ndt7.test(
        {
          download: { duration: DURATION_MS },
          upload: { duration: DURATION_MS },
          userAcceptedDataPolicy: true,
          metadata: { client_name: 'ciallospeed', client_version: '1.0.0' },
          downloadworkerfile: downloadWorkerUrl,
          uploadworkerfile: uploadWorkerUrl,
        },
        {
          start: () => {
            if (stopped) return
            phaseStart = performance.now()
            setPhase(t('phase.latency'))
          },
          downloadStart: () => {
            if (stopped) return
            phaseStart = performance.now()
            setPhase(t('phase.download'))
          },
          downloadMeasurement: (m) => handleMeasurement(m, false),
          downloadComplete: (r) => {
            if (stopped) return
            const c = r.LastClientMeasurement?.MeanClientMbps
            downMbps = c ?? currentMean
            if (downEl) downEl.textContent = downMbps >= 100 ? Math.round(downMbps).toString() : downMbps.toFixed(1)
            phaseStart = 0
          },
          uploadStart: () => {
            if (stopped) return
            phaseStart = performance.now()
            setPhase(t('phase.upload'))
          },
          uploadMeasurement: (m) => handleMeasurement(m, true),
          uploadComplete: (r) => {
            if (stopped) return
            const c = r.LastClientMeasurement?.MeanClientMbps
            upMbps = c ?? upMbps
            if (upEl) upEl.textContent = upMbps >= 100 ? Math.round(upMbps).toString() : upMbps.toFixed(1)
            phaseStart = 0
          },
          error: (message) => {
            if (stopped) return
            console.error('[ndt7]', message)
            showError()
          },
        },
      )

      if (stopped) return // 已停止：本轮结果作废，不写历史

      if (barEl) barEl.style.width = '100%'

      if (code === 0 && downMbps > 0) {
        const pingMs = minRttUs !== Infinity ? minRttUs * US_TO_MS : 0
        const bloatMs =
          uploadRttSamples > 0 && minRttUs !== Infinity
            ? (uploadAvgRttUs / uploadRttSamples - minRttUs) * US_TO_MS
            : 0
        if (pingEl) pingEl.textContent = Math.round(pingMs).toString()
        if (bloatEl) bloatEl.textContent = Math.round(Math.max(0, bloatMs)).toString()
        setValue(downMbps)
        setPhase(t('ndt.done'))
        phase = 'done'
        // NDT7 无抖动指标：传 undefined，游戏评分退化为仅按延迟判定
        renderSceneVerdicts(aimEl, {
          down: downMbps,
          up: upMbps,
          ping: minRttUs !== Infinity ? pingMs : undefined,
        })
        onResult?.({
          down: downMbps,
          up: upMbps,
          ping: Math.round(pingMs),
          ts: Date.now(),
          engine: 'ndt7',
        })
      } else if (code !== 0) {
        showError()
      }
    } catch (err) {
      if (!stopped) {
        console.error('[ndt7]', err)
        showError()
      }
    } finally {
      running = false
      phase = phase === 'running' ? 'idle' : phase
      testState.running = false
      mainBtn.disabled = false
      mainBtn.textContent = t('btn.start')
    }
  }

  mainBtn.addEventListener('click', () => {
    if (running) {
      // 停止：ndt7 库内部创建的 worker 无法从外部中断，底层测量会在后台自然跑完，
      // 这里只立即复位界面并丢弃本轮结果（按钮保持禁用，待后台结束后恢复）
      stopped = true
      reset()
      setPhase(t('state.stopped'))
      mainBtn.disabled = true
      return
    }
    void runTest()
  })
}
