import { afterEach, describe, expect, it } from 'vitest'

import { mainBtnLabel, stoppedPhase } from '../src/modules/engine-state'
import { testState } from '../src/modules/test-state'

afterEach(() => {
  if (testState.owner) testState.release(testState.owner)
})

describe('引擎面板的按钮口径', () => {
  it('每个状态都有对应文案，空闲与收尾中都提供「开始测速」', () => {
    expect(mainBtnLabel('idle')).toBe('开始测速')
    expect(mainBtnLabel('running')).toBe('停 止')
    expect(mainBtnLabel('stopping')).toBe('开始测速')
    expect(mainBtnLabel('done')).toBe('再测一次')
    expect(mainBtnLabel('error')).toBe('重 试')
  })
})

describe('作废本轮的状态行', () => {
  it('能立即中断的引擎只说「已停止」', () => {
    testState.acquire('ls')
    expect(stoppedPhase()).toBe('已停止')
  })

  it('底层仍在收尾的引擎附带原因', () => {
    testState.acquire('ndt7')
    testState.markStopping('ndt7')
    const text = stoppedPhase()
    expect(text).toContain('已停止')
    expect(text).toContain('M-Lab NDT7')
    expect(text).toContain('正在结束上一轮测速')
  })

  it('锁交还后原因随之消失，不会残留成谎报', () => {
    testState.acquire('ndt7')
    testState.markStopping('ndt7')
    testState.release('ndt7')
    expect(stoppedPhase()).toBe('已停止')
    expect(testState.stopping).toBe(false)
  })
})
