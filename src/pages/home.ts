import '../styles/main.css'
import '../styles/pages/home.css'
import { initThemeToggle } from '../modules/theme'
import { initLayout, initReveal } from '../modules/layout'
import { initSpeedtest, type SpeedtestHandle } from '../modules/speedtest'
import { initCloudflareEngine } from '../modules/cloudflare-engine'
import { initHistory, addRecord } from '../modules/history'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
initReveal()

/* ---------- 双引擎 Tab 切换 ---------- */

const speedtestSection = document.getElementById('speedtest-app')
if (speedtestSection) {
  const tabs = Array.from(speedtestSection.querySelectorAll<HTMLButtonElement>('.engine-tab'))
  const panels = Array.from(speedtestSection.querySelectorAll<HTMLElement>('.engine-panel'))

  let ostHandle: SpeedtestHandle | null = null
  const ostSection = speedtestSection.querySelector<HTMLElement>('#panel-ost')
  if (ostSection) ostHandle = initSpeedtest(ostSection, addRecord)

  const cfSection = speedtestSection.querySelector<HTMLElement>('#panel-cf')
  if (cfSection) initCloudflareEngine(cfSection, addRecord)

  const selectTab = (tab: HTMLButtonElement) => {
    const index = tabs.indexOf(tab)
    if (index < 0) return
    for (let i = 0; i < tabs.length; i++) {
      const active = i === index
      tabs[i].classList.toggle('is-active', active)
      tabs[i].setAttribute('aria-selected', String(active))
      tabs[i].tabIndex = active ? 0 : -1
      panels[i]?.toggleAttribute('hidden', !active)
    }
    // OpenSpeedTest 引擎首次切换才加载 iframe，避免双引擎同时抢带宽
    if (tabs[index].id === 'tab-ost') ostHandle?.ensureLoaded()
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab))
    tab.addEventListener('keydown', (e) => {
      const index = tabs.indexOf(tab)
      if (e.key === 'ArrowRight') selectTab(tabs[(index + 1) % tabs.length])
      else if (e.key === 'ArrowLeft') selectTab(tabs[(index - 1 + tabs.length) % tabs.length])
      else return
      e.preventDefault()
      tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.focus()
    })
  }
}

const historyPanel = document.getElementById('history-app')
if (historyPanel) initHistory(historyPanel)
