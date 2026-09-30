import type { StringKey } from '../index'

/** 英文动态文案；类型层面保证与中文键一一对应 */
export const strings: Record<StringKey, string> = {
  'phase.latency': 'Latency',
  'phase.latencyUnderLoad': 'Latency (load)',
  'phase.download': 'Download',
  'phase.upload': 'Upload',
  'phase.preparing': 'Preparing',
  'phase.connecting': 'Connecting',
  'phase.paused': 'Paused',
  'phase.done': 'Done',

  'btn.start': 'Start Test',
  'btn.pause': 'Pause',
  'btn.resume': 'Resume',
  'btn.retry': 'Retry',
  'btn.again': 'Test Again',

  'engine.error': 'Test failed: {message}. Check your network and try again.',

  'q.excellent': 'Excellent',
  'q.good': 'Good',
  'q.fair': 'Fair',
  'q.great': 'Great',
  'q.esports': 'Esports-grade',
  'q.high': 'High',
  'q.slow': 'Slow',
  'q.weak': 'Struggling',

  'scene.streaming': 'Video streaming',
  'scene.gaming': 'Gaming',
  'scene.rtc': 'Video calls',

  'engine.cf': 'Cloudflare engine',
  'engine.ost': 'OpenSpeedTest',
  'engine.ndt7': 'M-Lab NDT7',
  'engine.ls': 'LibreSpeed',
  'engine.sm': 'SpeedMeter',
  'engine.mn': 'Meter.net',
  'engine.manual': 'Manual entry',
  'langSwitchConfirm': 'A test is running. Switching language will abort it (the result won\'t be saved). Continue?',
  'ndt.error': 'Could not reach M-Lab servers. Please try again later.',
  'ndt.ready': 'Ready?',
  'ndt.done': 'Done',
  'ls.selecting': 'Selecting the best node…',
  'ls.ready': 'Ready?',
  'ls.done': 'Done',
  'ls.error': 'Could not reach LibreSpeed nodes. Please try again later.',
  'ls.serverAuto': 'Auto',
  'ls.retry': 'fallback',
  'history.clearConfirm': 'Clear all local speed test records?',

  'theme.toLight': 'Switch to light mode',
  'theme.toDark': 'Switch to dark mode',
}
