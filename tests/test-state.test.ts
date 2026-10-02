import { afterEach, describe, expect, it, vi } from 'vitest'

import { testState } from '../src/modules/test-state'

afterEach(() => {
  if (testState.owner) testState.release(testState.owner)
})

describe('测速互斥锁', () => {
  it('同一时刻只有一个引擎能拿到锁', () => {
    expect(testState.running).toBe(false)
    expect(testState.acquire('cf')).toBe(true)
    expect(testState.owner).toBe('cf')
    expect(testState.acquire('ndt7')).toBe(false)
    expect(testState.owner).toBe('cf')
  })

  it('占用者自己 release 后锁才放开', () => {
    testState.acquire('cf')
    testState.release('ndt7')
    expect(testState.running).toBe(true)
    testState.release('cf')
    expect(testState.running).toBe(false)
    expect(testState.acquire('ls')).toBe(true)
  })

  it('busyMessage 报出占用引擎名', () => {
    testState.acquire('ndt7')
    expect(testState.busyMessage()).toContain('M-Lab NDT7')
    expect(testState.busyMessage()).toContain('正在测速')
  })

  it('收尾期间换成等待文案，重新 acquire 会复位', () => {
    testState.acquire('ndt7')
    testState.markStopping('ndt7')
    expect(testState.busyMessage()).toContain('正在结束上一轮测速')
    testState.release('ndt7')
    testState.acquire('ndt7')
    expect(testState.busyMessage()).toContain('正在测速')
  })

  it('stopping 只在收尾期间为真', () => {
    testState.acquire('ndt7')
    expect(testState.stopping).toBe(false)
    testState.markStopping('ndt7')
    expect(testState.stopping).toBe(true)
    expect(testState.running).toBe(true)
    testState.release('ndt7')
    expect(testState.stopping).toBe(false)
  })

  it('非占用者无法把自己标记为收尾中', () => {
    testState.acquire('cf')
    testState.markStopping('ndt7')
    expect(testState.stopping).toBe(false)
  })

  it('无占用者时 busyMessage 为空串、stopActive 不触发任何回调', () => {
    const stop = vi.fn()
    testState.register('cf', stop)
    expect(testState.busyMessage()).toBe('')
    testState.stopActive()
    expect(stop).not.toHaveBeenCalled()
  })

  it('stopActive 只停止当前占用者', () => {
    const cfStop = vi.fn()
    const lsStop = vi.fn()
    testState.register('cf', cfStop)
    testState.register('ls', lsStop)
    testState.acquire('ls')
    testState.stopActive()
    expect(lsStop).toHaveBeenCalledTimes(1)
    expect(cfStop).not.toHaveBeenCalled()
  })
})
