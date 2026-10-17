import {useEffect, useRef, useState} from 'react';
import {api} from '../../lib/api';
import {copy, haptic} from '../../lib/device';
import {useAsync} from '../../lib/hooks';
import {streamChat} from '../../lib/sse';
import type {ModelInfo} from '../../lib/types';
import {ErrorBanner, Segmented, Sheet, useToast} from '../../ui/kit';
import {IconBrain, IconChevron, IconCopy, IconSend, IconStop} from '../../ui/Icons';

interface Msg {
  id: number; role: 'user' | 'assistant'; content: string; reasoning?: string;
  meta?: {ttft?: number; total?: number; pt?: number; ct?: number; credit?: number}; error?: string; thinkingMs?: number;
}

const LS = 'wbm.chat';
const load = (): {model: string; effort: string; msgs: Msg[]} => {
  try { return {model: '', effort: '', msgs: [], ...JSON.parse(localStorage.getItem(LS) || '{}')}; } catch { return {model: '', effort: '', msgs: []}; }
};

export default function Chat() {
  const saved = useRef(load()).current;
  const models = useAsync(() => api.models().then((r) => r.models));
  const [model, setModel] = useState(saved.model);
  const [effort, setEffort] = useState(saved.effort);
  const [msgs, setMsgs] = useState<Msg[]>(saved.msgs);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => { if (!model && models.data?.length) setModel(models.data[0].id); }, [models.data, model]);
  useEffect(() => { localStorage.setItem(LS, JSON.stringify({model, effort, msgs: msgs.slice(-40)})); }, [model, effort, msgs]);
  useEffect(() => { end.current?.scrollIntoView({block: 'end'}); }, [msgs]);

  const current: ModelInfo | undefined = models.data?.find((m) => m.id === model);
  const efforts = current?.efforts || [];

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !model) return;
    haptic();
    const user: Msg = {id: Date.now(), role: 'user', content: text};
    const bot: Msg = {id: Date.now() + 1, role: 'assistant', content: '', reasoning: ''};
    const history = [...msgs, user];
    setMsgs([...history, bot]); setInput(''); setBusy(true);
    const ctl = new AbortController(); abort.current = ctl;
    const t0 = performance.now(); let ttft: number | undefined; let thinkStart: number | undefined; let thinkEnd: number | undefined;
    const patch = (f: (m: Msg) => Msg) => setMsgs((s) => s.map((m) => (m.id === bot.id ? f(m) : m)));
    try {
      await streamChat({
        model, reasoning_effort: efforts.includes(effort) ? effort : '',
        messages: history.filter((m) => !m.error).map((m) => ({role: m.role, content: m.content})),
      }, (d) => {
        if (d.reasoning) { thinkStart ??= performance.now(); ttft ??= performance.now() - t0; patch((m) => ({...m, reasoning: (m.reasoning || '') + d.reasoning})); }
        if (d.content) {
          ttft ??= performance.now() - t0;
          if (thinkStart && !thinkEnd) thinkEnd = performance.now();
          patch((m) => ({...m, content: m.content + d.content}));
        }
        if (d.usage) patch((m) => ({...m, meta: {...m.meta, pt: d.usage!.prompt_tokens, ct: d.usage!.completion_tokens, credit: d.usage!.credit}}));
        if (d.done) patch((m) => ({...m, thinkingMs: thinkStart ? (thinkEnd ?? performance.now()) - thinkStart : undefined, meta: {...m.meta, ttft, total: performance.now() - t0}}));
      }, ctl.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') patch((m) => ({...m, error: (e as Error).message}));
      else patch((m) => ({...m, meta: {...m.meta, ttft, total: performance.now() - t0}, error: m.content ? undefined : '已停止'}));
    } finally { setBusy(false); abort.current = null; }
  };

  return (
    <div className="chat">
      <header className="chat-head">
        <button className="model-pill" onClick={() => setPick(true)}>
          <span className="ellipsis">{current?.name || model || '选择模型'}</span><IconChevron width={16} />
        </button>
        {msgs.length > 0 && <button className="btn-text" onClick={() => { abort.current?.abort(); setMsgs([]); }}>新对话</button>}
      </header>
      {models.error && <ErrorBanner message={`模型列表：${models.error}`} onRetry={models.reload} />}
      <div className="chat-list">
        {msgs.length === 0 && <div className="chat-empty"><IconBrain width={40} height={40} /><p>发一句话，验证模型输出与思维链</p></div>}
        {msgs.map((m) => <Bubble key={m.id} m={m} streaming={busy && m === msgs[msgs.length - 1]} onCopy={() => copy(m.content).then(() => toast('已复制', 'ok'))} />)}
        <div ref={end} />
      </div>
      <div className="composer">
        <textarea rows={1} value={input} placeholder="输入消息…" enterKeyHint="send"
          onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        {busy
          ? <button className="send stop" aria-label="停止" onClick={() => abort.current?.abort()}><IconStop /></button>
          : <button className="send" aria-label="发送" disabled={!input.trim() || !model} onClick={send}><IconSend /></button>}
      </div>
      <Sheet open={pick} onClose={() => setPick(false)} title="模型与思考强度">
        {efforts.length > 0 && (
          <>
            <label className="field-label">思考强度</label>
            <Segmented value={efforts.includes(effort) ? effort : ''} onChange={setEffort}
              options={[{value: '', label: '默认'}, ...efforts.map((e) => ({value: e, label: e}))]} />
          </>
        )}
        <label className="field-label">模型</label>
        <div className="model-list">
          {models.data?.map((m) => (
            <button key={m.id} className={`model-item ${m.id === model ? 'on' : ''}`} onClick={() => { setModel(m.id); setPick(false); }}>
              <span>{m.name}</span><small className="muted">{m.efforts.length ? '支持推理' : m.series}</small>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Bubble({m, streaming, onCopy}: {m: Msg; streaming: boolean; onCopy: () => void}) {
  const [open, setOpen] = useState(false);
  if (m.role === 'user') return <div className="bubble user">{m.content}</div>;
  return (
    <div className="bubble bot">
      {m.reasoning ? (
        <div className={`think ${open ? 'open' : ''}`}>
          <button className="think-head" onClick={() => setOpen(!open)}>
            <IconBrain width={16} />
            {m.thinkingMs ? `思考了 ${(m.thinkingMs / 1000).toFixed(1)} 秒` : streaming && !m.content ? '思考中…' : '思考过程'}
            <IconChevron width={14} className="chev" />
          </button>
          {open && <pre className="think-body">{m.reasoning}</pre>}
        </div>
      ) : null}
      <div className="content">{m.content || (streaming && !m.reasoning ? <span className="typing"><i /><i /><i /></span> : null)}</div>
      {m.error && <div className="bubble-err">{m.error}</div>}
      {m.meta?.total !== undefined && (
        <div className="meta">
          {m.meta.ttft !== undefined && <span>首字 {Math.round(m.meta.ttft)}ms</span>}
          <span>总 {(m.meta.total / 1000).toFixed(1)}s</span>
          {m.meta.ct !== undefined && <span>{m.meta.pt}→{m.meta.ct} tok</span>}
          {m.meta.credit !== undefined && m.meta.credit !== null && <span>扣费 {m.meta.credit}</span>}
          {m.content && <button className="icon-btn sm" aria-label="复制" onClick={onCopy}><IconCopy width={14} /></button>}
        </div>
      )}
    </div>
  );
}
