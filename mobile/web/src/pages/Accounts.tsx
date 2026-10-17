import { computed, signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../api/client'
import { isAdmin } from '../stores/session'
import { copyText, haptic, toast } from '../stores/toast'
import { ActionRow, Button, Card, Empty, ErrorBar, Header, IconButton, Pill, Sheet, Skeleton, Switch, fmtDur, fmtNum, type Tone } from '../ui/kit'
import { IcCopy, IcExternal, IcMore, IcPlus, IcPulse, IcRefresh, IcSearch } from '../ui/icons'

type State = 'ok' | 'busy' | 'cooling' | 'disabled' | 'expired' | 'invalid' | 'offline'
type Account = {
  file: string; uid: string; uid_tail: string; nickname: string; realm: 'cn' | 'global'
  state: State; state_label: string; reason: string; cool_remaining_sec: number | null
  remain_seconds: number | null; credits: number | null; in_flight: number; note: string; disabled: boolean
}

const TONE: Record<State, Tone> = { ok: 'ok', busy: 'info', cooling: 'warn', disabled: 'mute', expired: 'bad', invalid: 'bad', offline: 'bad' }
// 地区短名单与 core 的 tencent.INTERNATIONAL_REGIONS 一致
const REGIONS: [string, string][] = [['HK', '中国香港'], ['MO', '中国澳门'], ['SG', '新加坡'], ['TH', '泰国'], ['PH', '菲律宾'], ['MY', '马来西亚'], ['ID', '印度尼西亚']]
type Filter = 'all' | 'ok' | 'cooling' | 'disabled' | 'problem'
const FILTERS: [Filter, string][] = [['all', '全部'], ['ok', '可用'], ['cooling', '冷却'], ['disabled', '停用'], ['problem', '异常']]

const list = signal<Account[] | null>(null)
const meta = signal({ manageable: true, upstream: '' })
const err = signal('')
const filter = signal<Filter>('all')
const query = signal('')
const pending = signal<Record<string, boolean>>({})

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (list.value || []).filter(a => {
    const f = filter.value
    if (f === 'ok' && !(a.state === 'ok' || a.state === 'busy')) return false
    if (f === 'cooling' && a.state !== 'cooling') return false
    if (f === 'disabled' && a.state !== 'disabled') return false
    if (f === 'problem' && !['expired', 'invalid', 'offline'].includes(a.state)) return false
    return !q || a.nickname.toLowerCase().includes(q) || a.uid.includes(q) || a.note.toLowerCase().includes(q)
  })
})

async function load() {
  try {
    const d = await api<{ accounts: Account[]; manageable: boolean; upstream: string }>('/accounts')
    list.value = d.accounts
    meta.value = { manageable: d.manageable, upstream: d.upstream }
    err.value = ''
  } catch (e: any) { err.value = e.message }
}

async function toggle(a: Account, enable: boolean) {
  pending.value = { ...pending.value, [a.file]: true }
  // 乐观更新：开关立即响应，失败再回滚
  const prev = list.value
  list.value = (list.value || []).map(x => x.file === a.file ? { ...x, disabled: !enable, state: enable ? 'ok' : 'disabled', state_label: enable ? '可用' : '已停用' } : x)
  try {
    await api(`/accounts/${encodeURIComponent(a.file)}/toggle`, { method: 'POST', json: { disabled: !enable } })
    haptic()
    toast(enable ? `已启用 ${a.nickname}` : `已停用 ${a.nickname}`, 'ok')
    load()
  } catch (e: any) {
    list.value = prev
    toast(e.message, 'bad')
  } finally {
    const { [a.file]: _, ...rest } = pending.value
    pending.value = rest
  }
}

