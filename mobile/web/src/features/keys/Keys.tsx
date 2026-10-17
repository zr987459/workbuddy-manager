import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { copyText, haptic } from '../../lib/device';
import { fmtInt } from '../../lib/format';
import type { KeyCard, ModelInfo } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { Empty, ErrorCard, Fab, Field, PageHeader, Skeleton, btnGhost, btnPrimary, inputCls } from '../../ui/bits';

function ModelChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const q = useQuery({ queryKey: ['models', 'global'], queryFn: () => api.get<{ models: ModelInfo[] }>('/keys/models'), staleTime: 300_000 });
  const [kw, setKw] = useState('');
  const models = (q.data?.models ?? []).filter((m) => !kw || m.id.toLowerCase().includes(kw.toLowerCase()) || m.name.toLowerCase().includes(kw.toLowerCase()));
  const all = value.length === 0;
  return (
    <div>
      <input className={`${inputCls} mb-2`} placeholder="搜索模型" value={kw} onChange={(e) => setKw(e.target.value)} />
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        <button type="button" onClick={() => onChange([])} className={`tap rounded-full px-3 py-1.5 text-sm ${all ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}>全部模型</button>
        {models.map((m) => {
          const on = value.includes(m.id);
          return <button type="button" key={m.id} onClick={() => onChange(on ? value.filter((x) => x !== m.id) : [...value, m.id])}
            className={`tap rounded-full px-3 py-1.5 text-sm ${on ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}>{m.name}</button>;
        })}
        {q.isPending && <span className="text-sm text-ink-2">加载模型…</span>}
        {q.isError && <span className="text-sm text-bad">模型清单暂时不可用，可留空表示全部</span>}
      </div>
    </div>
  );
}

function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [quota, setQuota] = useState('');
  const [created, setCreated] = useState<KeyCard | null>(null);
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.post<KeyCard>('/keys', { name: name.trim(), models, quota: Number(quota) || 0 }),
    onSuccess: async (k) => {
      setCreated(k); qc.invalidateQueries({ queryKey: ['keys'] });
      if (k.secret && await copyText(k.secret)) { setCopied(true); toast('已生成并复制', 'ok'); }
    },
    onError: (e) => toast((e as Error).message, 'bad'),
  });
  const close = () => { setName(''); setModels([]); setQuota(''); setCreated(null); setCopied(false); onClose(); };
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ gateway_url: string }>('/settings'), staleTime: Infinity });
  const base = settings.data?.gateway_url ?? '';

  return (
    <Sheet open={open} onClose={close} title={created ? '密钥已生成' : '生成密钥'}>
      {!created ? (
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="名称"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：iPhone 上的 Cherry Studio" maxLength={64} required autoFocus /></Field>
          <Field label="模型授权" hint="不选即允许全部模型"><ModelChips value={models} onChange={setModels} /></Field>
          <Field label="Token 额度" hint="留空表示不限"><input className={inputCls} inputMode="numeric" pattern="[0-9]*" value={quota} onChange={(e) => setQuota(e.target.value.replace(/\D/g, ''))} placeholder="不限" /></Field>
          <button className={btnPrimary} disabled={!name.trim() || m.isPending}>{m.isPending ? '生成中…' : '生成并复制'}</button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">明文只显示这一次，关闭后无法再查看，请立即保存。</p>
          <div className="break-all rounded-2xl bg-surface-2 p-4 font-mono text-sm">{created.secret}</div>
          <button className={`${btnPrimary} flex items-center justify-center gap-2`} onClick={async () => { if (created.secret && await copyText(created.secret)) { setCopied(true); toast('已复制', 'ok'); } }}>
            {copied ? <Check size={18} /> : <Copy size={18} />}{copied ? '已复制' : '复制密钥'}
          </button>
          <button className={`${btnGhost} flex items-center justify-center gap-2`} onClick={async () => {
            const cfg = `curl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${created.secret}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${created.models[0] ?? 'MODEL'}","messages":[{"role":"user","content":"hi"}]}'`;
            if (await copyText(cfg)) toast('已复制 curl 示例', 'ok');
          }}><Copy size={18} />复制为 curl</button>
          <button className={btnGhost} onClick={close}>我已保存</button>
        </div>
      )}
    </Sheet>
  );
}

