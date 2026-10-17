export const num = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
};
export const pct = (r: number | null | undefined) => (r === null || r === undefined ? '—' : `${(r * 100).toFixed(r >= 0.995 ? 0 : 1)}%`);
export const duration = (sec: number) => {
  if (sec <= 0) return '已过期';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分` : `${Math.max(1, m)} 分钟`;
};
export const ago = (ts: number | null | undefined) => {
  if (!ts) return '从未';
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
};
