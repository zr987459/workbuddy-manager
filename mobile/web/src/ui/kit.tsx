import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import type {Pill as PillT} from '../lib/types';

/* ── 状态胶囊 ───────────────────────────── */
const PILL_LABEL: Record<PillT, string> = {
  ok: '可用', busy: '忙碌', cooling: '冷却', paused: '已停用',
  expired: '已过期', banned: '需重登', invalid: '未加载', offline: '离线',
};
export function Pill({kind, label}: {kind: PillT | 'degraded' | 'down'; label?: string}) {
  const text = label ?? (PILL_LABEL as Record<string, string>)[kind] ?? kind;
  return <span className={`pill pill-${kind}`}><i />{text}</span>;
}

/* ── 开关 ───────────────────────────────── */
export function Switch({on, onChange, disabled, label}: {on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`switch ${on ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      <span />
    </button>
  );
}

/* ── 分段控件 ───────────────────────────── */
export function Segmented<T extends string>({value, options, onChange}: {value: T; options: {value: T; label: string; badge?: number}[]; onChange: (v: T) => void}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.badge ? <b>{o.badge}</b> : null}
        </button>
      ))}
    </div>
  );
}

/* ── 底部抽屉（下拉关闭） ───────────────── */
export function Sheet({open, onClose, title, children, footer}: {open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode}) {
  const [dy, setDy] = useState(0);
  const y0 = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-root" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}
        style={{transform: dy ? `translateY(${dy}px)` : undefined, transition: dy ? 'none' : undefined}}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab"
          onTouchStart={(e) => { y0.current = e.touches[0].clientY; }}
          onTouchMove={(e) => { if (y0.current !== null) setDy(Math.max(0, e.touches[0].clientY - y0.current)); }}
          onTouchEnd={() => { if (dy > 110) onClose(); setDy(0); y0.current = null; }}>
          <span />
        </div>
        {title && <h2 className="sheet-title">{title}</h2>}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Toast ─────────────────────────────── */
type ToastT = {id: number; text: string; tone: 'ok' | 'err' | 'info'};
const ToastCtx = createContext<(text: string, tone?: ToastT['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({children}: {children: ReactNode}) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: ToastT['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), {id, text, tone}]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ── 状态诚实：加载 / 失败 / 空 ───────────── */
export const Skeleton = ({h = 76, n = 3}: {h?: number; n?: number}) => (
  <>{Array.from({length: n}, (_, i) => <div key={i} className="skeleton" style={{height: h}} />)}</>
);
export function ErrorBanner({message, onRetry}: {message: string; onRetry?: () => void}) {
  return (
    <div className="banner banner-err" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn-text" onClick={onRetry}>重试</button>}
    </div>
  );
}
export function Empty({title, hint, action}: {title: string; hint?: string; action?: ReactNode}) {
  return <div className="empty"><h3>{title}</h3>{hint && <p>{hint}</p>}{action}</div>;
}

export function Header({title, sub, right}: {title: string; sub?: ReactNode; right?: ReactNode}) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {right}
    </header>
  );
}

export function Fab({onClick, label, icon}: {onClick: () => void; label: string; icon: ReactNode}) {
  return <button className="fab" onClick={onClick} aria-label={label}>{icon}<span>{label}</span></button>;
}