export function Keys() {
  const q = useQuery({ queryKey: ['keys'], queryFn: () => api.get<{ keys: KeyCard[] }>('/keys') });
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<KeyCard | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const qc = useQueryClient();
  const toast = useToast();

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<KeyCard> }) => api.patch(`/keys/${id}`, body),
    onMutate: ({ id, body }) => {
      haptic();
      const prev = qc.getQueryData<{ keys: KeyCard[] }>(['keys']);
      qc.setQueryData<{ keys: KeyCard[] }>(['keys'], (d) => d && ({ keys: d.keys.map((k) => k.id === id ? { ...k, ...body } : k) }));
      return { prev };
    },
    onError: (e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['keys'], ctx.prev); toast((e as Error).message, 'bad'); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['keys'] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/keys/${id}`),
    onSuccess: () => { toast('已删除', 'ok'); setEdit(null); qc.invalidateQueries({ queryKey: ['keys'] }); },
    onError: (e) => toast((e as Error).message, 'bad'),
  });

  return (
    <div className="pb-tabbar">
      <PageHeader title="密钥" subtitle={q.data ? `${q.data.keys.filter((k) => k.enabled).length} 个启用` : undefined} />
      <div className="space-y-3 p-4">
        {q.isError && <ErrorCard message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.isPending && [0, 1].map((i) => <Skeleton key={i} className="h-28" />)}
        {q.isSuccess && !q.data.keys.length && <Empty icon={<KeyRound />} title="还没有密钥" hint="点右下角 + 一键生成" />}
        {q.data?.keys.map((k) => (
          <div key={k.id} role="button" tabIndex={0} onClick={() => { setEdit(k); setModels(k.models); }} className="card tap p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{k.name}</div>
                <div className="mt-0.5 font-mono text-xs text-ink-2">{k.prefix}••••</div>
              </div>
              <Switch checked={k.enabled} label={`启用 ${k.name}`} onChange={(v) => patch.mutate({ id: k.id, body: { enabled: v } })} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {k.models.length ? k.models.slice(0, 4).map((m) => <span key={m} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px]">{m.replace(/^global:/, '')}</span>)
                : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px]">全部模型</span>}
              {k.models.length > 4 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px]">+{k.models.length - 4}</span>}
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-ink-2"><span>已用 {fmtInt(k.used_tokens)} tokens</span><span>{k.quota ? `额度 ${fmtInt(k.quota)}` : '不限额'}</span></div>
              {k.usage_ratio != null && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full ${k.usage_ratio > 0.9 ? 'bg-bad' : 'bg-primary'}`} style={{ width: `${k.usage_ratio * 100}%` }} /></div>}
            </div>
          </div>
        ))}
      </div>
      <Fab onClick={() => setCreating(true)} label="生成密钥"><Plus size={26} /></Fab>
      <CreateSheet open={creating} onClose={() => setCreating(false)} />

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ''}>
        {edit && (
          <div className="space-y-4">
            <p className="text-xs text-ink-2">出于安全，已生成的密钥只显示前缀；忘记了请删除后重新生成。</p>
            <Field label="模型授权" hint="不选即允许全部模型"><ModelChips value={models} onChange={setModels} /></Field>
            <button className={btnPrimary} disabled={patch.isPending} onClick={() => patch.mutate({ id: edit.id, body: { models } }, { onSuccess: () => { toast('已保存', 'ok'); setEdit(null); } })}>保存</button>
            <button className={`${btnGhost} flex items-center justify-center gap-2 text-bad`} disabled={del.isPending}
              onClick={() => { if (window.confirm(`删除密钥「${edit.name}」？使用它的客户端会立即失效。`)) del.mutate(edit.id); }}>
              <Trash2 size={18} />删除密钥
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
