export const fmtInt = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('zh-CN', { notation: n >= 100000 ? 'compact' : 'standard' }).format(n);

export const fmtPct = (r: number | null | undefined) => (r == null ? '—' : `${(r * 100).toFixed(r >= 0.999 ? 0 : 1)}%`);

export function fmtDuration(sec: number) {
  if (sec <= 0) return '已过期';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分` : `${m} 分钟`;
}
