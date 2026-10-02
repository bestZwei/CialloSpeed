/**
 * 全局测速锁：同一时刻只允许一个引擎占用链路。
 *
 * - 两个引擎并发测速会互相抢带宽，两边读数都失真，因此后发起者必须被拒绝
 * - 底层无法真正取消的引擎（NDT7 的 worker）在界面停止后仍会收尾，
 *   用 markStopping 保持占用，直到 Promise 落定才 release
 * - 切换引擎面板时调用 stopActive：旧引擎若继续跑就变成"看不见的流量消耗"
 *
 * 引擎 id 复用 history 的 EngineId，便于把占用者渲染成可读名称。
 */

import { t } from '../i18n'
import { ENGINE_LABEL, type EngineId } from './history'

type StopHandler = () => void

let owner: EngineId | null = null
let stopping = false
const stopHandlers = new Map<EngineId, StopHandler>()

export const testState = {
  /** 是否有引擎在测速或收尾；语言切换会中断进行中的测试，据此提示确认 */
  get running(): boolean {
    return owner !== null
  },

  get owner(): EngineId | null {
    return owner
  },

  /** 登记"作废本轮结果"的停止回调，供 stopActive 跨模块调用 */
  register(id: EngineId, stop: StopHandler): void {
    stopHandlers.set(id, stop)
  },

  /** 申请测速锁；已被占用时返回 false，调用方应放弃启动并展示 busyMessage */
  acquire(id: EngineId): boolean {
    if (owner !== null) return false
    owner = id
    stopping = false
    return true
  },

  /** 界面已复位但底层仍在收尾：继续占用，避免残留流量污染下一轮 */
  markStopping(id: EngineId): void {
    if (owner === id) stopping = true
  },

  release(id: EngineId): void {
    if (owner === id) {
      owner = null
      stopping = false
    }
  },

  /** 停止当前占用者并作废其结果（无占用者时为空操作） */
  stopActive(): void {
    if (owner === null) return
    stopHandlers.get(owner)?.()
  },

  /** 被拒绝启动时给用户的提示 */
  busyMessage(): string {
    if (owner === null) return ''
    const engine = t(ENGINE_LABEL[owner])
    return stopping ? t('st.stopping', { engine }) : t('st.busy', { engine })
  },
}
