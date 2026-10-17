import {useCallback, useEffect, useState} from 'react';
import {api} from '../../lib/api';
import {num, pct, ago} from '../../lib/format';
import {useVisible, usePullToRefresh} from '../../lib/hooks';
import {liveOverview} from '../../lib/sse';
import type {Overview as OverviewT, Pill as PillT} from '../../lib/types';
import {ErrorBanner, Header, Pill, Skeleton} from '../../ui/kit';
import {IconGear} from '../../ui/Icons';
import {go} from '../../lib/router';

const SEGMENTS: {key: PillT; label: string}[] = [
  {key: 'ok', label: '可用'}, {key: 'busy', label: '忙碌'}, {key: 'cooling', label: '冷却'},
  {key: 'paused', label: '停用'}, {key: 'expired', label: '过期'}, {key: 'banned', label: '需重登'},
];

export default function Overview() {
  const [data, setData] = useState<OverviewT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const visible = useVisible();

  const load = useCallback(async () => {
    try { setData(await api.overview()); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!visible) return;
    return liveOverview<OverviewT>('/m/api/live', (d) => { setData(d); setErr(null); }, setErr);
  }, [visible]);
  const {ref, pull, busy} = usePullToRefresh(load);

  const g = data?.gateway;
  const pool = data?.pool;
  return (
    <div className="page" ref={ref}>
      <div className="ptr" style={{height: pull}}>{busy ? '刷新中…' : pull > 64 ? '松开刷新' : ''}</div>
      <Header title="概览" sub={data ? `${data.realm === 'global' ? '国际版' : '国内版'} · ${ago(data.at)}更新` : '连接中…'}
        right={<button className="icon-btn" aria-label="设置" onClick={() => go('/settings')}><IconGear /></button>} />
      {err && <ErrorBanner message={data ? `实时更新中断：${err}（显示的是上次的数据）` : err} onRetry={load} />}
      {!data && !err && <Skeleton h={120} n={3} />}
      {data && (
        <>
          <section className={`hero hero-${g?.state ?? 'unknown'}`}>
            <div className="hero-row">
              <span className="hero-dot" />
              <div>
                <div className="hero-label">{g?.label ?? '状态未知'}</div>
                <div className="hero-detail">{g?.detail || (data.errors.status ? `状态获取失败：${data.errors.status}` : '')}</div>
              </div>
            </div>
            <div className="hero-inflight">
              <span className="big">{data.inflight ?? '—'}</span>
              <span className="cap">在途请求</span>
            </div>
          </section>

          <section className="tiles">
            <Tile label="今日请求" value={num(data.today?.requests)} foot={data.today ? `失败 ${data.today.failures}` : data.errors.summary} />
            <Tile label="今日 Token" value={num(data.today?.tokens)} foot={data.week ? `近 7 天 ${num(data.week.tokens)}` : undefined} />
            <Tile label="成功率" value={pct(data.today?.success_rate)} tone={rateTone(data.today?.success_rate)} />
            <Tile label="活跃密钥" value={num(data.active_keys)} foot={data.top_model ? `热门 ${data.top_model}` : undefined} />
          </section>

          {pool && (
            <section className="card" onClick={() => go('/accounts')} role="button">
              <div className="card-head"><h3>账号池</h3><span className="muted">{pool.usable}/{pool.total} 可用</span></div>
              <div className="bar">
                {SEGMENTS.map((s) => pool[s.key] ? <span key={s.key} className={`seg-${s.key}`} style={{flex: pool[s.key]}} /> : null)}
              </div>
              <div className="legend">
                {SEGMENTS.filter((s) => pool[s.key]).map((s) => <span key={s.key}><i className={`dot seg-${s.key}`} />{s.label} {pool[s.key]}</span>)}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head"><h3>最近失败</h3>{data.recent_errors?.length ? <Pill kind="down" label={`${data.recent_errors.length}`} /> : null}</div>
            {data.recent_errors === null && <p className="muted">{data.errors.logs || '无法读取日志'}</p>}
            {data.recent_errors?.length === 0 && <p className="muted">今天一切正常 🎉</p>}
            <ul className="list">
              {data.recent_errors?.map((e) => (
                <li key={e.id}>
                  <span className="code">{e.status}</span>
                  <div className="grow"><div className="ellipsis">{e.error || '（无错误信息）'}</div><small className="muted">{e.model} · {e.key || '—'} · {ago(e.ts)}</small></div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

const rateTone = (r?: number | null) => (r === null || r === undefined ? undefined : r >= 0.98 ? 'good' : r >= 0.9 ? 'warn' : 'bad');

function Tile({label, value, foot, tone}: {label: string; value: string; foot?: string; tone?: string}) {
  return (
    <div className={`tile ${tone ? 'tone-' + tone : ''}`}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {foot && <span className="tile-foot ellipsis">{foot}</span>}
    </div>
  );
}
