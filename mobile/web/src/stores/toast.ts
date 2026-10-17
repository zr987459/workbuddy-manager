import { signal } from '@preact/signals'

export type Toast = { id: number; text: string; tone: 'ok' | 'bad' | 'info' }
export const toasts = signal<Toast[]>([])
let seq = 0

export function toast(text: string, tone: Toast['tone'] = 'info') {
  const id = ++seq
  toasts.value = [...toasts.value.slice(-2), { id, text, tone }]
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 2600)
}

export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms) } catch { /* iOS Safari 无此 API */ }
}

export async function copyText(text: string, label = '已复制') {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } finally { ta.remove() }
  }
  haptic()
  toast(label, 'ok')
}
