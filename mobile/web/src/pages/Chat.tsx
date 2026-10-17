import { signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { API, api } from '../api/client'
import { readSSE, type Usage } from '../api/sse'
import { isAdmin } from '../stores/session'
import { copyText, haptic, toast } from '../stores/toast'
import { keyboardOpen } from '../stores/router'
import { Field, Pill, Sheet, Switch, fmtNum, inputCls } from '../ui/kit'
import { IcBrain, IcChevronDown, IcRefresh, IcSend, IcSliders, IcStop } from '../ui/icons'
import { renderMarkdown } from '../ui/markdown'

type Model = { id: string; name: string; efforts: string[]; series: string }
type Msg = {
  role: 'user' | 'assistant'; content: string; reasoning?: string
  meta?: { ttft?: number; total?: number; usage?: Usage; model?: string; error?: string }
}
type Params = { realm: 'cn' | 'global'; model: string; effort: string; temperature: string; max_tokens: string; stream: boolean }

const STORE = 'wbm.chat.v1'
const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} } })()
const msgs = signal<Msg[]>(Array.isArray(saved.msgs) ? saved.msgs.slice(-60) : [])
const params = signal<Params>({ realm: 'global', model: '', effort: '', temperature: '', max_tokens: '', stream: true, ...(saved.params || {}) })
const models = signal<Record<string, Model[]>>({})
const busy = signal(false)

function persist() {
  try { localStorage.setItem(STORE, JSON.stringify({ msgs: msgs.value.slice(-60), params: params.value })) } catch { /* 隐私模式 */ }
}

async function loadModels(realm: 'cn' | 'global') {
  if (models.value[realm]) return
  try {
    const d = await api<{ models: Model[] }>(`/models?realm=${realm}`)
    models.value = { ...models.value, [realm]: d.models }
    if (params.value.realm === realm && !d.models.some(m => m.id === params.value.model)) {
      params.value = { ...params.value, model: d.models[0]?.id || '', effort: '' }
    }
  } catch (e: any) { toast(e.message, 'bad') }
}

