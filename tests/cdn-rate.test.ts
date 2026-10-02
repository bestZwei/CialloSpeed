import { describe, expect, it } from 'vitest'

import { steadyStateMbps } from '../src/modules/cdn-engine'

const MB = 1024 * 1024

describe('steadyStateMbps 稳态口径', () => {
  it('跳过慢启动窗口，只按窗口之后的字节增量计时', () => {
    // 10s 内共下 100MB，前 1.5s 爬坡下掉 10MB → 90MB / 8.5s
    const mbps = steadyStateMbps(10, 100 * MB, 10 * MB)
    expect(mbps).toBeCloseTo((90 * MB * 8) / 8.5 / 1e6, 6)
  })

  it('爬坡期的字节从分子里扣除：爬坡越多，稳态读数越低', () => {
    const slow = steadyStateMbps(10, 100 * MB, 10 * MB)
    const fast = steadyStateMbps(10, 100 * MB, 20 * MB)
    expect(fast!).toBeLessThan(slow!)
  })

  it('有效计时窗口不足 0.2s 时判为不可信', () => {
    expect(steadyStateMbps(1.6, 50 * MB, 5 * MB)).toBeNull()
    expect(steadyStateMbps(1.8, 50 * MB, 5 * MB)).not.toBeNull()
  })

  it('极快线路在爬坡期内跑满：回退全窗口计量', () => {
    const mbps = steadyStateMbps(10, 50 * MB, -1)
    expect(mbps).toBeCloseTo((50 * MB * 8) / 10 / 1e6, 6)
  })

  it('整轮样本小于 8MB 时不读数（噪声大于意义）', () => {
    expect(steadyStateMbps(10, 7.99 * MB, -1)).toBeNull()
    expect(steadyStateMbps(10, 8 * MB, -1)).not.toBeNull()
  })

  it('已越过爬坡窗口时不受 8MB 门槛约束', () => {
    expect(steadyStateMbps(5, 2 * MB, 1 * MB)).toBeCloseTo((1 * MB * 8) / 3.5 / 1e6, 6)
  })
})
