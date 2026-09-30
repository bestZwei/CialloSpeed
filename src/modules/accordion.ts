/**
 * FAQ 手风琴：无障碍（aria-expanded / aria-controls）+ 平滑高度动画
 */

export function initAccordion(root: HTMLElement | null = document.body): void {
  if (!root) return

  const items = root.querySelectorAll<HTMLElement>('.accordion-item')

  items.forEach((item) => {
    const trigger = item.querySelector<HTMLButtonElement>('.accordion-trigger')
    const panel = item.querySelector<HTMLElement>('.accordion-panel')
    if (!trigger || !panel) return

    const panelId = panel.id || `panel-${Math.random().toString(36).slice(2, 8)}`
    panel.id = panelId
    trigger.setAttribute('aria-controls', panelId)
    trigger.setAttribute('aria-expanded', 'false')

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open')

      // 收起其他已展开项（保持页面聚焦）
      items.forEach((other) => {
        if (other !== item && other.classList.contains('open')) {
          collapse(other)
        }
      })

      isOpen ? collapse(item) : expand(item)
    })
  })

  function expand(item: HTMLElement): void {
    const trigger = item.querySelector<HTMLButtonElement>('.accordion-trigger')
    const panel = item.querySelector<HTMLElement>('.accordion-panel')
    if (!trigger || !panel) return

    item.classList.add('open')
    trigger.setAttribute('aria-expanded', 'true')
    panel.style.maxHeight = `${panel.scrollHeight}px`
  }

  function collapse(item: HTMLElement): void {
    const trigger = item.querySelector<HTMLButtonElement>('.accordion-trigger')
    const panel = item.querySelector<HTMLElement>('.accordion-panel')
    if (!trigger || !panel) return

    item.classList.remove('open')
    trigger.setAttribute('aria-expanded', 'false')
    panel.style.maxHeight = ''
  }
}