function AccountCard({ a, onMore, i }: { a: Account; onMore: () => void; i: number }) {
  const sub = a.state === 'cooling' && a.cool_remaining_sec ? `冷却剩余 ${fmtDur(a.cool_remaining_sec)}`
    : a.state === 'busy' ? `${a.in_flight} 个请求进行中`
    : a.reason || (a.remain_seconds ? `令牌剩余 ${fmtDur(a.remain_seconds)}` : '')
  return (
    <Card class="p-4 anim-rise" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
      <div class="flex items-start gap-3">
        <div class="w-11 h-11 rounded-2xl bg-card-2 grid place-items-center text-[17px] font-bold text-ink-2 shrink-0" aria-hidden="true">
          {Array.from(a.nickname)[0] || '?'}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[16px] font-semibold truncate">{a.nickname}</span>
          </div>
          <div class="text-[13px] text-ink-3 font-mono mt-0.5">UID …{a.uid_tail}</div>
        </div>
        {isAdmin() && meta.value.manageable && (
          <Switch label={`${a.disabled ? '启用' : '停用'} ${a.nickname}`} checked={!a.disabled}
            disabled={!!pending.value[a.file]} onChange={(v) => toggle(a, v)} />
        )}
      </div>
      <div class="flex items-center gap-1.5 mt-3 flex-wrap">
        <Pill tone={a.realm === 'global' ? 'info' : 'mute'}>{a.realm === 'global' ? '国际版' : '国内版'}</Pill>
        <Pill tone={TONE[a.state]} dot>{a.state_label}</Pill>
        {a.credits !== null && <Pill tone="mute">{fmtNum(a.credits)} credit</Pill>}
        <span class="flex-1" />
        <button aria-label={`${a.nickname} 更多操作`} class="press w-9 h-9 -mr-1 rounded-full grid place-items-center text-ink-3" onClick={onMore}><IcMore size={20} /></button>
      </div>
      {(sub || a.note) && (
        <div class="mt-2.5 text-[13px] text-ink-2 leading-5">
          {a.note && <div class="truncate"><span class="text-ink-3">备注 · </span>{a.note}</div>}
          {sub && <div class="text-ink-3 truncate">{sub}</div>}
        </div>
      )}
    </Card>
  )
}

