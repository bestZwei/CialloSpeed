/** 中文动态文案（键名即契约，en.ts 必须覆盖全部键） */
export const strings = {
  // 测量阶段
  'phase.latency': '延迟',
  'phase.latencyUnderLoad': '负载延迟',
  'phase.download': '下载中',
  'phase.upload': '上传中',
  'phase.preparing': '准备中',
  'phase.connecting': '连接中',
  'phase.paused': '已暂停',
  'phase.done': '已完成',

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
  'engine.ndt7': 'M-Lab NDT7',
  'engine.ls': 'LibreSpeed',
  'engine.sm': 'SpeedMeter',
  'engine.mn': 'Meter.net',
  'engine.cdn': 'CDN 直链',
  'engine.manual': '手动录入',
  'langSwitchConfirm': '测速进行中，切换语言会中断当前测试（结果不会保存）。确定继续吗？',
  'ndt.error': 'M-Lab 节点连接失败，请稍后重试',
  'ndt.ready': '准备好了？',
  'ndt.done': '已完成',
  'ls.selecting': '正在选择节点…',
  'ls.ready': '准备好了？',
  'ls.done': '已完成',
  'ls.error': 'LibreSpeed 节点连接失败，请稍后重试',
  'ls.serverAuto': '自动选择',
  'ls.retry': '备用',
  'cdn.ready': '准备好了？',
  'cdn.testing': '测速中：{name}（{i}/{n}）',
  'cdn.doneBest': '已完成 · 最高 {v} Mbps 已记入历史',
  'cdn.failed': '失败',
  'cdn.failedAll': 'CDN 直链测速失败，请稍后重试',
  'cdn.invalidUrl': '请输入 https:// 开头的文件直链',
  'cdn.customName': '自定义链接',
  'cdn.aliElectron': '阿里云 · npmmirror',
  'cdn.tencentNpm': '腾讯云 · npm 镜像',
  'cdn.vultrSg': 'Vultr · 新加坡',
  'cdn.vultrTyo': 'Vultr · 东京',
  'cdn.vultrLax': 'Vultr · 洛杉矶',
  'history.clearConfirm': '确定清空所有本地测速记录吗？',

  // 访客网络信息（IP / 归属地 / 运营商）
  'ip.view': '查看我的 IP 信息',
  'ip.hide': '隐藏',
  'ip.ip': 'IP',
  'ip.place': '归属地',
  'ip.isp': '运营商',
  'ip.loading': '查询中…',
  'ip.failed': '查询失败，请稍后重试',
  'ip.retry': '重试',
  'ip.unknown': '未知',

  // 主题
  'theme.toLight': '切换到浅色模式',
  'theme.toDark': '切换到深色模式',
} as const
