import { signal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import { api } from '../api/client'
import { isAdmin } from '../stores/session'
import { copyText, haptic, toast } from '../stores/toast'
import { ActionRow, Button, Card, Empty, ErrorBar, Field, Header, IconButton, Pill, Sheet, Skeleton, Switch, fmtAgo, fmtNum, inputCls } from '../ui/kit'
import { IcCheck, IcCopy, IcMore, IcPlus, IcRefresh, IcTrash } from '../ui/icons'

type Key = {
  id: number; name: string; prefix: string; enabled: boolean; models: string[]; realm: '' | 'cn' | 'global'
  used_tokens: number; used_credit: number; last_used_at: number | null; from_packet: boolean
}
type Created = Key & { key: string }
type Model = { id: string; name: string; series?: string }

const keys = signal<Key[] | null>(null)
const err = signal('')

async function load() {
  try { keys.value = (await api<{ keys: Key[] }>('/keys')).keys; err.value = '' }
  catch (e: any) { err.value = e.message }
}

// 网关对外地址：优先用 BFF 配置的 WBM_PUBLIC_GATEWAY；未配置时假定 core 与本页同域反代
const gateway = signal('')
const gatewayBase = () => gateway.value || `${location.origin}/v1`

function ModelPicker({ realm, value, onChange }: { realm: string; value: string[]; onChange: (v: string[]) => void }) {
  const [models, setModels] = useState<Model[] | null>(null)
  useEffect(() => {
    const realms = realm ? [realm] : ['cn', 'global']
    Promise.all(realms.map(r => api<{ models: Model[] }>(`/models?realm=${r}`).then(d => d.models)))
      .then(all => setModels(all.flat()))
      .catch(() => setModels([]))
  }, [realm])
  if (models === null) return <Skeleton h={48} />
  if (!models.length) return <div class="text-[13px] text-ink-3">模型列表读取失败，留空即为全部模型。</div>
  const all = value.length === 0
  return (
    <div class="flex flex-wrap gap-2">
      <button type="button" onClick={() => onChange([])}
        class={`press h-9 px-3.5 rounded-full text-[13px] font-semibold border ${all ? 'bg-primary-soft text-primary border-primary/50' : 'bg-card text-ink-2 border-line'}`}>全部模型</button>
      {models.map(m => {
        const on = value.includes(m.id)
        return (
          <button type="button" key={m.id} onClick={() => onChange(on ? value.filter(x => x !== m.id) : [...value, m.id])}
            class={`press h-9 px-3.5 rounded-full text-[13px] font-semibold border inline-flex items-center gap-1 ${on ? 'bg-primary-soft text-primary border-primary/50' : 'bg-card text-ink-2 border-line'}`}>
            {on && <IcCheck size={14} stroke={3} />}{m.name}
          </button>
        )
      })}
    </div>
  )
}

function CreateSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (k: Created) => void }) {
  const [name, setName] = useState('')
  const [realm, setRealm] = useState<'' | 'cn' | 'global'>('global')
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  async function submit(e: Event) {
    e.preventDefault()
    setBusy(true)
    try {
      const k = await api<Created>('/keys', { method: 'POST', json: { name: name.trim(), realm, models } })
      setName(''); setModels([])
      onCreated(k)
    } catch (ex: any) { toast(ex.message, 'bad') } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title="生成密钥">
      <form onSubmit={submit} class="pb-2">
        <Field label="名称" hint="写清用途，例如「Cursor · 笔记本」，方便以后识别和吊销">
          <input class={inputCls} value={name} maxLength={64} placeholder="用途备注" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="版本">
          <div class="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-card">
            {([['global', '国际版'], ['cn', '国内版'], ['', '不限']] as const).map(([v, l]) => (
              <button type="button" key={v} onClick={() => { setRealm(v); setModels([]) }}
                class={`press h-10 rounded-xl font-semibold text-[14px] ${realm === v ? 'bg-primary text-on-primary' : 'text-ink-2'}`}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="授权模型"><ModelPicker realm={realm} value={models} onChange={setModels} /></Field>
        <Button type="submit" class="w-full mt-1" disabled={busy || !name.trim()}>{busy ? '生成中…' : '生成'}</Button>
      </form>
    </Sheet>
  )
}

/** 明文只展示这一次：离开即不可再看（与 core 一致，库里只存哈希）。 */
function RevealSheet({ k, onClose }: { k: Created | null; onClose: () => void }) {
  if (!k) return null
  const base = gatewayBase()
  const curl = `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${k.key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${k.models[0] || 'claude-sonnet-4.5'}","messages":[{"role":"user","content":"hi"}]}'`
  const sdk = `OPENAI_BASE_URL=${base}\nOPENAI_API_KEY=${k.key}`
  return (
    <Sheet open onClose={onClose} title="密钥已生成">
      <div class="pb-2">
        <div class="rounded-2xl bg-warn-soft text-warn text-[13px] px-3.5 py-2.5 mb-3">明文只显示这一次，关闭后无法再查看，请立即保存。</div>
        <button onClick={() => copyText(k.key, '密钥已复制')} class="press w-full text-left rounded-2xl bg-card border border-line p-4">
          <div class="text-[12px] text-ink-3 mb-1">{k.name}</div>
          <div class="font-mono text-[15px] break-all leading-6">{k.key}</div>
          <div class="text-primary text-[13px] font-semibold mt-2 inline-flex items-center gap-1"><IcCopy size={14} />点击复制</div>
        </button>
        <div class="grid grid-cols-2 gap-2 mt-3">
          <Button tone="ghost" onClick={() => copyText(curl, 'curl 命令已复制')}>复制为 curl</Button>
          <Button tone="ghost" onClick={() => copyText(sdk, 'SDK 配置已复制')}>复制 SDK 配置</Button>
        </div>
        <Button class="w-full mt-3" onClick={onClose}>我已保存</Button>
      </div>
    </Sheet>
  )
}

export function Keys() {
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [more, setMore] = useState<Key | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => {
    load()
    api<{ gateway_url: string }>('/meta').then(m => { gateway.value = m.gateway_url }).catch(() => {})
  }, [])

  async function setEnabled(k: Key, enabled: boolean) {
    const prev = keys.value
    keys.value = (keys.value || []).map(x => x.id === k.id ? { ...x, enabled } : x)
    try {
      await api(`/keys/${k.id}`, { method: 'PATCH', json: { enabled } })
      haptic(); toast(enabled ? '已启用' : '已停用', 'ok')
    } catch (e: any) { keys.value = prev; toast(e.message, 'bad') }
  }

  async function remove(k: Key) {
    try {
      await api(`/keys/${k.id}`, { method: 'DELETE' })
      keys.value = (keys.value || []).filter(x => x.id !== k.id)
      toast('已删除', 'ok')
    } catch (e: any) { toast(e.message, 'bad') } finally { setMore(null); setConfirmDel(false) }
  }

  const list = keys.value
  return (
    <div>
      <Header title="密钥" sub="网关访问凭证" right={<IconButton label="刷新" onClick={load}><IcRefresh size={20} /></IconButton>} />
      {err.value && <ErrorBar text={err.value} onRetry={load} />}
      <div class="px-5 space-y-3">
        <Card class="p-4 flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-[12px] text-ink-3">网关地址</div>
            <div class="font-mono text-[14px] truncate">{gatewayBase()}</div>
          </div>
          <IconButton label="复制网关地址" onClick={() => copyText(gatewayBase(), '网关地址已复制')}><IcCopy size={18} /></IconButton>
        </Card>

        {list === null ? [0, 1].map(i => <Skeleton key={i} h={112} />)
          : list.length === 0 ? <Empty title="还没有密钥" hint="生成一把密钥，给 IDE 或脚本调用网关" />
          : list.map((k, i) => (
            <Card key={k.id} class="p-4 anim-rise" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <div class="flex items-start gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-[16px] font-semibold truncate">{k.name}</div>
                  <div class="text-[13px] text-ink-3 font-mono mt-0.5">{k.prefix}…</div>
                </div>
                {isAdmin() && <Switch label={`${k.enabled ? '停用' : '启用'} ${k.name}`} checked={k.enabled} onChange={(v) => setEnabled(k, v)} />}
              </div>
              <div class="flex items-center gap-1.5 mt-3 flex-wrap">
                <Pill tone={k.enabled ? 'ok' : 'mute'} dot>{k.enabled ? '启用' : '停用'}</Pill>
                {k.realm && <Pill tone="info">{k.realm === 'global' ? '国际版' : '国内版'}</Pill>}
                <Pill tone="mute">{k.models.length ? `${k.models.length} 个模型` : '全部模型'}</Pill>
                {k.from_packet && <Pill tone="warn">红包</Pill>}
                <span class="flex-1" />
                {isAdmin() && <button aria-label={`${k.name} 更多操作`} class="press w-9 h-9 -mr-1 rounded-full grid place-items-center text-ink-3" onClick={() => setMore(k)}><IcMore size={20} /></button>}
              </div>
              <div class="text-[12px] text-ink-3 mt-2.5 tabular-nums">已用 {fmtNum(k.used_tokens)} tokens · {fmtNum(k.used_credit)} credit · {fmtAgo(k.last_used_at)}</div>
            </Card>
          ))}
        <div class="h-16" aria-hidden="true" />
      </div>

      {isAdmin() && (
        <button aria-label="生成密钥" onClick={() => setCreating(true)}
          class="press fixed right-5 z-30 w-14 h-14 rounded-[20px] bg-primary text-on-primary grid place-items-center shadow-[0_8px_30px_rgba(0,0,0,.35)]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}>
          <IcPlus size={26} stroke={2.4} />
        </button>
      )}

      <CreateSheet open={creating} onClose={() => setCreating(false)} onCreated={(k) => { setCreating(false); setCreated(k); load() }} />
      <RevealSheet k={created} onClose={() => setCreated(null)} />
      <Sheet open={!!more} onClose={() => { setMore(null); setConfirmDel(false) }} title={more?.name}>
        {more && (
          <div class="pb-2">
            <ActionRow icon={<IcCopy size={20} />} label="复制前缀" onClick={() => { copyText(more.prefix, '前缀已复制'); setMore(null) }} />
            {!confirmDel
              ? <ActionRow icon={<IcTrash size={20} />} label="删除密钥" tone="bad" onClick={() => setConfirmDel(true)} />
              : <div class="rounded-2xl bg-bad-soft p-4">
                  <div class="text-bad font-semibold text-[15px]">确定删除「{more.name}」？</div>
                  <div class="text-[13px] text-ink-2 mt-1">使用这把密钥的客户端会立即失效，无法恢复。</div>
                  <div class="grid grid-cols-2 gap-2 mt-3">
                    <Button tone="ghost" onClick={() => setConfirmDel(false)}>取消</Button>
                    <Button tone="danger" onClick={() => remove(more)}>删除</Button>
                  </div>
                </div>}
          </div>
        )}
      </Sheet>
    </div>
  )
}
