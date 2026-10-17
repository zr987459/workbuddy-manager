import {useCallback, useEffect, useRef, useState} from 'react';
import {api} from '../../lib/api';
import {copy, haptic} from '../../lib/device';
import {duration} from '../../lib/format';
import {useAsync, usePullToRefresh} from '../../lib/hooks';
import type {AccountCard} from '../../lib/types';
import {Empty, ErrorBanner, Fab, Header, Pill, Segmented, Sheet, Skeleton, Switch, useToast} from '../../ui/kit';
import {IconCopy, IconPlus, IconRefresh} from '../../ui/Icons';

type Filter = 'all' | 'usable' | 'cooling' | 'attention';

export default function Accounts() {
  const [filter, setFilter] = useState<Filter>('all');
  const list = useAsync(() => api.accounts({pill: filter === 'all' ? undefined : filter}), [filter]);
  const [detail, setDetail] = useState<AccountCard | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const {ref, pull} = usePullToRefresh(list.reload);
  const counts = list.data?.counts;

  const toggle = async (a: AccountCard, enabled: boolean) => {
    haptic();
    const prev = list.data;
    if (prev) list.set({...prev, items: prev.items.map((x) => x.id === a.id ? {...x, enabled, pill: enabled ? 'ok' : 'paused'} : x)});
    try { await api.toggleAccount(a.file, enabled); toast(enabled ? `已启用 ${a.name}` : `已停用 ${a.name}`, 'ok'); }
    catch (e) { if (prev) list.set(prev); toast((e as Error).message, 'err'); }
  };

  return (
    <div className="page" ref={ref}>
      <div className="ptr" style={{height: pull}} />
      <Header title="账号" sub={counts ? `${counts.usable} 可用 · 共 ${counts.total}` : undefined} />
      <Segmented<Filter> value={filter} onChange={setFilter} options={[
        {value: 'all', label: '全部'},
        {value: 'usable', label: '可用'},
        {value: 'cooling', label: '冷却', badge: counts?.cooling},
        {value: 'attention', label: '异常', badge: counts ? counts.expired + counts.banned + counts.invalid + counts.offline : 0},
      ]} />
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton h={96} n={4} />}
      {list.data && list.data.items.length === 0 && (
        <Empty title={filter === 'all' ? '还没有账号' : '没有符合条件的账号'} hint={filter === 'all' ? '点右下角，用 workbuddy.ai 一键授权添加' : undefined} />
      )}
      <div className="stack">
        {list.data?.items.map((a) => (
          <article key={a.id} className={`acct ${a.pill}`} onClick={() => setDetail(a)}>
            <div className="avatar" aria-hidden>{a.name.slice(0, 1).toUpperCase()}</div>
            <div className="grow">
              <div className="row"><strong className="ellipsis">{a.name}</strong><Pill kind={a.pill} /></div>
              <div className="muted small ellipsis">{a.note || a.reason}</div>
              <div className="ttl" title="登录剩余有效期"><span style={{width: `${(a.token.ratio ?? 0) * 100}%`}} /></div>
              <div className="muted tiny">令牌 {duration(a.token.remain_seconds)}{a.in_flight ? ` · 在途 ${a.in_flight}` : ''}</div>
            </div>
            <Switch label="启用" on={a.enabled} disabled={!list.data?.manageable} onChange={(v) => toggle(a, v)} />
          </article>
        ))}
      </div>
      <Fab label="添加账号" icon={<IconPlus />} onClick={() => setAdding(true)} />
      <AccountSheet a={detail} onClose={() => setDetail(null)} onChanged={list.reload} />
      <AddAccountSheet open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); list.reload(); }} />
    </div>
  );
}

