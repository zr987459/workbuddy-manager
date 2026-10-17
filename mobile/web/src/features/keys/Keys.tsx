import {useMemo, useState} from 'react';
import {api} from '../../lib/api';
import {copy, haptic} from '../../lib/device';
import {ago, num} from '../../lib/format';
import {useAsync, usePullToRefresh} from '../../lib/hooks';
import type {KeyCard, ModelInfo} from '../../lib/types';
import {Empty, ErrorBanner, Fab, Header, Sheet, Skeleton, Switch, useToast} from '../../ui/kit';
import {IconCopy, IconPlus} from '../../ui/Icons';

export default function Keys() {
  const list = useAsync(() => api.keys());
  const models = useAsync(() => api.models().then((r) => r.models));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<KeyCard | null>(null);
  const [created, setCreated] = useState<{key: string; base: string} | null>(null);
  const toast = useToast();
  const {ref, pull} = usePullToRefresh(list.reload);

  const toggle = async (k: KeyCard, enabled: boolean) => {
    haptic();
    const prev = list.data;
    if (prev) list.set({...prev, items: prev.items.map((x) => x.id === k.id ? {...x, enabled} : x)});
    try { await api.updateKey(k.id, {enabled}); }
    catch (e) { if (prev) list.set(prev); toast((e as Error).message, 'err'); }
  };

  return (
    <div className="page" ref={ref}>
      <div className="ptr" style={{height: pull}} />
      <Header title="密钥" sub={list.data ? `${list.data.enabled} 个启用 · 共 ${list.data.total}` : undefined} />
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton h={88} n={3} />}
      {list.data?.items.length === 0 && <Empty title="还没有密钥" hint="生成一个，即可在任意 OpenAI / Anthropic 兼容客户端里使用" />}
      <div className="stack">
        {list.data?.items.map((k) => (
          <article key={k.id} className={`keycard ${k.enabled ? '' : 'off'}`} onClick={() => setEditing(k)}>
            <div className="grow">
              <div className="row"><strong className="ellipsis">{k.name}</strong>{k.from_packet && <span className="tag">红包</span>}</div>
              <div className="mono muted">{k.prefix}••••</div>
              <div className="muted tiny">{k.models.length ? `${k.models.length} 个模型` : '全部模型'} · {num(k.used_tokens)} Token{k.quota ? ` / ${num(k.quota)}` : ''} · {ago(k.last_used_at)}</div>
              {k.usage_ratio !== null && <div className="ttl"><span style={{width: `${k.usage_ratio * 100}%`}} /></div>}
            </div>
            <Switch label="启用" on={k.enabled} onChange={(v) => toggle(k, v)} />
          </article>
        ))}
      </div>
      <Fab label="生成密钥" icon={<IconPlus />} onClick={() => setCreating(true)} />
      <KeyForm open={creating} models={models.data || []} onClose={() => setCreating(false)}
        onSubmit={async (name, ms, quota) => {
          const r = await api.createKey({name, models: ms, quota});
          setCreating(false); setCreated({key: r.key, base: r.hint.base_url}); list.reload();
        }} />
      <KeyForm open={!!editing} initial={editing ?? undefined} models={models.data || []} onClose={() => setEditing(null)}
        onSubmit={async (name, ms, quota) => { await api.updateKey(editing!.id, {name, models: ms, quota}); setEditing(null); toast('已保存', 'ok'); list.reload(); }}
        onDelete={async () => { await api.deleteKey(editing!.id); setEditing(null); toast('已删除', 'ok'); list.reload(); }} />
      <RevealSheet value={created} onClose={() => setCreated(null)} />
    </div>
  );
}

