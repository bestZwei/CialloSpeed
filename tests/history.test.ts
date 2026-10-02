import { beforeEach, describe, expect, it } from 'vitest'

import { addRecord, clearAllRecords, isRecord, loadHistory, type TestRecord } from '../src/modules/history'

const KEY = 'ciallospeed-history'

const rec = (over: Partial<TestRecord> = {}): TestRecord => ({
  down: 100,
  up: 40,
  ping: 12,
  ts: 1_700_000_000_000,
  engine: 'cf',
  ...over,
})

describe('isRecord 数据契约', () => {
  it('接受合法记录（含可选 server 来源）', () => {
    expect(isRecord(rec())).toBe(true)
    expect(isRecord(rec({ server: 'Vultr · 新加坡' }))).toBe(true)
    expect(isRecord({ down: 1, up: 1, ping: 1, ts: 1 })).toBe(true)
  })

  it('拒绝脏数据与越界值', () => {
    expect(isRecord(null)).toBe(false)
    expect(isRecord('123')).toBe(false)
    expect(isRecord(rec({ down: -1 }))).toBe(false)
    expect(isRecord(rec({ up: Number.NaN }))).toBe(false)
    expect(isRecord(rec({ ping: Number.POSITIVE_INFINITY }))).toBe(false)
    expect(isRecord(rec({ ts: 0 }))).toBe(false)
  })

  it('拒绝未知引擎与非字符串 server', () => {
    expect(isRecord({ ...rec(), engine: 'evil' })).toBe(false)
    expect(isRecord({ ...rec(), server: 42 })).toBe(false)
  })
})

describe('历史记录读写', () => {
  beforeEach(() => localStorage.clear())

  it('存储缺失或损坏时回落空数组', () => {
    expect(loadHistory()).toEqual([])
    localStorage.setItem(KEY, 'not json')
    expect(loadHistory()).toEqual([])
    localStorage.setItem(KEY, '{"down":1}')
    expect(loadHistory()).toEqual([])
  })

  it('逐条过滤非法记录', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([rec({ ts: 1 }), { down: 'x' }, null, rec({ ts: 2 })]),
    )
    expect(loadHistory().map((r) => r.ts)).toEqual([1, 2])
  })

  it('新记录排在最前，server 来源原样保留', () => {
    addRecord(rec({ ts: 1, engine: 'ls', server: 'Amsterdam · Sharktech' }))
    addRecord(rec({ ts: 2, engine: 'cdn', server: 'Vultr · 东京' }))
    const list = loadHistory()
    expect(list.map((r) => r.ts)).toEqual([2, 1])
    expect(list[0].server).toBe('Vultr · 东京')
    expect(list[1].server).toBe('Amsterdam · Sharktech')
  })

  it('超过 20 条时丢弃最旧的', () => {
    for (let i = 1; i <= 25; i++) addRecord(rec({ ts: i }))
    const list = loadHistory()
    expect(list).toHaveLength(20)
    expect(list[0].ts).toBe(25)
    expect(list[19].ts).toBe(6)
  })

  it('clearAllRecords 清空存储', () => {
    addRecord(rec())
    clearAllRecords()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(loadHistory()).toEqual([])
  })
})
