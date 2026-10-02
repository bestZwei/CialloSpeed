/**
 * 原生引擎面板的统一状态口径：Cloudflare / NDT7 / LibreSpeed / CDN 四个面板共用
 * 同一套「主按钮文案」与「作废本轮的状态行」。
 *
 * 四个面板原先各写一份开始/停止/复位流程，口径就会悄悄漂移 —— 例如某个引擎停止后
 * 按钮仍写着「停 止」并且被禁用，看起来像界面坏了。集中成一份后，新增引擎照抄即可：
 *
 * - idle     未测速        → 开始测速
 * - running  测速中         → 停 止（必须立即可叫停）
 * - stopping 结果已作废、    → 开始测速（可点；点了由互斥锁说明为什么还不能开新一轮）
 *            底层还在收尾
 * - done     已完成         → 再测一次
 * - error    本轮失败       → 重 试
 */

import { t, type StringKey } from '../i18n'
import { testState } from './test-state'

export type EngineState = 'idle' | 'running' | 'stopping' | 'done' | 'error'

const STATE_LABEL: Record<EngineState, StringKey> = {
  idle: 'btn.start',
  running: 'btn.stop',
  stopping: 'btn.start',
  done: 'btn.again',
  error: 'btn.retry',
}

/** 主按钮文案：状态唯一决定文案，不在各面板里手写字符串 */
export const mainBtnLabel = (state: EngineState): string => t(STATE_LABEL[state])

/**
 * 作废本轮后的状态行。仍在收尾的引擎（底层流量无法取消）附带互斥锁给出的原因，
 * 否则界面只说「已停止」，读数全空，像面板出了问题。
 * 须在 markStopping 之后、release 之前调用。
 */
export function stoppedPhase(): string {
  const base = t('state.stopped')
  return testState.stopping ? `${base} · ${testState.busyMessage()}` : base
}
