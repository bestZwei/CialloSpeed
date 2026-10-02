/**
 * 首屏主题预置（防闪烁）：在 <head> 中同步执行，body 渲染前就把 data-theme 定好。
 * 抽成独立文件而非内联 <script>，站点才能启用不含 unsafe-inline 的 CSP。
 */
;(function () {
  var t
  try {
    t = localStorage.getItem('ciallospeed-theme')
  } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = 'dark'
  }
  document.documentElement.dataset.theme = t
})()
