import '../styles/main.css'
import '../styles/pages/home.css'
import { initThemeToggle } from '../modules/theme'
import { initLayout, initReveal } from '../modules/layout'
import { initSpeedtest, type SpeedtestHandle } from '../modules/speedtest'
import { initCloudflareEngine } from '../modules/cloudflare-engine'
import { initNdt7Engine } from '../modules/ndt7-engine'
import { initHistory, addRecord } from '../modules/history'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
initReveal()

/* ---------- 多引擎下拉选择器 ---------- */

const speedtestSection = document.getElementById('speedtest-app')
if (speedtestSection) {
  const select = speedtestSection.querySelector<HTMLElement>('.engine-select')
  const trigger = speedtestSection.querySelector<HTMLButtonElement>('#engine-trigger')
  const triggerLabel = speedtestSection.querySelector<HTMLElement>('.engine-trigger-label')
  const menu = speedtestSection.querySelector<HTMLElement>('#engine-menu')
  const options = Array.from(speedtestSection.querySelectorAll<HTMLElement>('.engine-option'))
  const panels = Array.from(speedtestSection.querySelectorAll<HTMLElement>('.engine-panel'))

  let ostHandle: SpeedtestHandle | null = null
  const ostSection = speedtestSection.querySelector<HTMLElement>('#panel-ost')
  if (ostSection) ostHandle = initSpeedtest(ostSection, addRecord)

  const cfSection = speedtestSection.querySelector<HTMLElement>('#panel-cf')
  if (cfSection) initCloudflareEngine(cfSection, addRecord)

  const ndtSection = speedtestSection.querySelector<HTMLElement>('#panel-ndt')
  if (ndtSection) initNdt7Engine(ndtSection, addRecord)

  const selectedOption = () =>
    options.find((o) => o.getAttribute('aria-selected') === 'true') ?? options[0]

  /** 初始同步：触发器显示当前选中引擎（与菜单文案保持一致，含运行时语言切换后的状态） */
  const syncTriggerFrom = (opt: HTMLElement) => {
    const label = opt.querySelector<HTMLElement>('.engine-option-label')
    if (triggerLabel && label) triggerLabel.innerHTML = label.innerHTML
  }
  syncTriggerFrom(selectedOption())

  const isOpen = () => menu !== null && !menu.hidden

  const openMenu = () => {
    if (!menu || !trigger) return
    menu.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    selectedOption()?.focus()
  }

  const closeMenu = (focusTrigger = false) => {
    if (!menu || !trigger) return
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    if (focusTrigger) trigger.focus()
  }

  const selectOption = (opt: HTMLElement) => {
    for (const o of options) {
      const active = o === opt
      o.classList.toggle('is-active', active)
      o.setAttribute('aria-selected', String(active))
    }
    for (const p of panels) p.toggleAttribute('hidden', p.id !== opt.dataset.panel)
    // 触发器同步显示当前引擎（名称 + 副标题）
    syncTriggerFrom(opt)
    closeMenu()
    // iframe 类引擎首次切换才加载，避免多引擎同时抢带宽
    if (opt.id === 'tab-ost') ostHandle?.ensureLoaded()
  }

  if (select && trigger && menu && options.length && panels.length) {
    trigger.addEventListener('click', () => (isOpen() ? closeMenu() : openMenu()))
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu()
      }
    })

    for (const opt of options) {
      opt.addEventListener('click', () => selectOption(opt))
    }

    menu.addEventListener('keydown', (e) => {
      const current = document.activeElement as HTMLElement | null
      const idx = current ? options.indexOf(current) : -1
      if (e.key === 'Escape') {
        closeMenu(true)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        options[(idx + 1 + options.length) % options.length]?.focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        options[(idx - 1 + options.length) % options.length]?.focus()
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (current) selectOption(current)
      } else if (e.key === 'Tab') {
        closeMenu()
      }
    })

    document.addEventListener('click', (e) => {
      if (isOpen() && !select.contains(e.target as Node)) closeMenu()
    })
  }
}

const historyPanel = document.getElementById('history-app')
if (historyPanel) initHistory(historyPanel)