function Bubble({ m, live }: { m: Msg; live: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null)
  if (m.role === 'user') {
    return (
      <div class="flex justify-end anim-rise">
        <div class="max-w-[82%] bg-primary text-on-primary rounded-[22px] rounded-br-md px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap break-words"
          onContextMenu={(e) => { e.preventDefault(); copyText(m.content) }}>{m.content}</div>
      </div>
    )
  }
  const thinkingOpen = open ?? (live && !m.content)
  const u = m.meta?.usage
  return (
    <div class="anim-rise">
      <div class="max-w-[92%] bg-card border border-line/60 rounded-[22px] rounded-bl-md px-4 py-3">
        {m.reasoning && (
          <div class="mb-2">
            <button class="press inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3" onClick={() => setOpen(!thinkingOpen)} aria-expanded={thinkingOpen}>
              <IcBrain size={15} />
              {live && !m.content ? '思考中…' : `思考过程 · ${Array.from(m.reasoning).length} 字`}
              <IcChevronDown size={15} class={`transition-transform ${thinkingOpen ? 'rotate-180' : ''}`} />
            </button>
            {thinkingOpen && <div class="mt-1.5 pl-3 border-l-2 border-line text-[13px] leading-5 text-ink-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{m.reasoning}</div>}
          </div>
        )}
        {m.content
          ? <div class="md text-[15px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} onContextMenu={(e) => { e.preventDefault(); copyText(m.content) }} />
          : !m.reasoning && live ? <div class="flex gap-1 py-2">{[0, 1, 2].map(i => <span key={i} class="w-2 h-2 rounded-full bg-ink-3 dot-live" style={{ animationDelay: `${i * 0.2}s` }} />)}</div> : null}
        {m.meta?.error && <div class="text-bad text-[14px] mt-1">{m.meta.error}</div>}
      </div>
      {m.meta && !live && (m.meta.total || u) && (
        <div class="text-[11px] text-ink-3 mt-1.5 ml-2 tabular-nums flex flex-wrap gap-x-2.5">
          {m.meta.ttft !== undefined && <span>首字 {m.meta.ttft} ms</span>}
          {m.meta.total !== undefined && <span>耗时 {(m.meta.total / 1000).toFixed(1)} s</span>}
          {u && <span>{fmtNum(u.prompt_tokens || 0)} → {fmtNum(u.completion_tokens || 0)} tokens</span>}
          {u?.credit !== undefined && <span>{u.credit} credit</span>}
        </div>
      )}
    </div>
  )
}

export function Chat() {
  const [text, setText] = useState('')
  const [pick, setPick] = useState(false)
  const [tune, setTune] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const [kbInset, setKbInset] = useState(0)

  useEffect(() => { loadModels(params.value.realm) }, [params.value.realm])

  // 输入框贴在软键盘上方：用 visualViewport 计算被键盘遮住的高度
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const on = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKbInset(inset)
      keyboardOpen.value = inset > 80
    }
    vv.addEventListener('resize', on); vv.addEventListener('scroll', on)
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); keyboardOpen.value = false }
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs.value])

  useEffect(() => () => abort.current?.abort(), [])

  function patchLast(fn: (m: Msg) => Msg) {
    const arr = msgs.value.slice()
    arr[arr.length - 1] = fn(arr[arr.length - 1])
    msgs.value = arr
  }

  async function send() {
    const q = text.trim()
    const p = params.value
    if (!q || busy.value) return
    if (!p.model) { toast('先选择一个模型', 'bad'); setPick(true); return }
    setText('')
    if (ta.current) ta.current.style.height = ''
    haptic(5)
    const history = [...msgs.value, { role: 'user', content: q } as Msg]
    msgs.value = [...history, { role: 'assistant', content: '', reasoning: '', meta: { model: p.model } }]
    busy.value = true
    const ctl = new AbortController()
    abort.current = ctl
    const t0 = performance.now()
    let ttft: number | undefined
    const mark = () => { if (ttft === undefined) ttft = Math.round(performance.now() - t0) }
    try {
      const body: Record<string, unknown> = {
        model: p.model, realm: p.realm, stream: p.stream,
        messages: history.filter(m => m.content).slice(-40).map(m => ({ role: m.role, content: m.content })),
      }
      if (p.effort) body.reasoning_effort = p.effort
      if (p.temperature !== '') body.temperature = Number(p.temperature)
      if (p.max_tokens !== '') body.max_tokens = Number(p.max_tokens)
      const res = await fetch(`${API}/chat`, {
        method: 'POST', credentials: 'same-origin', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let msg = `请求失败（${res.status}）`
        try { const j = await res.json(); if (j?.detail) msg = j.detail } catch { /* ignore */ }
        throw new Error(msg)
      }
      await readSSE(res, {
        onReasoning: (t) => { mark(); patchLast(m => ({ ...m, reasoning: (m.reasoning || '') + t })) },
        onContent: (t) => { mark(); patchLast(m => ({ ...m, content: m.content + t })) },
        onUsage: (u) => patchLast(m => ({ ...m, meta: { ...m.meta, usage: u } })),
      })
    } catch (e: any) {
      const stopped = e?.name === 'AbortError'
      patchLast(m => ({ ...m, meta: { ...m.meta, error: stopped ? '已停止' : e.message } }))
    } finally {
      patchLast(m => ({ ...m, meta: { ...m.meta, ttft, total: Math.round(performance.now() - t0) } }))
      busy.value = false
      abort.current = null
      persist()
    }
  }

  const p = params.value
  const list = models.value[p.realm] || []
  const cur = list.find(m => m.id === p.model)
  const efforts = cur?.efforts || []
  const bottom = kbInset > 80 ? kbInset + 8 : 0

  return (
    <div class="fixed inset-0 flex flex-col">
      <header class="pt-safe px-4 pb-2.5 glass border-b border-line/40 flex items-center gap-2 z-20">
        <button class="press flex-1 min-w-0 h-11 px-4 rounded-full bg-card border border-line/70 flex items-center gap-2" onClick={() => setPick(true)}>
          <Pill tone={p.realm === 'global' ? 'info' : 'mute'}>{p.realm === 'global' ? '国际' : '国内'}</Pill>
          <span class="truncate font-semibold text-[15px]">{cur?.name || p.model || '选择模型'}</span>
          <IcChevronDown size={18} class="ml-auto text-ink-3 shrink-0" />
        </button>
        <button aria-label="参数" class="press w-11 h-11 rounded-full bg-card border border-line/70 grid place-items-center text-ink-2" onClick={() => setTune(true)}><IcSliders size={19} /></button>
        <button aria-label="新对话" disabled={busy.value} class="press w-11 h-11 rounded-full bg-card border border-line/70 grid place-items-center text-ink-2 disabled:opacity-40"
          onClick={() => { msgs.value = []; persist() }}><IcRefresh size={19} /></button>
      </header>

      <div ref={scroller} class="flex-1 overflow-y-auto px-4 pt-4 space-y-4" style={{ paddingBottom: bottom ? bottom + 84 : 'calc(env(safe-area-inset-bottom) + 184px)' }}>
        {!isAdmin() && <div class="text-center text-[13px] text-warn bg-warn-soft rounded-2xl px-4 py-3">调试台会真实消耗积分，仅管理员可用。</div>}
        {msgs.value.length === 0 && (
          <div class="text-center pt-16 px-6">
            <div class="text-[22px] font-bold">即时调试</div>
            <div class="text-ink-3 text-[14px] mt-2 leading-6">走默认上游，真实消耗积分。<br />流式输出、思维链与用量一目了然。</div>
            <div class="flex flex-wrap justify-center gap-2 mt-6">
              {['用一句话介绍你自己', '9.11 和 9.9 哪个大？', '写一个 Python 快速排序'].map(s => (
                <button key={s} class="press h-10 px-4 rounded-full bg-card border border-line/70 text-[14px] text-ink-2" onClick={() => { setText(s); ta.current?.focus() }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.value.map((m, i) => <Bubble key={i} m={m} live={busy.value && i === msgs.value.length - 1} />)}
      </div>

      <div class="fixed inset-x-0 z-30 px-3" style={{ bottom: bottom ? `${bottom}px` : 'calc(env(safe-area-inset-bottom) + 96px)' }}>
        <div class="glass border border-line/70 rounded-[26px] p-1.5 pl-4 flex items-end gap-2 shadow-[0_8px_30px_rgba(0,0,0,.25)]">
          <textarea ref={ta} rows={1} value={text} placeholder={isAdmin() ? '发消息…' : '仅管理员可用'} disabled={!isAdmin()}
            enterkeyhint="send"
            onInput={(e) => { const el = e.target as HTMLTextAreaElement; setText(el.value); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); send() } }}
            class="flex-1 resize-none bg-transparent outline-none text-[16px] leading-6 py-2.5 max-h-[140px] placeholder:text-ink-3" />
          {busy.value
            ? <button aria-label="停止生成" class="press w-11 h-11 rounded-full bg-ink text-bg grid place-items-center shrink-0" onClick={() => abort.current?.abort()}><IcStop size={18} /></button>
            : <button aria-label="发送" disabled={!text.trim()} class="press w-11 h-11 rounded-full bg-primary text-on-primary grid place-items-center shrink-0 disabled:opacity-40" onClick={send}><IcSend size={20} stroke={2.6} /></button>}
        </div>
      </div>

      <Sheet open={pick} onClose={() => setPick(false)} title="选择模型">
        <div class="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-card mb-3">
          {(['global', 'cn'] as const).map(r => (
            <button key={r} class={`press h-10 rounded-xl font-semibold text-[14px] ${p.realm === r ? 'bg-primary text-on-primary' : 'text-ink-2'}`}
              onClick={() => { params.value = { ...p, realm: r, model: (models.value[r] || [])[0]?.id || '', effort: '' }; loadModels(r) }}>
              {r === 'global' ? '国际版' : '国内版'}
            </button>
          ))}
        </div>
        <div class="pb-2 space-y-1.5">
          {list.length === 0 && <div class="text-ink-3 text-[14px] text-center py-6">加载中…</div>}
          {list.map(m => (
            <button key={m.id} onClick={() => { params.value = { ...p, model: m.id, effort: m.efforts.includes(p.effort) ? p.effort : '' }; persist(); setPick(false) }}
              class={`press w-full text-left px-4 py-3 rounded-2xl border ${m.id === p.model ? 'bg-primary-soft border-primary/50' : 'bg-card border-transparent'}`}>
              <div class="font-semibold text-[15px]">{m.name}</div>
              <div class="text-[12px] text-ink-3 font-mono mt-0.5">{m.id}{m.efforts.length ? ` · 推理 ${m.efforts.join('/')}` : ''}</div>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={tune} onClose={() => { setTune(false); persist() }} title="参数">
        <div class="pb-2">
          {efforts.length > 0 && (
            <Field label="推理强度">
              <div class="flex flex-wrap gap-2">
                {['', ...efforts].map(e => (
                  <button key={e || 'auto'} onClick={() => { params.value = { ...p, effort: e } }}
                    class={`press h-9 px-3.5 rounded-full text-[13px] font-semibold border ${p.effort === e ? 'bg-primary-soft text-primary border-primary/50' : 'bg-card text-ink-2 border-line'}`}>{e || '默认'}</button>
                ))}
              </div>
            </Field>
          )}
          <div class="grid grid-cols-2 gap-3">
            <Field label="temperature"><input class={inputCls} inputMode="decimal" placeholder="默认" value={p.temperature} onInput={(e) => { params.value = { ...p, temperature: (e.target as HTMLInputElement).value.replace(/[^\d.]/g, '') } }} /></Field>
            <Field label="max_tokens"><input class={inputCls} inputMode="numeric" placeholder="默认" value={p.max_tokens} onInput={(e) => { params.value = { ...p, max_tokens: (e.target as HTMLInputElement).value.replace(/\D/g, '') } }} /></Field>
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-card px-4 h-14">
            <span class="font-medium">流式输出</span>
            <Switch label="流式输出" checked={p.stream} onChange={(v) => { params.value = { ...p, stream: v } }} />
          </div>
        </div>
      </Sheet>
    </div>
  )
}
