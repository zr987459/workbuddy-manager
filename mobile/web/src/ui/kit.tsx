import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { toasts } from '../stores/toast'
import { IcX } from './icons'

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute'

const PILL: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-primary-soft text-primary',
  mute: 'bg-card-2 text-ink-2',
}

export function Pill({ tone = 'mute', dot, children }: { tone?: Tone; dot?: boolean; children: ComponentChildren }) {
  return (
    <span class={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${PILL[tone]}`}>
      {dot && <span class="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Card({ children, class: cls = '', onClick, style }: { children: ComponentChildren; class?: string; onClick?: () => void; style?: JSX.CSSProperties }) {
  return (
    <div class={`bg-card rounded-[22px] border border-line/60 ${onClick ? 'press cursor-pointer' : ''} ${cls}`} onClick={onClick} style={style}>
      {children}
    </div>
  )
}

export function Header({ title, sub, right }: { title: string; sub?: string; right?: ComponentChildren }) {
  return (
    <header class="pt-safe px-5 pb-3 flex items-end justify-between gap-3">
      <div class="min-w-0">
        {sub && <div class="text-[13px] text-ink-3 font-medium mb-0.5 truncate">{sub}</div>}
        <h1 class="text-[30px] leading-9 font-bold tracking-tight">{title}</h1>
      </div>
      <div class="flex items-center gap-2 shrink-0">{right}</div>
    </header>
  )
}

export function IconButton({ label, onClick, children, disabled }: { label: string; onClick?: () => void; children: ComponentChildren; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      class="press w-11 h-11 rounded-full bg-card border border-line/60 grid place-items-center text-ink-2 disabled:opacity-40">
      {children}
    </button>
  )
}

export function Button({ children, onClick, tone = 'primary', disabled, type = 'button', class: cls = '' }: {
  children: ComponentChildren; onClick?: () => void; tone?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; class?: string
}) {
  const t = tone === 'primary' ? 'bg-primary text-on-primary'
    : tone === 'danger' ? 'bg-bad-soft text-bad' : 'bg-card-2 text-ink'
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      class={`press h-12 px-5 rounded-2xl font-semibold text-[15px] inline-flex items-center justify-center gap-2 disabled:opacity-50 ${t} ${cls}`}>
      {children}
    </button>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      class={`relative w-[52px] h-8 rounded-full transition-colors shrink-0 disabled:opacity-50 ${checked ? 'bg-ok' : 'bg-card-2 border border-line'}`}>
      <span class={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[24px]' : 'left-1'}`} />
    </button>
  )
}

export function Skeleton({ h = 88, class: cls = '' }: { h?: number; class?: string }) {
  return <div class={`skeleton rounded-[22px] ${cls}`} style={{ height: h }} />
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ComponentChildren }) {
  return (
    <div class="text-center py-14 px-6">
      <div class="text-[17px] font-semibold">{title}</div>
      {hint && <div class="text-ink-3 text-[14px] mt-1.5">{hint}</div>}
      {action && <div class="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorBar({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div class="mx-5 mb-3 rounded-2xl bg-bad-soft text-bad px-4 py-3 text-[14px] flex items-center gap-3 anim-fade" role="alert">
      <span class="flex-1">{text}</span>
      {onRetry && <button class="font-semibold underline" onClick={onRetry}>重试</button>}
    </div>
  )
}

/** 底部弹层：手机上替代桌面端的 Dialog。点遮罩或下滑把手关闭。 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open])
  if (!open) return null
  let startY = 0
  return (
    <div class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50 anim-fade" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        class="absolute inset-x-0 bottom-0 bg-surface rounded-t-[28px] anim-sheet max-h-[88vh] flex flex-col outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
        <div class="pt-2.5 pb-1 grid place-items-center"
          onTouchStart={(e) => { startY = e.touches[0].clientY }}
          onTouchEnd={(e) => { if (e.changedTouches[0].clientY - startY > 60) onClose() }}>
          <span class="w-10 h-1.5 rounded-full bg-line" />
        </div>
        {title && (
          <div class="px-5 pt-1 pb-3 flex items-center justify-between">
            <h2 class="text-[19px] font-bold">{title}</h2>
            <button aria-label="关闭" class="press w-9 h-9 rounded-full bg-card-2 grid place-items-center text-ink-2" onClick={onClose}><IcX size={18} /></button>
          </div>
        )}
        <div class="overflow-y-auto px-5">{children}</div>
      </div>
    </div>
  )
}

export function ActionRow({ icon, label, onClick, tone }: { icon: ComponentChildren; label: string; onClick: () => void; tone?: 'bad' }) {
  return (
    <button type="button" onClick={onClick}
      class={`press w-full h-14 px-4 rounded-2xl bg-card flex items-center gap-3 text-[16px] font-medium mb-2 ${tone === 'bad' ? 'text-bad' : 'text-ink'}`}>
      <span class={tone === 'bad' ? 'text-bad' : 'text-ink-2'}>{icon}</span>{label}
    </button>
  )
}

export function Field({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return (
    <label class="block mb-4">
      <span class="block text-[13px] font-semibold text-ink-2 mb-1.5">{label}</span>
      {children}
      {hint && <span class="block text-[12px] text-ink-3 mt-1.5">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full h-12 px-4 rounded-2xl bg-card border border-line text-ink text-[16px] placeholder:text-ink-3 focus:border-primary outline-none'

export function Toasts() {
  return (
    <div class="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }} aria-live="polite">
      {toasts.value.map(t => (
        <div key={t.id} class={`anim-rise px-4 h-11 rounded-full glass border border-line/70 shadow-lg flex items-center text-[14px] font-semibold ${t.tone === 'ok' ? 'text-ok' : t.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿'
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万'
  return Number.isInteger(n) ? n.toLocaleString('zh-CN') : n.toFixed(2)
}

export function fmtDur(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return ''
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${Math.ceil(sec / 60)} 分钟`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时`
  return `${Math.floor(sec / 86400)} 天`
}

export function fmtAgo(ts: number | null | undefined): string {
  if (!ts) return '从未使用'
  const d = Date.now() / 1000 - ts
  if (d < 60) return '刚刚'
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`
  return `${Math.floor(d / 86400)} 天前`
}
