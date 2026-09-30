/** 中文动态文案（键名即契约，en.ts 必须覆盖全部键） */
export const strings = {
  // 测量阶段
  'phase.latency': '正在测量延迟…',
  'phase.latencyUnderLoad': '正在测量负载延迟…',
  'phase.download': '正在测下载速度',
  'phase.upload': '正在测上传速度',
  'phase.preparing': '准备中…',
  'phase.connecting': '正在连接 Cloudflare 节点…',
  'phase.paused': '已暂停，点击继续',
  'phase.done': '测速完成',

  // 按钮
  'btn.start': '开始测速',
  'btn.pause': '暂 停',
  'btn.resume': '继续测速',
  'btn.retry': '重 试',
  'btn.again': '再测一次',

  // 错误
  'engine.error': '测速出错：{message}。请检查网络后重试。',

  // 质量评级
  'q.excellent': '极佳',
  'q.good': '良好',
  'q.fair': '一般',
  'q.great': '优秀',
  'q.esports': '电竞级',
  'q.high': '偏高',
  'q.slow': '偏慢',
  'q.weak': '吃力',

  // 场景评分
  'scene.streaming': '视频流媒体',
  'scene.gaming': '游戏',
  'scene.rtc': '视频通话',

  // 历史记录
  'engine.cf': 'Cloudflare 引擎',
  'engine.ost': 'OpenSpeedTest',
  'engine.manual': '手动录入',
  'history.clearConfirm': '确定清空所有本地测速记录吗？',

  // 主题
  'theme.toLight': '切换到浅色模式',
  'theme.toDark': '切换到深色模式',
} as const
