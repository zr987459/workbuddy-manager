import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, RefreshCw, Snowflake, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { copyText, haptic } from '../../lib/device';
import { fmtDuration } from '../../lib/format';
import type { AccountCard, Pill as PillT } from '../../lib/types';
import { Pill } from '../../ui/Pill';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { Empty, ErrorCard, Fab, PageHeader, Skeleton, btnGhost } from '../../ui/bits';
import { AddAccountSheet } from './AddAccountSheet';

type Payload = { accounts: AccountCard[]; pool_available: boolean; manageable: boolean; counts: Record<string, number> };
type Filter = 'all' | 'ok' | 'cooling' | 'bad';
const FILTERS: [Filter, string][] = [['all', '全部'], ['ok', '可用'], ['cooling', '冷却'], ['bad', '异常']];
const match = (f: Filter, p: PillT) =>
  f === 'all' || (f === 'ok' && p === 'ok') || (f === 'cooling' && (p === 'cooling' || p === 'offline')) ||
  (f === 'bad' && (p === 'expired' || p === 'error' || p === 'disabled'));

export function Accounts() {
  const q = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Payload>('/accounts'), refetchInterval: 15000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<AccountCard | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  // 乐观更新：开关立即反馈，失败回滚
  const toggle = useMutation({
    mutationFn: (a: { file: string; enabled: boolean }) => api.post(`/accounts/${encodeURIComponent(a.file)}/enabled`, { enabled: a.enabled }),
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<Payload>(['accounts']);
      qc.setQueryData<Payload>(['accounts'], (d) => d && ({ ...d, accounts: d.accounts.map((x) => x.file === a.file ? { ...x, enabled: a.enabled, pill: a.enabled ? 'ok' : 'disabled' } : x) }));
      haptic();
      return { prev };
    },
    onError: (e, _a, ctx) => { if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev); toast((e as Error).message, 'bad'); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const action = useMutation({
    mutationFn: ({ file, op }: { file: string; op: 'refresh' | 'clear-cooling' }) => api.post(`/accounts/${encodeURIComponent(file)}/${op}`),
    onSuccess: (_d, v) => { toast(v.op === 'refresh' ? 'Token 已刷新' : '已解除冷却', 'ok'); qc.invalidateQueries({ queryKey: ['accounts'] }); setDetail(null); },
    onError: (e) => toast((e as Error).message, 'bad'),
  });

  const list = useMemo(() => (q.data?.accounts ?? []).filter((a) => match(filter, a.pill)), [q.data, filter]);

  return (
    <div className="pb-tabbar">
      <PageHeader title="账号" subtitle={q.data ? `${q.data.counts.ok ?? 0} 可用 · 共 ${q.data.counts.total ?? 0}` : undefined} />
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`tap shrink-0 rounded-full px-4 py-2 text-sm font-medium ${filter === id ? 'bg-ink text-bg' : 'bg-surface text-ink-2 border border-line'}`}>{label}</button>
        ))}
      </div>
      <div className="space-y-3 px-4">
        {q.isError && <ErrorCard message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.isPending && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        {q.isSuccess && !list.length && <Empty icon={<Users />} title={filter === 'all' ? '还没有账号' : '没有符合条件的账号'} hint={filter === 'all' ? '点右下角 + 添加国际版账号' : undefined} />}
        {list.map((a) => (
          <div key={a.file} role="button" tabIndex={0} onClick={() => setDetail(a)} className="card tap flex items-center gap-3 p-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 text-lg font-semibold text-primary">{a.nickname.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="truncate font-medium">{a.nickname}</span>{a.realm === 'global' && <span className="text-[10px] text-ink-2">INTL</span>}</div>
              <div className="mt-1 flex items-center gap-2"><Pill kind={a.pill} />{a.in_flight > 0 && <span className="text-xs text-ink-2">在途 {a.in_flight}</span>}</div>
              {a.reason && a.pill !== 'ok' && <div className="mt-1 truncate text-xs text-ink-2">{a.reason}</div>}
            </div>
            <Switch checked={a.enabled} label={`启用 ${a.nickname}`} disabled={!q.data?.manageable}
              onChange={(v) => toggle.mutate({ file: a.file, enabled: v })} />
          </div>
        ))}
      </div>

      <Fab onClick={() => setAdding(true)} label="添加账号"><Plus size={26} /></Fab>
      <AddAccountSheet open={adding} onClose={() => setAdding(false)} />

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.nickname ?? ''}>
        {detail && (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Pill kind={detail.pill} />{detail.reason && <span className="text-sm text-ink-2">{detail.reason}</span>}</div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-surface-2 p-3"><dt className="text-xs text-ink-2">Token 剩余</dt><dd className="mt-1 font-medium">{fmtDuration(detail.token_remain_seconds)}</dd></div>
              <div className="rounded-2xl bg-surface-2 p-3"><dt className="text-xs text-ink-2">成功 / 失败</dt><dd className="mt-1 font-medium tabular-nums">{detail.success_count} / {detail.err_total}</dd></div>
            </dl>
            {detail.last_err && <p className="rounded-2xl bg-bad/10 p-3 text-xs text-bad">{detail.last_err}</p>}
            <button className={`${btnGhost} flex items-center justify-center gap-2`} onClick={async () => toast(await copyText(detail.uid) ? '已复制 UID' : '复制失败', 'ok')}><Copy size={18} />复制 UID</button>
            <button className={`${btnGhost} flex items-center justify-center gap-2`} disabled={action.isPending} onClick={() => action.mutate({ file: detail.file, op: 'refresh' })}><RefreshCw size={18} />刷新 Token</button>
            {detail.pill === 'cooling' && <button className={`${btnGhost} flex items-center justify-center gap-2`} disabled={action.isPending} onClick={() => action.mutate({ file: detail.file, op: 'clear-cooling' })}><Snowflake size={18} />解除冷却</button>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
