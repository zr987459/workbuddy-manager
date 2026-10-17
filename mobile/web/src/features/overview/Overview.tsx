import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, RotateCw, Server } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtInt, fmtPct } from '../../lib/format';
import type { Overview as O } from '../../lib/types';
import { ErrorCard, PageHeader, Skeleton, StatTile } from '../../ui/bits';

// 页面可见时用 SSE 增量推送；隐藏就断开，回来再连（省电、不推旧数据）
function useLive(enabled: boolean) {
  const qc = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    const open = () => {
      if (es || document.hidden) return;
      es = new EventSource('/m/api/live');
      es.addEventListener('overview', (e) => { qc.setQueryData(['overview'], JSON.parse((e as MessageEvent).data)); setLive(true); });
      es.onerror = () => { setLive(false); };
    };
    const close = () => { es?.close(); es = null; setLive(false); };
    const onVis = () => (document.hidden ? close() : open());
    open();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); close(); };
  }, [enabled, qc]);
  return live;
}

const STATE: Record<O['state'], [string, string]> = {
  ok: ['运行中', 'from-ok/25 text-ok'],
  degraded: ['降级', 'from-warn/25 text-warn'],
  down: ['不可用', 'from-bad/25 text-bad'],
};

export function Overview({ onOpenAccounts, onLogout }: { onOpenAccounts: () => void; onLogout: () => void }) {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api.get<O>('/overview') });
  const live = useLive(q.isSuccess);
  const o = q.data;

  return (
    <div className="pb-tabbar">
      <PageHeader title="概览" subtitle={live ? '实时' : q.isFetching ? '刷新中…' : undefined}
        action={<div className="flex gap-2">
          <button className="tap grid size-10 place-items-center rounded-full bg-surface-2" onClick={() => q.refetch()} aria-label="刷新"><RotateCw size={18} className={q.isFetching ? 'animate-spin' : ''} /></button>
          <button className="tap grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2" onClick={onLogout} aria-label="退出登录"><LogOut size={17} /></button>
        </div>} />
      <div className="space-y-3 p-4">
        {q.isError && <ErrorCard message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {!o && q.isPending && <><Skeleton className="h-28" /><div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div></>}
        {o && (
          <>
            <section className={`card overflow-hidden bg-linear-to-br ${STATE[o.state][1].split(' ')[0]} to-transparent p-5`}>
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-surface"><Server size={22} /></div>
                <div className="flex-1">
                  <div className="text-sm text-ink-2">网关状态</div>
                  <div className={`text-2xl font-bold ${STATE[o.state][1].split(' ')[1]}`}>{STATE[o.state][0]}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-surface px-2.5 py-1">Manager {o.gateway.core ? '在线' : '离线'}</span>
                <span className="rounded-full bg-surface px-2.5 py-1">上游 {o.gateway.upstream == null ? '未知' : o.gateway.upstream ? '已连接' : '未连接'}</span>
              </div>
              {o.gateway.detail && <p className="mt-2 text-xs text-ink-2">{o.gateway.detail}</p>}
            </section>

            <div className="grid grid-cols-2 gap-3">
              <StatTile label="在途连接" value={fmtInt(o.inflight)} hint="各账号 in_flight 之和" />
              <StatTile label="今日请求" value={fmtInt(o.today?.requests)} hint={o.today ? `失败 ${o.today.failed}` : '统计不可用'} />
              <StatTile label="今日 Token" value={fmtInt(o.today?.tokens)} hint={o.today?.top_model ? `最多：${o.today.top_model}` : undefined} />
              <StatTile label="成功率" value={fmtPct(o.today?.success_rate)}
                tone={o.today?.success_rate == null ? undefined : o.today.success_rate >= 0.95 ? 'ok' : o.today.success_rate >= 0.8 ? 'warn' : 'bad'} />
            </div>

            {o.pool && (
              <button className="card tap block w-full p-4 text-left" onClick={onOpenAccounts}>
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="font-medium">账号池</span>
                  <span className="text-sm text-ink-2">共 {o.pool.total} 个</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                  {(['ok', 'cooling', 'offline', 'disabled', 'expired', 'error'] as const).map((k) =>
                    o.pool![k] ? <div key={k} style={{ flexGrow: o.pool![k] }} className={{ ok: 'bg-ok', cooling: 'bg-warn', offline: 'bg-warn/60', disabled: 'bg-mute', expired: 'bg-bad', error: 'bg-bad/70' }[k]} /> : null)}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-ink-2">
                  <div><b className="block text-base text-ok">{o.pool.ok}</b>可用</div>
                  <div><b className="block text-base text-warn">{o.pool.cooling + o.pool.offline}</b>冷却</div>
                  <div><b className="block text-base text-mute">{o.pool.disabled}</b>停用</div>
                  <div><b className="block text-base text-bad">{o.pool.expired + o.pool.error}</b>异常</div>
                </div>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
