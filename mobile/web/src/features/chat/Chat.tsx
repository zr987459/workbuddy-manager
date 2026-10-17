import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, Brain, ChevronDown, Copy, Square, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { copyText, haptic } from '../../lib/device';
import { readChatStream } from '../../lib/sse';
import type { ModelInfo } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { PageHeader } from '../../ui/bits';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  meta?: { ttft?: number; total?: number; pt?: number; ct?: number; credit?: number };
  error?: string;
}
const STORE = 'wbm.chat.v1';

function ThinkBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 rounded-2xl bg-surface-2/70 text-sm">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-ink-2" onClick={() => setOpen(!open)}>
        <Brain size={15} className={live ? 'animate-pulse text-primary' : ''} />
        <span className="flex-1 text-left">{live ? '思考中…' : `思考过程（${text.length} 字）`}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="whitespace-pre-wrap border-t border-line px-3 py-2 text-ink-2">{text}</div>}
    </div>
  );
}

export function Chat() {
  const models = useQuery({ queryKey: ['chat-models'], queryFn: () => api.get<{ models: ModelInfo[] }>('/chat/models'), staleTime: 300_000 });
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [picking, setPicking] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const list = models.data?.models ?? [];
  const current = list.find((m) => m.id === model);
  useEffect(() => { if (!model && list.length) setModel(list[0].id); }, [list, model]);
  useEffect(() => { if (!busy) localStorage.setItem(STORE, JSON.stringify(msgs.slice(-60))); }, [msgs, busy]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !model) return;
    haptic();
    const history: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs([...history, { role: 'assistant', content: '', reasoning: '' }]);
    setInput(''); setBusy(true);
    const ac = new AbortController(); abort.current = ac;
    const t0 = performance.now(); let ttft: number | undefined;
    const patch = (fn: (m: Msg) => Msg) => setMsgs((xs) => { const ys = xs.slice(); ys[ys.length - 1] = fn(ys[ys.length - 1]); return ys; });
    try {
      const res = await fetch('/m/api/chat', {
        method: 'POST', signal: ac.signal, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-WBM': '1' },
        body: JSON.stringify({ model, reasoning_effort: effort, realm: 'global', messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new ApiError(res.status, j.detail || `请求失败（${res.status}）`); }
      await readChatStream(res, (d) => {
        if (ttft === undefined && (d.content || d.reasoning)) ttft = performance.now() - t0;
        patch((m) => ({
          ...m,
          content: m.content + (d.content ?? ''),
          reasoning: (m.reasoning ?? '') + (d.reasoning ?? ''),
          meta: d.usage ? { ...m.meta, pt: d.usage.prompt_tokens, ct: d.usage.completion_tokens, credit: d.usage.credit } : m.meta,
        }));
      }, ac.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') patch((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      patch((m) => ({ ...m, meta: { ...m.meta, ttft: ttft && Math.round(ttft), total: Math.round(performance.now() - t0) } }));
      setBusy(false); abort.current = null;
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader title="对话"
        action={<div className="flex gap-2">
          <button className="tap flex max-w-[52vw] items-center gap-1 rounded-full bg-surface-2 px-3 py-2 text-sm" onClick={() => setPicking(true)}>
            <span className="truncate">{current?.name ?? (models.isPending ? '加载中…' : '选择模型')}</span><ChevronDown size={15} />
          </button>
          <button className="tap grid size-9 place-items-center rounded-full bg-surface-2" aria-label="清空" onClick={() => { if (!busy) setMsgs([]); }}><Trash2 size={16} /></button>
        </div>} />

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!msgs.length && <div className="mt-16 text-center text-ink-2"><p className="text-lg font-medium text-ink">即时验证模型输出</p><p className="mt-1 text-sm">走与网关相同的账号池与计量</p></div>}
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} className="flex justify-end"><div className="max-w-[82%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-on-primary">{m.content}</div></div>
        ) : (
          <div key={i} className="max-w-[92%]">
            {!!m.reasoning && <ThinkBlock text={m.reasoning} live={busy && i === msgs.length - 1 && !m.content} />}
            <div className="whitespace-pre-wrap break-words rounded-3xl rounded-bl-lg bg-surface px-4 py-2.5 border border-line">
              {m.content || (m.error ? '' : <span className="inline-flex gap-1"><i className="size-1.5 animate-bounce rounded-full bg-ink-2" /><i className="size-1.5 animate-bounce rounded-full bg-ink-2 [animation-delay:.15s]" /><i className="size-1.5 animate-bounce rounded-full bg-ink-2 [animation-delay:.3s]" /></span>)}
              {m.error && <span className="text-bad">{m.error}</span>}
            </div>
            {m.meta?.total != null && (
              <div className="mt-1 flex items-center gap-3 px-2 text-[11px] text-ink-2 tabular-nums">
                {m.meta.ttft != null && <span>首字 {m.meta.ttft}ms</span>}<span>共 {(m.meta.total / 1000).toFixed(1)}s</span>
                {m.meta.pt != null && <span>{m.meta.pt}→{m.meta.ct} tok</span>}{m.meta.credit != null && <span>{m.meta.credit} 积分</span>}
                {m.content && <button aria-label="复制" onClick={async () => toast(await copyText(m.content) ? '已复制' : '复制失败', 'ok')}><Copy size={13} /></button>}
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* 输入栏：贴在胶囊底栏上方，随键盘上推（viewport interactive-widget=resizes-content） */}
      <div className="glass border-t border-line px-3 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
        <div className="flex items-end gap-2">
          <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入消息"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); send(); } }}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-primary" />
          {busy
            ? <button className="tap grid size-11 place-items-center rounded-full bg-ink text-bg" aria-label="停止" onClick={() => abort.current?.abort()}><Square size={16} fill="currentColor" /></button>
            : <button className="tap grid size-11 place-items-center rounded-full bg-primary text-on-primary disabled:opacity-40" aria-label="发送" disabled={!input.trim() || !model} onClick={send}><ArrowUp size={20} /></button>}
        </div>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="选择模型">
        <div className="space-y-2">
          {list.map((m) => (
            <button key={m.id} onClick={() => { setModel(m.id); setEffort(''); setPicking(false); }}
              className={`tap block w-full rounded-2xl border p-3 text-left ${m.id === model ? 'border-primary bg-primary/10' : 'border-line bg-surface-2'}`}>
              <div className="font-medium">{m.name}</div><div className="text-xs text-ink-2">{m.id}</div>
            </button>
          ))}
          {models.isError && <p className="text-sm text-bad">{(models.error as Error).message}</p>}
        </div>
        {!!current?.efforts.length && (
          <div className="mt-4">
            <div className="mb-2 text-sm font-medium">思考强度</div>
            <div className="flex flex-wrap gap-2">
              {['', ...current.efforts].map((e) => (
                <button key={e || 'default'} onClick={() => setEffort(e)} className={`tap rounded-full px-3 py-1.5 text-sm ${effort === e ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}>{e || '默认'}</button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