function AccountSheet({a, onClose, onChanged}: {a: AccountCard | null; onClose: () => void; onChanged: () => void}) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const run = async (what: string, fn: () => Promise<{ok?: boolean; message?: string}>) => {
    setBusy(what);
    try { const r = await fn(); toast(r?.message || '完成', r?.ok === false ? 'err' : 'ok'); onChanged(); }
    catch (e) { toast((e as Error).message, 'err'); }
    finally { setBusy(''); }
  };
  return (
    <Sheet open={!!a} onClose={onClose} title={a?.name}>
      {a && (
        <>
          <div className="kv"><span>状态</span><span><Pill kind={a.pill} /> {a.reason}</span></div>
          <div className="kv"><span>UID</span><button className="btn-text mono" onClick={() => copy(a.uid).then((ok) => toast(ok ? '已复制 UID' : '复制失败', ok ? 'ok' : 'err'))}>{a.uid.slice(0, 18)}… <IconCopy width={16} /></button></div>
          <div className="kv"><span>版本</span><span>{a.realm === 'global' ? '国际版' : '国内版'}</span></div>
          <div className="kv"><span>令牌剩余</span><span>{duration(a.token.remain_seconds)}</span></div>
          <div className="kv"><span>成功 / 错误</span><span>{a.success ?? '—'} / {a.errors ?? '—'}</span></div>
          {a.last_error && <div className="kv"><span>最近错误</span><span className="small">{a.last_error}</span></div>}
          <div className="actions">
            <button className="btn tonal" disabled={!!busy} onClick={() => run('refresh', () => api.refreshAccount(a.file))}><IconRefresh width={18} />{busy === 'refresh' ? '续期中…' : '刷新令牌'}</button>
            <button className="btn tonal" disabled={!!busy} onClick={() => run('test', () => api.testAccount(a.file))}>{busy === 'test' ? '测试中…' : '连通测试'}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

const REGIONS = ['HK', 'SG', 'JP', 'US', 'GB', 'DE', 'TW', 'KR'];

function AddAccountSheet({open, onClose, onDone}: {open: boolean; onClose: () => void; onDone: () => void}) {
  const toast = useToast();
  const [region, setRegion] = useState('HK');
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'done'>('idle');
  const [link, setLink] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const stop = useCallback(() => { window.clearTimeout(timer.current); }, []);
  useEffect(() => { if (!open) { stop(); setPhase('idle'); setLink(''); } }, [open, stop]);
  useEffect(() => stop, [stop]);

  const start = async () => {
    // 先同步开窗再填地址：移动端浏览器会拦截 await 之后的 window.open
    const win = window.open('about:blank', '_blank');
    try {
      const s = await api.startLogin(region);
      setLink(s.auth_url); setPhase('waiting');
      if (win) win.location.href = s.auth_url;
      const poll = async () => {
        try {
          const r = await api.pollLogin(s.state, region);
          if (r.status === 'success') { haptic(30); setPhase('done'); toast(`已添加 ${r.name || r.uid}`, 'ok'); setTimeout(onDone, 600); return; }
          if (r.done) { toast(r.status === 'expired' ? '授权链接已过期，请重新发起' : (r.message || r.status), 'err'); setPhase('idle'); return; }
        } catch (e) { toast((e as Error).message, 'err'); }
        timer.current = window.setTimeout(poll, 2000);
      };
      timer.current = window.setTimeout(poll, 2000);
    } catch (e) { win?.close(); toast((e as Error).message, 'err'); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="添加国际版账号">
      {phase === 'idle' && (
        <>
          <p className="muted">在 workbuddy.ai 完成授权后会自动回到这里，并完成地区注册与 trial 领取。</p>
          <label className="field-label">注册地区</label>
          <div className="chips">{REGIONS.map((r) => <button key={r} className={`chip ${r === region ? 'on' : ''}`} onClick={() => setRegion(r)}>{r}</button>)}</div>
          <button className="btn filled block" onClick={start}>前往 workbuddy.ai 授权</button>
        </>
      )}
      {phase === 'waiting' && (
        <div className="center">
          <div className="spinner" />
          <p>等待授权完成…</p>
          <p className="muted small">没有自动跳转？</p>
          <div className="actions">
            <a className="btn tonal" href={link} target="_blank" rel="noopener">重新打开</a>
            <button className="btn tonal" onClick={() => copy(link).then(() => toast('链接已复制', 'ok'))}>复制链接</button>
          </div>
        </div>
      )}
      {phase === 'done' && <div className="center"><div className="check">✓</div><p>添加成功</p></div>}
    </Sheet>
  );
}
