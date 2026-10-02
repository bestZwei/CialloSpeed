/**
 * 语言协商：浏览器为中文且没有手动偏好时，直接落到 /zh/。
 * 只在根路径的英文首页引入（/zh/ 变体不需要），抽成文件同样是为了 CSP。
 */
;(function () {
  var saved
  try {
    saved = localStorage.getItem('ciallospeed-locale')
  } catch (e) {}
  if (saved || location.pathname.indexOf('/zh') === 0) return
  var lang = (navigator.language || '').toLowerCase()
  if (lang.indexOf('zh') !== 0) return
  location.replace('/zh/')
})()
