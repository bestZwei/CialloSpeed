/**
 * 场景体验评分：把实测指标（下载 / 上传 / 延迟 / 抖动）映射成
 * 「视频流媒体 / 游戏 / 视频通话」三个场景的定性评价，供各引擎面板共用（本地计算，不上报）。
 *
 * 指标不全时自动省略对应场景，宁缺毋滥：
 * - 只有下载（CDN 直链）→ 仅「视频流媒体」
 * - 有下载/延迟、无上传（如部分引擎）→ 省略「视频通话」
 * - 无抖动 → 「游戏」退化为仅按延迟判定（宽松近似，好过不给结论）
 */

import { t, type StringKey } from '../i18n'

export interface SceneVerdict {
  tone: 'ok' | 'warn' | 'bad'
  label: StringKey
}

export interface SceneResult {
  label: StringKey
  v: SceneVerdict
}

export interface QualityMetrics {
  /** 下载 Mbps（必需，缺失时调用方不该渲染评分） */
  down: number
  /** 上传 Mbps；缺失则省略视频通话评分 */
  up?: number
  /** 延迟 ms；缺失则省略游戏与视频通话评分 */
  ping?: number
  /** 抖动 ms；缺失则游戏评分仅按延迟判定 */
  jitter?: number
}

/** 计算各场景评价（按可判定性过滤） */
export function sceneVerdicts(m: QualityMetrics): SceneResult[] {
  const out: SceneResult[] = []

  out.push({
    label: 'scene.streaming',
    v:
      m.down >= 50 ? { tone: 'ok', label: 'q.excellent' } :
      m.down >= 25 ? { tone: 'ok', label: 'q.good' } :
      m.down >= 10 ? { tone: 'warn', label: 'q.fair' } :
      { tone: 'bad', label: 'q.weak' },
  })

  if (m.ping !== undefined) {
    const jitter = m.jitter ?? 0
    out.push({
      label: 'scene.gaming',
      v:
        m.ping <= 20 && jitter <= 3 ? { tone: 'ok', label: 'q.esports' } :
        m.ping <= 50 && jitter <= 8 ? { tone: 'ok', label: 'q.good' } :
        m.ping <= 100 ? { tone: 'warn', label: 'q.fair' } :
        { tone: 'bad', label: 'q.high' },
    })
  }

  if (m.up !== undefined && m.ping !== undefined) {
    out.push({
      label: 'scene.rtc',
      v:
        m.up >= 20 && m.ping <= 50 ? { tone: 'ok', label: 'q.excellent' } :
        m.up >= 8 && m.ping <= 80 ? { tone: 'ok', label: 'q.good' } :
        m.up >= 3 ? { tone: 'warn', label: 'q.fair' } :
        { tone: 'bad', label: 'q.weak' },
    })
  }

  return out
}

/** 清空并重建场景评价 chips；无内容时隐藏容器 */
export function renderSceneVerdicts(el: HTMLElement | null, m: QualityMetrics): void {
  if (!el) return
  el.innerHTML = ''
  for (const { label, v } of sceneVerdicts(m)) {
    const chip = document.createElement('span')
    chip.className = 'metric-chip'
    chip.innerHTML = `<span class="dot dot-${v.tone}"></span>${t(label)} <small>${t(v.label)}</small>`
    el.appendChild(chip)
  }
  el.hidden = el.childElementCount === 0
}
