import type { Pill as PillT } from '../lib/types';

const MAP: Record<PillT, [string, string]> = {
  ok: ['可用', 'bg-ok/15 text-ok'],
  cooling: ['冷却', 'bg-warn/15 text-warn'],
  disabled: ['已停用', 'bg-mute/15 text-mute'],
  expired: ['已过期', 'bg-bad/15 text-bad'],
  error: ['异常', 'bg-bad/15 text-bad'],
  offline: ['未入池', 'bg-warn/15 text-warn'],
};

export function Pill({ kind, label }: { kind: PillT; label?: string }) {
  const [text, cls] = MAP[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <span className="size-1.5 rounded-full bg-current" />{label ?? text}
    </span>
  );
}
