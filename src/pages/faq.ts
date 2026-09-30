import '../styles/main.css'
import '../styles/pages/article.css'
import { initThemeToggle } from '../modules/theme'
import { initLayout, initReveal } from '../modules/layout'
import { initAccordion } from '../modules/accordion'

initLayout()
initThemeToggle(document.getElementById('theme-toggle') as HTMLButtonElement | null)
initReveal()
initAccordion(document.getElementById('faq-accordion'))
