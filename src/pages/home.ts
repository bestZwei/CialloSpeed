import '../styles/main.css'
import '../styles/pages/home.css'
import speedTargets from '../../config/speed-targets.json'
import { initThemeToggle } from '../modules/theme'
import { initLayout, initReveal } from '../modules/layout'
import { initIpInfo } from '../modules/ip-info'
import { initHistory, addRecord, type EngineId } from '../modules/history'
import { testState } from '../modules/test-state'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
initReveal()

/* ---------- 多引擎下拉选择器 ---------- */

/** 记住用户最后使用的引擎，跨页面/跨语言保持一致；失效（引擎已下架）时自动回退 */
const ENGINE_STORAGE_KEY = 'ciallospeed-engine'

/** SpeedMeter.dev 挂件样式参数（面板 id 约定为 panel-<engine>，地址清单见 config/speed-targets.json） */
const SM_PANEL = 'panel-sm'

const speedtestSection = document.getElementById('speedtest-app')
if (speedtestSection) {
  const select = speedtestSection.querySelector<HTMLElement>('.engine-select')
  const trigger = speedtestSection.querySelector<HTMLButtonElement>('#engine-trigger')
  const triggerLabel = speedtestSection.querySelector<HTMLElement>('.engine-trigger-label')
  const menu = speedtestSection.querySelector<HTMLElement>('#engine-menu')
  const options = Array.from(speedtestSection.querySelectorAll<HTMLElement>('.engine-option'))
  const panels = Array.from(speedtestSection.querySelectorAll<HTMLElement>('.engine-panel'))

  const findPanel = (id: string): HTMLElement | null =>
    speedtestSection.querySelector<HTMLElement>(`#${id}`)

  /** iframe 类挂件共用：加载 speedtest 模块并立即进入加载流程（用户切到该面板即为意图） */
  const mountWidget = async (widget: {
    engine: string
    src: string
    messageOrigin: string | null
  }): Promise<void> => {
    const panelId = `panel-${widget.engine}`
    const el = findPanel(panelId)
    if (!el) return
    const { initSpeedtest } = await import('../modules/speedtest')
    initSpeedtest(
      el,
      {
        src: widget.src,
        engineId: widget.engine as EngineId,
        ...(widget.messageOrigin ? { messageOrigin: widget.messageOrigin } : {}),
      },
      addRecord,
    )?.ensureLoaded()
    // SpeedMeter 挂件按站点配色反色显示：切主题时重载，让挂件按新的自然高度重新排版
    if (panelId === SM_PANEL) {
      const frame = el.querySelector<HTMLIFrameElement>('iframe')
      if (frame) {
        new MutationObserver(() => {
          if (!testState.running && frame.getAttribute('src') !== widget.src) {
            frame.src = widget.src
          }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      }
    }
  }

  /**
   * 面板 → 模块加载器。全部走动态 import：各引擎的测速 SDK（Cloudflare / NDT7 /
   * LibreSpeed / CDN）互不相关，打进同一个首屏 bundle 只会拖慢冷启动。
   */
  const loaders: Record<string, () => Promise<void>> = {
    'panel-cf': async () => {
      const el = findPanel('panel-cf')
      if (el) (await import('../modules/cloudflare-engine')).initCloudflareEngine(el, addRecord)
    },
    'panel-ndt': async () => {
      const el = findPanel('panel-ndt')
      if (el) (await import('../modules/ndt7-engine')).initNdt7Engine(el, addRecord)
    },
    'panel-ls': async () => {
      const el = findPanel('panel-ls')
      if (el) (await import('../modules/librespeed-engine')).initLibrespeedEngine(el, addRecord)
    },
    'panel-cdn': async () => {
      const el = findPanel('panel-cdn')
      if (el) (await import('../modules/cdn-engine')).initCdnEngine(el, addRecord)
    },
  }

  // 挂件类引擎：地址来自统一清单（见 config/speed-targets.json）
  for (const widget of speedTargets.widgets) {
    loaders[`panel-${widget.engine}`] = () => mountWidget(widget)
  }

  const loaded = new Set<string>()
  const activating = new Set<string>()

  /**
   * 首次激活才真正加载；失败不记入已加载，用户再次切回可重试。
   * activating 用于挡住同一帧内的重复调用 —— 恢复上次引擎时会先 selectOption 再触发
   * 初始激活，若只靠 loaded（异步才写入）会把同一个模块加载两遍，
   * 于是按钮绑上两个监听、用户一次点击变成两次测速请求。
   */
  const activate = (panelId: string): void => {
    const loader = loaders[panelId]
    if (!loader || loaded.has(panelId) || activating.has(panelId)) return
    activating.add(panelId)
    loader()
      .then(() => loaded.add(panelId))
      .catch((err) => console.error('[engine] 加载失败', panelId, err))
      .finally(() => activating.delete(panelId))
  }

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
    // 切走即作废上一轮测速：否则它会在不可见的面板里继续吃带宽并锁住其他引擎
    testState.stopActive()
    try {
      localStorage.setItem(ENGINE_STORAGE_KEY, opt.id)
    } catch {
      /* 隐私模式下忽略 */
    }
    closeMenu()
    if (opt.dataset.panel) activate(opt.dataset.panel)
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

  // 当前可见的面板（默认引擎或上面刚恢复出来的）在交互就绪后立即加载
  const initial = selectedOption().dataset.panel
  if (initial) activate(initial)
}

// 历史记录面板在测速区之后，空闲时加载即可
const historyPanel = document.getElementById('history-app')
if (historyPanel) initHistory(historyPanel)
