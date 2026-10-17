import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { api } from '../api/client'
import { go } from '../stores/router'
import { session } from '../stores/session'
import { toast } from '../stores/toast'
import { Card, ErrorBar, Header, IconButton, Pill, Skeleton, fmtNum } from '../ui/kit'
import { IcLogout, IcRefresh } from '../ui/icons'

type Dash = {
  gateway: { level: 'ok' | 'warn' | 'down'; text: string; upstream: string; inflight: number } | null
  pool: { total: number; available: number; cooling: number; disabled: number; problem: number } | null
  today: { requests: number; tokens: number; credit: number; failed: number; top_model: string | null; health_hint: string } | null
  hourly: { hour: number; requests: number; tokens: number }[] | null
  errors: Record<string, string>
}

const data = signal<Dash | null>(null)
const err = signal('')
const loading = signal(false)

async function load() {
  loading.value = true
  try {
    data.value = await api<Dash>('/dash')
    err.value = ''
  } catch (e: any) {
    err.value = e.message
  } finally { loading.value = false }
}

function Spark({ pts }: { pts: number[] }) {
  const W = 320, H = 72, max = Math.max(1, ...pts)
  const step = W / Math.max(1, pts.length - 1)
  const line = pts.map((v, i) => `${(i * step).toFixed(1)},${(H - 6 - (v / max) * (H - 14)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full h-[72px]" preserveAspectRatio="none" role="img" aria-label="今日每小时请求量">
      <defs>
        <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="var(--primary)" stop-opacity=".35" />
          <stop offset="1" stop-color="var(--primary)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#sg)" />
      <polyline points={line} fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
  )
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const c = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink'
  return (
    <Card class="p-4">
      <div class="text-[13px] text-ink-3 font-medium">{label}</div>
      <div class={`text-[28px] font-bold tracking-tight mt-1 tabular-nums ${c}`}>{value}</div>
      {sub && <div class="text-[12px] text-ink-3 mt-0.5 truncate">{sub}</div>}
    </Card>
  )
}

export function Dashboard() {
  useEffect(() => {
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, 15000)
    const vis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const d = data.value
  const g = d?.gateway
  const level = g?.level || 'down'
  const LV = { ok: { tone: 'ok', dot: 'bg-ok', label: '在线' }, warn: { tone: 'warn', dot: 'bg-warn', label: '注意' }, down: { tone: 'bad', dot: 'bg-bad', label: '离线' } } as const

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* 忽略 */ }
    session.value = null
    toast('已退出登录')
  }

  return (
    <div>
      <Header title="概览" sub={`你好，${session.value?.username || ''}`} right={<>
        <IconButton label="刷新" onClick={load} disabled={loading.value}><IcRefresh size={20} class={loading.value ? 'animate-spin' : ''} /></IconButton>
        <IconButton label="退出登录" onClick={logout}><IcLogout size={20} /></IconButton>
      </>} />
      {err.value && <ErrorBar text={err.value} onRetry={load} />}

      <div class="px-5 space-y-3">
        {!d ? (
          <>
            <Skeleton h={124} />
            <div class="grid grid-cols-2 gap-3"><Skeleton h={104} /><Skeleton h={104} /><Skeleton h={104} /><Skeleton h={104} /></div>
          </>
        ) : (
          <>
            <Card class="p-5 anim-rise">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <span class={`w-3 h-3 rounded-full ${LV[level].dot} ${level === 'ok' ? 'dot-live' : ''}`} />
                  <span class="text-[13px] font-semibold text-ink-2">网关状态</span>
                </div>
                <Pill tone={LV[level].tone}>{LV[level].label}</Pill>
              </div>
              <div class="text-[24px] font-bold mt-3 tracking-tight">{g?.text || d.errors.accounts || '无法读取'}</div>
              <div class="text-[14px] text-ink-3 mt-1">{g ? `默认上游 · ${g.upstream}` : '核心服务未返回账号池状态'}</div>
              {d.today?.health_hint && <div class="mt-3 text-[13px] text-warn bg-warn-soft rounded-xl px-3 py-2">{d.today.health_hint}</div>}
            </Card>

            <div class="grid grid-cols-2 gap-3">
              <Metric label="在途连接" value={g ? fmtNum(g.inflight) : '—'} sub="正在转发的请求" tone={g && g.inflight > 0 ? 'ok' : undefined} />
              <Metric label="可用账号" value={d.pool ? `${d.pool.available}/${d.pool.total}` : '—'}
                sub={d.pool ? `冷却 ${d.pool.cooling} · 停用 ${d.pool.disabled}${d.pool.problem ? ` · 异常 ${d.pool.problem}` : ''}` : ''}
                tone={d.pool ? (d.pool.available === 0 ? 'bad' : d.pool.problem ? 'warn' : undefined) : undefined} />
              <Metric label="今日请求" value={fmtNum(d.today?.requests)} sub={d.today ? (d.today.failed ? `失败 ${d.today.failed} 次` : '没有失败请求') : ''} tone={d.today?.failed ? 'warn' : undefined} />
              <Metric label="今日 Token" value={fmtNum(d.today?.tokens)} sub={d.today ? `消耗 ${fmtNum(d.today.credit)} credit` : ''} />
            </div>

            {d.hourly && (
              <Card class="p-4 pb-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[15px] font-semibold">今日请求趋势</span>
                  {d.today?.top_model && <Pill tone="info">{d.today.top_model}</Pill>}
                </div>
                <Spark pts={d.hourly.filter(h => h.hour <= new Date().getHours()).map(h => h.requests)} />
                <div class="flex justify-between text-[11px] text-ink-3 mt-1 tabular-nums"><span>0 时</span><span>现在 · {new Date().getHours()} 时</span></div>
              </Card>
            )}

            <div class="grid grid-cols-2 gap-3">
              <button class="press h-14 rounded-2xl bg-primary-soft text-primary font-semibold" onClick={() => go('accounts')}>管理账号</button>
              <button class="press h-14 rounded-2xl bg-card-2 text-ink font-semibold" onClick={() => go('chat')}>快速测试</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
