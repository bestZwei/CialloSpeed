import '../styles/main.css'
import '../styles/pages/article.css'
import { initThemeToggle } from '../modules/theme'
import { initLayout, initReveal } from '../modules/layout'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
initReveal()
