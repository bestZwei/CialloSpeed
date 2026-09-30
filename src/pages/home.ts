import '../styles/main.css'
import '../styles/pages/home.css'
import { initThemeToggle } from '../modules/theme'
import { initLayout, initReveal } from '../modules/layout'
import { initSpeedtest } from '../modules/speedtest'
import { initHistory, addRecord } from '../modules/history'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
initReveal()

const speedtestSection = document.getElementById('speedtest-app')
if (speedtestSection) initSpeedtest(speedtestSection, addRecord)

const historyPanel = document.getElementById('history-app')
if (historyPanel) initHistory(historyPanel)