/** 国际版一键授权：选地区 → 打开授权页 → 回到 App 自动确认。 */
function AuthorizeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [region, setRegion] = useState(() => localStorage.getItem('wbm.region') || 'HK')
  const [realm, setRealm] = useState<'global' | 'cn'>('global')
  const [phase, setPhase] = useState<'pick' | 'wait' | 'done' | 'fail'>('pick')
  const [msg, setMsg] = useState('')
  const stateRef = useRef<{ state: string; url: string; deadline: number } | null>(null)
  const timer = useRef<number>()

  function reset() { clearTimeout(timer.current); stateRef.current = null; setPhase('pick'); setMsg('') }
  function close() { reset(); onClose() }

  async function poll() {
    const s = stateRef.current
    if (!s) return
    if (Date.now() > s.deadline) { setPhase('fail'); setMsg('授权超时，请重新发起'); return }
    try {
      const r = await api<{ status: string; nickname?: string; message?: string }>(
        `/accounts/authorize/${encodeURIComponent(s.state)}?realm=${realm}&region=${realm === 'global' ? region : ''}`)
      if (r.status === 'success') {
        stateRef.current = null
        setPhase('done'); setMsg(r.nickname ? `已添加 ${r.nickname}` : '账号已添加')
        haptic(15); load(); return
      }
      if (['expired', 'invalid', 'realm_mismatch', 'failed', 'error'].includes(r.status)) {
        stateRef.current = null
        setPhase('fail'); setMsg(r.message || (r.status === 'realm_mismatch' ? '登录的账号与所选版本不一致' : '授权已失效，请重新发起')); return
      }
    } catch (e: any) { setMsg(e.message) }
    timer.current = window.setTimeout(poll, 2000)
  }

  useEffect(() => {
    // 从授权页切回 App 时立即补查一次，不等下一个 2 秒
    const vis = () => { if (!document.hidden && stateRef.current) { clearTimeout(timer.current); poll() } }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); clearTimeout(timer.current) }
  }, [realm, region])

  async function start() {
    // 先同步开窗再填地址：iOS Safari 会拦截 await 之后才调用的 window.open
    const win = window.open('about:blank', '_blank')
    if (win) win.opener = null   // 防反向 Tab 劫持：授权页拿不到本页的引用
    try {
      localStorage.setItem('wbm.region', region)
      const r = await api<{ state: string; auth_url: string }>('/accounts/authorize', { method: 'POST', json: { realm, region: realm === 'global' ? region : '' } })
      if (!/^https:\/\//.test(r.auth_url)) throw new Error('核心服务返回的授权地址无效')
      stateRef.current = { state: r.state, url: r.auth_url, deadline: Date.now() + 180_000 }
      if (win) win.location.href = r.auth_url
      setPhase('wait'); setMsg('')
      timer.current = window.setTimeout(poll, 2000)
    } catch (e: any) {
      win?.close()
      toast(e.message, 'bad')
    }
  }

  return (
    <Sheet open={open} onClose={close} title="添加账号">
      {phase === 'pick' && (
        <div class="pb-2">
          <div class="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-card mb-4">
            {(['global', 'cn'] as const).map(r => (
              <button key={r} class={`press h-11 rounded-xl font-semibold text-[15px] ${realm === r ? 'bg-primary text-on-primary' : 'text-ink-2'}`} onClick={() => setRealm(r)}>
                {r === 'global' ? '国际版' : '国内版'}
              </button>
            ))}
          </div>
          {realm === 'global' && (
            <>
              <div class="text-[13px] font-semibold text-ink-2 mb-2">注册地区</div>
              <div class="flex flex-wrap gap-2 mb-5">
                {REGIONS.map(([code, name]) => (
                  <button key={code} onClick={() => setRegion(code)}
                    class={`press h-10 px-4 rounded-full text-[14px] font-semibold border ${region === code ? 'bg-primary-soft text-primary border-primary/50' : 'bg-card text-ink-2 border-line'}`}>
                    {name}
                  </button>
                ))}
              </div>
            </>
          )}
          <Button class="w-full" onClick={start}><IcExternal size={18} />去授权</Button>
          <p class="text-[12px] text-ink-3 mt-3 text-center">在新页面完成登录后回到这里，账号会自动加入账号池。</p>
        </div>
      )}
      {phase === 'wait' && (
        <div class="text-center py-6">
          <div class="w-12 h-12 mx-auto rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
          <div class="text-[17px] font-semibold mt-4">等待授权完成…</div>
          <div class="text-[13px] text-ink-3 mt-1">{msg || '在授权页登录后返回本页面'}</div>
          <div class="grid grid-cols-2 gap-2 mt-6">
            <Button tone="ghost" onClick={() => stateRef.current && window.open(stateRef.current.url, '_blank', 'noopener')}>重新打开</Button>
            <Button tone="ghost" onClick={() => copyText(stateRef.current?.url || '', '授权链接已复制')}>复制链接</Button>
          </div>
        </div>
      )}
      {(phase === 'done' || phase === 'fail') && (
        <div class="text-center py-6">
          <div class={`text-[44px] ${phase === 'done' ? 'text-ok' : 'text-bad'}`}>{phase === 'done' ? '✓' : '!'}</div>
          <div class="text-[17px] font-semibold mt-2">{msg}</div>
          <div class="grid grid-cols-2 gap-2 mt-6">
            <Button tone="ghost" onClick={reset}>{phase === 'done' ? '再添加一个' : '重新发起'}</Button>
            <Button onClick={close}>完成</Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

export function Accounts() {
  const [more, setMore] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)
  const [testing, setTesting] = useState(false)
  useEffect(() => { load() }, [])

  async function test(a: Account) {
    setTesting(true)
    try {
      const r = await api<{ ok: boolean; message: string }>(`/accounts/${encodeURIComponent(a.file)}/test`, { method: 'POST' })
      toast(r.ok ? `连通正常：${a.nickname}` : (r.message || '测试未通过'), r.ok ? 'ok' : 'bad')
    } catch (e: any) { toast(e.message, 'bad') } finally { setTesting(false); setMore(null) }
  }

  const all = list.value
  return (
    <div>
      <Header title="账号" sub={meta.value.upstream ? `账号池 · ${meta.value.upstream}` : '账号池'}
        right={<IconButton label="刷新" onClick={load}><IcRefresh size={20} /></IconButton>} />
      {err.value && <ErrorBar text={err.value} onRetry={load} />}

      <div class="sticky top-0 z-20 glass px-5 pt-2 pb-3 border-b border-line/40">
        <div class="relative">
          <IcSearch size={18} class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input type="search" placeholder="搜索昵称、UID 或备注" value={query.value} onInput={(e) => { query.value = (e.target as HTMLInputElement).value }}
            class="w-full h-11 pl-10 pr-4 rounded-2xl bg-card border border-line/70 text-[15px] placeholder:text-ink-3 outline-none focus:border-primary" />
        </div>
        <div class="flex gap-2 mt-2.5 overflow-x-auto -mx-5 px-5 [scrollbar-width:none]">
          {FILTERS.map(([k, label]) => {
            const n = k === 'all' ? all?.length : all?.filter(a => k === 'ok' ? ['ok', 'busy'].includes(a.state) : k === 'problem' ? ['expired', 'invalid', 'offline'].includes(a.state) : a.state === k).length
            return (
              <button key={k} onClick={() => { filter.value = k }}
                class={`press h-9 px-3.5 rounded-full text-[14px] font-semibold whitespace-nowrap ${filter.value === k ? 'bg-ink text-bg' : 'bg-card text-ink-2 border border-line/70'}`}>
                {label}{n !== undefined && <span class="opacity-70 ml-1 tabular-nums">{n}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div class="px-5 pt-3 space-y-3">
        {all === null ? [0, 1, 2].map(i => <Skeleton key={i} h={132} />)
          : shown.value.length === 0 ? <Empty title={all.length ? '没有符合条件的账号' : '还没有账号'} hint={all.length ? '换个筛选条件试试' : '点右下角按钮添加第一个账号'} />
          : shown.value.map((a, i) => <AccountCard key={a.file} a={a} i={i} onMore={() => setMore(a)} />)}
        {!meta.value.manageable && <p class="text-[13px] text-ink-3 text-center py-2">该分组没有配置本地账号目录，只能查看。</p>}
        <div class="h-16" aria-hidden="true" />
      </div>

      {isAdmin() && meta.value.manageable && (
        <button aria-label="添加账号" onClick={() => setAdding(true)}
          class="press fixed right-5 z-30 w-14 h-14 rounded-[20px] bg-primary text-on-primary grid place-items-center shadow-[0_8px_30px_rgba(0,0,0,.35)]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}>
          <IcPlus size={26} stroke={2.4} />
        </button>
      )}

      <Sheet open={!!more} onClose={() => setMore(null)} title={more?.nickname}>
        {more && (
          <div class="pb-2">
            {isAdmin() && <ActionRow icon={<IcPulse size={20} />} label={testing ? '测试中…' : '测试连通性'} onClick={() => !testing && test(more)} />}
            <ActionRow icon={<IcCopy size={20} />} label="复制 UID" onClick={() => { copyText(more.uid, 'UID 已复制'); setMore(null) }} />
            <p class="text-[12px] text-ink-3 text-center mt-3">备注、移组、删除等低频操作请在桌面端完成。</p>
          </div>
        )}
      </Sheet>
      <AuthorizeSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
