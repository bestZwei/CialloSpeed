import type { StringKey } from '../index'

/** 英文动态文案；类型层面保证与中文键一一对应 */
export const strings: Record<StringKey, string> = {
  'phase.latency': 'Measuring latency…',
  'phase.latencyUnderLoad': 'Measuring latency under load…',
  'phase.download': 'Testing download speed',
  'phase.upload': 'Testing upload speed',
  'phase.preparing': 'Preparing…',
  'phase.connecting': 'Connecting to a Cloudflare edge node…',
  'phase.paused': 'Paused — click to resume',
  'phase.done': 'Test complete',

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
  'engine.manual': 'Manual entry',
  'history.clearConfirm': 'Clear all local speed test records?',

  'theme.toLight': 'Switch to light mode',
  'theme.toDark': 'Switch to dark mode',
}
