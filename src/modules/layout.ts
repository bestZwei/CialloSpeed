/**
 * 共享布局行为：导航高亮 / 移动端汉堡菜单 / 顶栏滚动态 / 滚动淡入 / 语言切换
 * （导航与页脚为静态 HTML，保证 SEO 与无 JS 可用；此模块只负责行为增强。）
 */

import { LOCALE_STORAGE_KEY, t } from '../i18n'
import { testState } from './test-state'

/** 初始化导航：当前页高亮、汉堡菜单、滚动毛玻璃边框 */
export function initLayout(): void {
  initActiveNav()
  initHamburger()
  initNavbarScroll()
  initLangSwitch()
}

/** 语言切换：跳转 href 由构建期填好，这里只记录用户偏好供下次协商 */
function initLangSwitch(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]').forEach((a) => {
    a.addEventListener('click', (e) => {
      // 切换语言是整页跳转，会中断进行中的测试且不写入历史 —— 先确认
      if (testState.running && !window.confirm(t('langSwitchConfirm'))) {
        e.preventDefault()
        return
      }
      const next = document.documentElement.lang === 'en' ? 'zh-CN' : 'en'
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next)
      } catch {
        /* 隐私模式下忽略 */
      }
    })
  })
}

/** 根据 body[data-page] 高亮当前导航项 */
function initActiveNav(): void {
  const page = document.body.dataset.page ?? ''
  document.querySelectorAll<HTMLAnchorElement>('.nav-links a[data-nav]').forEach((a) => {
    if (a.dataset.nav === page) {
      a.classList.add('active')
      a.setAttribute('aria-current', 'page')
    }
  })
}

function initHamburger(): void {
  const burger = document.getElementById('hamburger')
  const links = document.getElementById('nav-links')
  if (!burger || !links) return

  const setOpen = (open: boolean) => {
    links.classList.toggle('open', open)
    burger.classList.toggle('open', open)
    burger.setAttribute('aria-expanded', String(open))
  }

  burger.addEventListener('click', () => {
    setOpen(!links.classList.contains('open'))
  })

  // 点击链接后自动收起
  links.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false)
  })

  // Esc 收起
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false)
  })
}

function initNavbarScroll(): void {
  const navbar = document.querySelector<HTMLElement>('.navbar')
  if (!navbar) return

  const update = () => navbar.classList.toggle('scrolled', window.scrollY > 8)
  update()
  window.addEventListener('scroll', update, { passive: true })
}

/** 滚动淡入：.reveal 元素进入视口后加 .visible */
export function initReveal(): void {
  const els = document.querySelectorAll<HTMLElement>('.reveal')
  if (els.length === 0) return

  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('visible'))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          io.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  )

  els.forEach((el) => io.observe(el))
}
