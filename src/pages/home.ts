import '../styles/main.css'
import '../styles/pages/home.css'
import { initThemeToggle } from '../modules/theme'
import { initLayout, initReveal } from '../modules/layout'
import { initSpeedtest, type SpeedtestHandle } from '../modules/speedtest'
import { initCloudflareEngine } from '../modules/cloudflare-engine'
import { initNdt7Engine } from '../modules/ndt7-engine'
import { initLibrespeedEngine } from '../modules/librespeed-engine'
import { initIpInfo } from '../modules/ip-info'
import { initHistory, addRecord } from '../modules/history'
import { testState } from '../modules/test-state'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
initReveal()

/* ---------- 多引擎下拉选择器 ---------- */

/** 记住用户最后使用的引擎，跨页面/跨语言保持一致；失效（引擎已下架）时自动回退 */
const ENGINE_STORAGE_KEY = 'ciallospeed-engine'

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

  let smHandle: SpeedtestHandle | null = null
  const smSection = speedtestSection.querySelector<HTMLElement>('#panel-sm')
  if (smSection) {
    // 挂件始终用浅色 minimal 主题 + 只留表盘区；暗色站点下用 CSS 反色转成暗色
    // iframe 取内容自然高度，在统一高度的容器内垂直居中
    const smWidgetSrc = () => 'https://speedmeter.dev/widget.html?theme=minimal&hideMetrics=true'
    smHandle = initSpeedtest(smSection, addRecord, {
      src: smWidgetSrc(),
      messageOrigin: 'speedmeter.dev',
      engineId: 'sm',
    })
    // 主题切换时热更新挂件配色（测速进行中不打断）
    new MutationObserver(() => {
      const frame = smSection.querySelector<HTMLIFrameElement>('iframe')
      if (!frame) return
      const target = smWidgetSrc()
      if (!testState.running && !frame.src.endsWith(target)) frame.src = target
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }

  let mnHandle: SpeedtestHandle | null = null
  const mnSection = speedtestSection.querySelector<HTMLElement>('#panel-mn')
  if (mnSection) {
    mnHandle = initSpeedtest(mnSection, addRecord, {
      src: 'https://www.metercustom.net/plugin/',
      engineId: 'mn',
    })
  }

  const cfSection = speedtestSection.querySelector<HTMLElement>('#panel-cf')
  if (cfSection) initCloudflareEngine(cfSection, addRecord)

  const ndtSection = speedtestSection.querySelector<HTMLElement>('#panel-ndt')
  if (ndtSection) initNdt7Engine(ndtSection, addRecord)

  const lsSection = speedtestSection.querySelector<HTMLElement>('#panel-ls')
  if (lsSection) initLibrespeedEngine(lsSection, addRecord)

  // 访客 IP 信息：默认收起，仅用户点击后才向第三方 IP 库发请求
  initIpInfo(speedtestSection)

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
    try {
      localStorage.setItem(ENGINE_STORAGE_KEY, opt.id)
    } catch {
      /* 隐私模式下忽略 */
    }
    closeMenu()
    // iframe 类引擎首次切换才加载，避免多引擎同时抢带宽
    if (opt.id === 'tab-ost') ostHandle?.ensureLoaded()
    if (opt.id === 'tab-sm') smHandle?.ensureLoaded()
    if (opt.id === 'tab-mn') mnHandle?.ensureLoaded()
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

    // 恢复上次使用的引擎：跨语言、跨页面保持一致（记录失效时保持默认 Cloudflare）
    let saved: string | null = null
    try {
      saved = localStorage.getItem(ENGINE_STORAGE_KEY)
    } catch {
      /* 隐私模式下忽略 */
    }
    const savedOpt = saved ? options.find((o) => o.id === saved) : undefined
    if (savedOpt && savedOpt !== selectedOption()) selectOption(savedOpt)
  }
}

const historyPanel = document.getElementById('history-app')
if (historyPanel) initHistory(historyPanel)
