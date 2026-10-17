import { signal } from '@preact/signals'

export type Tab = 'dash' | 'accounts' | 'keys' | 'chat'
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const PATHS: Record<Tab, string> = { dash: '/', accounts: '/accounts', keys: '/keys', chat: '/chat' }

function fromPath(p: string): Tab {
  const rest = p.startsWith(BASE) ? p.slice(BASE.length) : p
  const hit = (Object.keys(PATHS) as Tab[]).find(t => PATHS[t] !== '/' && rest.startsWith(PATHS[t]))
  return hit || 'dash'
}

export const tab = signal<Tab>(fromPath(location.pathname))

export function go(t: Tab) {
  if (t === tab.value) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
  history.pushState(null, '', BASE + PATHS[t])
  tab.value = t
  window.scrollTo({ top: 0 })
}

window.addEventListener('popstate', () => { tab.value = fromPath(location.pathname) })

/** 软键盘弹起时隐藏底栏，把空间让给输入框（由对话页根据 visualViewport 设置） */
export const keyboardOpen = signal(false)
