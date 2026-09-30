/**
 * 访客网络信息（IP / 归属地 / 运营商）
 *
 * 隐私约定：默认不请求。只有用户点击「查看」才会向第三方 IP 库发请求，
 * 避免页面加载即把访客 IP 交给第三方；查到后写入 localStorage 偏好，
 * 下次访问会按用户上次的意愿自动展开或保持隐藏。
 *
 * 数据源：ipwho.is（免费、无需 Key、Access-Control-Allow-Origin: *）
 * 兜底  ：speed.cloudflare.com/cdn-cgi/trace（仅 IP / 国家码 / 接入机房）
 */

import { t } from '../i18n'

const API = 'https://ipwho.is/'
const TRACE_API = 'https://speed.cloudflare.com/cdn-cgi/trace'
const STORAGE_KEY = 'ciallospeed-ipinfo'
const TIMEOUT_MS = 6_000

interface IpInfo {
  ip: string
  place: string
  isp: string
}

function langParam(): string {
  return document.documentElement.lang === 'en' ? 'en' : 'zh-CN'
}

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** ipwho.is → 归属地取「国家 + 省/州 + 城市」三级，缺失自动跳过 */
function parseIpwho(data: unknown): IpInfo | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.success === false) return null
  const ip = typeof d.ip === 'string' ? d.ip : ''
  if (!ip) return null

  const parts = [d.country, d.region, d.city]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  // 国家名与省级重名时（如新加坡）只保留一级
  const place = parts.filter((v, i) => i === 0 || v !== parts[0]).join(' · ')

  const conn = (d.connection && typeof d.connection === 'object' ? d.connection : {}) as Record<string, unknown>
  const isp =
    (typeof conn.isp === 'string' && conn.isp.trim()) ||
    (typeof conn.org === 'string' && conn.org.trim()) ||
    t('ip.unknown')

  return { ip, place: place || t('ip.unknown'), isp }
}

/** Cloudflare trace 兜底：只有 IP + 国家码 + 接入机房 */
function parseTrace(text: string | null): IpInfo | null {
  if (!text) return null
  const map: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  if (!map.ip) return null
  const place = [map.loc, map.colo].filter(Boolean).join(' · ')
  return { ip: map.ip, place: place || t('ip.unknown'), isp: t('ip.unknown') }
}

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writePref(shown: boolean): void {
  try {
    if (shown) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 隐私模式下忽略 */
  }
}

function chip(label: string, value: string): string {
  return `<span class="ip-chip"><small>${label}</small>${value}</span>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

/** 初始化信息条：#ip-toggle 触发查询，#ip-result 展示结果 */
export function initIpInfo(root: HTMLElement): void {
  const toggle = root.querySelector<HTMLButtonElement>('#ip-toggle')
  const result = root.querySelector<HTMLElement>('#ip-result')
  if (!toggle || !result) return

  let loading = false
  let shown = false

  const render = (info: IpInfo): void => {
    result.innerHTML =
      chip(escapeHtml(t('ip.ip')), escapeHtml(info.ip)) +
      chip(escapeHtml(t('ip.place')), escapeHtml(info.place)) +
      chip(escapeHtml(t('ip.isp')), escapeHtml(info.isp))
    result.hidden = false
  }

  const load = async (): Promise<void> => {
    if (loading) return
    loading = true
    result.hidden = false
    result.innerHTML = `<span class="ip-chip ip-chip-muted">${escapeHtml(t('ip.loading'))}</span>`

    const info = parseIpwho(await fetchJson(`${API}?lang=${langParam()}`)) ?? parseTrace(await fetchText(TRACE_API))

    loading = false
    if (!info) {
      result.innerHTML =
        `<span class="ip-chip ip-chip-muted">${escapeHtml(t('ip.failed'))}</span>` +
        `<button class="btn btn-ghost btn-sm" type="button" id="ip-retry">${escapeHtml(t('ip.retry'))}</button>`
      result.querySelector('#ip-retry')?.addEventListener('click', () => void load())
      return
    }
    render(info)
  }

  const setShown = (next: boolean): void => {
    shown = next
    toggle.textContent = next ? t('ip.hide') : t('ip.view')
    toggle.setAttribute('aria-expanded', String(next))
    writePref(next)
    if (!next) {
      result.hidden = true
      result.innerHTML = ''
    }
  }

  toggle.addEventListener('click', () => {
    setShown(!shown)
    if (shown && !result.innerHTML) void load()
    else if (shown) result.hidden = false
  })

  setShown(readPref())
  if (shown) void load()
}