function KeyForm({open, initial, models, onClose, onSubmit, onDelete}: {
  open: boolean; initial?: KeyCard; models: ModelInfo[]; onClose: () => void;
  onSubmit: (name: string, models: string[], quota: number) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [quota, setQuota] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {  // 每次打开重置表单
    setLastOpen(open);
    if (open) { setName(initial?.name || ''); setPicked(new Set(initial?.models || [])); setQuota(initial?.quota ? String(initial.quota) : ''); setQuery(''); setConfirmDel(false); }
  }
  const groups = useMemo(() => {
    const m = new Map<string, ModelInfo[]>();
    models.filter((x) => !query || x.id.toLowerCase().includes(query.toLowerCase()) || x.name.toLowerCase().includes(query.toLowerCase()))
      .forEach((x) => { const g = x.series || '其他'; m.set(g, [...(m.get(g) || []), x]); });
    return [...m.entries()];
  }, [models, query]);
  const flip = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    if (!name.trim()) return toast('请填写名称', 'err');
    setBusy(true);
    try { await onSubmit(name.trim(), [...picked], Number(quota) || 0); }
    catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={initial ? '编辑密钥' : '生成密钥'}
      footer={<>
        {onDelete && (confirmDel
          ? <button className="btn danger" onClick={() => onDelete().catch((e) => toast(e.message, 'err'))}>确认删除</button>
          : <button className="btn text-danger" onClick={() => setConfirmDel(true)}>删除</button>)}
        <button className="btn filled grow" disabled={busy} onClick={submit}>{busy ? '提交中…' : initial ? '保存' : '生成'}</button>
      </>}>
      <label className="field-label">名称</label>
      <input className="input" value={name} maxLength={64} placeholder="例如：我的手机" onChange={(e) => setName(e.target.value)} />
      <label className="field-label">Token 额度 <span className="muted">（留空 = 不限）</span></label>
      <input className="input" inputMode="numeric" value={quota} placeholder="不限" onChange={(e) => setQuota(e.target.value.replace(/\D/g, ''))} />
      <label className="field-label">模型授权 <span className="muted">{picked.size ? `已选 ${picked.size}` : '未选 = 全部模型'}</span></label>
      <input className="input" value={query} placeholder="搜索模型" onChange={(e) => setQuery(e.target.value)} />
      <div className="chips-scroll">
        {groups.map(([g, ms]) => (
          <div key={g}><div className="group-label">{g}</div>
            <div className="chips">{ms.map((m) => <button key={m.id} className={`chip ${picked.has(m.id) ? 'on' : ''}`} onClick={() => flip(m.id)}>{m.name}</button>)}</div>
          </div>
        ))}
        {models.length === 0 && <p className="muted small">模型列表加载中或不可用；未选择时默认放行全部模型。</p>}
      </div>
    </Sheet>
  );
}

function RevealSheet({value, onClose}: {value: {key: string; base: string} | null; onClose: () => void}) {
  const toast = useToast();
  const c = (t: string, what: string) => copy(t).then((ok) => toast(ok ? `已复制${what}` : '复制失败', ok ? 'ok' : 'err'));
  const curl = value ? `curl ${value.base}/chat/completions \\\n  -H "Authorization: Bearer ${value.key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"global:claude-sonnet-4","messages":[{"role":"user","content":"hi"}]}'` : '';
  return (
    <Sheet open={!!value} onClose={onClose} title="密钥已生成"
      footer={<button className="btn filled block" onClick={onClose}>我已保存</button>}>
      <p className="warn-text">明文只显示这一次，关闭后无法再查看。</p>
      <div className="secret mono" onClick={() => value && c(value.key, '密钥')}>{value?.key}</div>
      <div className="actions">
        <button className="btn filled" onClick={() => value && c(value.key, '密钥')}><IconCopy width={18} />复制密钥</button>
        <button className="btn tonal" onClick={() => c(curl, ' curl')}>复制 curl</button>
        <button className="btn tonal" onClick={() => value && c(`OPENAI_BASE_URL=${value.base}\nOPENAI_API_KEY=${value.key}`, '环境变量')}>复制 SDK 配置</button>
      </div>
      <p className="muted small">Base URL：<span className="mono">{value?.base}</span></p>
    </Sheet>
  );
}
