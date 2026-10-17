import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="glass sticky top-0 z-30 flex items-end justify-between border-b border-line px-5 pb-3 pt-safe">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold tabular-nums leading-tight ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-ink-2">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-card)] bg-surface-2 ${className}`} />;
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex items-start gap-3 p-4 text-sm">
      <AlertTriangle className="mt-0.5 shrink-0 text-bad" size={18} />
      <div className="flex-1 break-words">{message}</div>
      {onRetry && <button className="tap grid size-8 place-items-center rounded-full bg-surface-2" onClick={onRetry} aria-label="重试"><RotateCw size={16} /></button>}
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center text-ink-2">
      <div className="mb-1 grid size-14 place-items-center rounded-full bg-surface-2">{icon}</div>
      <div className="font-medium text-ink">{title}</div>
      {hint && <div className="text-sm">{hint}</div>}
    </div>
  );
}

export function Fab({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label}
      className="tap fixed right-5 z-30 grid size-14 place-items-center rounded-2xl bg-primary text-on-primary shadow-xl shadow-primary/30"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}>
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-2">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 outline-none focus:border-primary';
export const btnPrimary = 'tap w-full rounded-2xl bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-50';
export const btnGhost = 'tap w-full rounded-2xl bg-surface-2 py-3.5 font-medium';
