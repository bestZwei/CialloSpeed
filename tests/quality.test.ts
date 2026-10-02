import { describe, expect, it } from 'vitest'

import { sceneVerdicts, type QualityMetrics } from '../src/modules/quality'

const labels = (m: QualityMetrics) => sceneVerdicts(m).map((s) => `${s.label}:${s.v.label}`)

describe('sceneVerdicts 阈值', () => {
  it('下载档位边界（50 / 25 / 10 Mbps）', () => {
    const streaming = (down: number) =>
      sceneVerdicts({ down })[0].v.label

    expect(streaming(50)).toBe('q.excellent')
    expect(streaming(49.9)).toBe('q.good')
    expect(streaming(25)).toBe('q.good')
    expect(streaming(24.9)).toBe('q.fair')
    expect(streaming(10)).toBe('q.fair')
    expect(streaming(9.9)).toBe('q.weak')
  })

  it('游戏同时看延迟与抖动，抖动超标即降档', () => {
    const gaming = (ping: number, jitter?: number) =>
      sceneVerdicts({ down: 100, ping, jitter }).find((s) => s.label === 'scene.gaming')!.v.label

    expect(gaming(20, 3)).toBe('q.esports')
    expect(gaming(20, 3.1)).toBe('q.good')
    expect(gaming(20.1, 1)).toBe('q.good')
    expect(gaming(50, 8)).toBe('q.good')
    expect(gaming(50.1)).toBe('q.fair')
    expect(gaming(100)).toBe('q.fair')
    expect(gaming(100.1)).toBe('q.high')
  })

  it('缺抖动时游戏退化为仅按延迟判定', () => {
    expect(sceneVerdicts({ down: 100, ping: 15 })[1].v.label).toBe('q.esports')
  })

  it('视频通话需要上传与延迟同时达标', () => {
    const rtc = (up: number, ping: number) =>
      sceneVerdicts({ down: 100, up, ping }).find((s) => s.label === 'scene.rtc')!.v.label

    expect(rtc(20, 50)).toBe('q.excellent')
    expect(rtc(19.9, 50)).toBe('q.good')
    expect(rtc(20, 50.1)).toBe('q.good')
    expect(rtc(8, 80)).toBe('q.good')
    expect(rtc(8, 80.1)).toBe('q.fair')
    expect(rtc(3, 300)).toBe('q.fair')
    expect(rtc(2.9, 10)).toBe('q.weak')
  })
})

describe('sceneVerdicts 指标缺失时的省略', () => {
  it('只有下载（CDN 直链）→ 仅视频流媒体', () => {
    expect(sceneVerdicts({ down: 30 }).map((s) => s.label)).toEqual(['scene.streaming'])
  })

  it('有下载 + 延迟、无上传 → 省略视频通话', () => {
    expect(sceneVerdicts({ down: 30, ping: 20 }).map((s) => s.label)).toEqual([
      'scene.streaming',
      'scene.gaming',
    ])
  })

  it('有下载 + 上传、无延迟 → 省略游戏与视频通话', () => {
    expect(sceneVerdicts({ down: 30, up: 10 }).map((s) => s.label)).toEqual(['scene.streaming'])
  })

  it('三项齐全 → 三个场景', () => {
    expect(labels({ down: 100, up: 20, ping: 10, jitter: 1 })).toEqual([
      'scene.streaming:q.excellent',
      'scene.gaming:q.esports',
      'scene.rtc:q.excellent',
    ])
  })
})
