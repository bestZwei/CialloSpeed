/**
 * 全局测速状态：跨模块判断"是否正在测速"。
 *
 * 用途：语言切换会导致整页跳转，进行中的测试会被中断且不写入历史，
 * 因此需要在跳转前给出确认提示（见 layout.ts 的 initLangSwitch）。
 */

export const testState = {
  running: false,
}
