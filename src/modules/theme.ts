/**
 * 主题切换：localStorage 持久化；默认暗色（对齐 LibreTV 风格）。
 * 首屏主题由各 HTML <head> 中的内联脚本提前设置，避免闪烁（FOUC）。
 */

const THEME_KEY = 'ciallospeed-theme'

export type Theme = 'dark' | 'light'

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

function applyTheme(theme: Theme, btn: HTMLButtonElement | null): void {
  document.documentElement.dataset.theme = theme
  if (btn) {
    btn.setAttribute(
      'aria-label',
      theme === 'dark' ? '切换到浅色模式' : '切换到深色模式',
    )
  }
}

export function initThemeToggle(btn: HTMLButtonElement | null): void {
  if (!btn) return

  applyTheme(currentTheme(), btn)

  btn.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* 隐私模式下忽略 */
    }
    applyTheme(next, btn)
  })
}
