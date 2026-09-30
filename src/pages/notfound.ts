import '../styles/main.css'
import { initThemeToggle } from '../modules/theme'
import { initLayout } from '../modules/layout'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
