import {ApiError, headers, url} from './api';

export interface ChatDelta {content?: string; reasoning?: string; usage?: Record<string, number>; done?: boolean}

/** 解析 OpenAI 风格 SSE（data: {...}\n\n），逐帧回调。EventSource 不支持 POST，所以手写。 */
export async function streamChat(body: unknown, onDelta: (d: ChatDelta) => void, signal: AbortSignal) {
  const res = await fetch(url('/m/api/chat'), {
    method: 'POST', credentials: 'include', signal,
    headers: headers({'Content-Type': 'application/json', Accept: 'text/event-stream'}),
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    throw new ApiError(res.status, j?.error?.code || 'chat_failed', j?.error?.message || `对话失败（${res.status}）`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    buf += dec.decode(value, {stream: true});
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { onDelta({done: true}); return; }
        try {
          const j = JSON.parse(data);
          if (j.error) throw new ApiError(502, 'upstream', j.error.message || String(j.error));
          const d = j.choices?.[0]?.delta || {};
          onDelta({
            content: d.content || undefined,
            reasoning: d.reasoning_content || d.reasoning || undefined,
            usage: j.usage || undefined,
          });
        } catch (e) {
          if (e instanceof ApiError) throw e;
        }
      }
    }
  }
  onDelta({done: true});
}

/** 概览 SSE（GET 可用 EventSource；带 Bearer 的 APK 场景回退为轮询）。 */
export function liveOverview<T>(path: string, onData: (d: T) => void, onError: (m: string) => void): () => void {
  if (localStorage.getItem('wbm.token')) {
    let stop = false;
    const tick = async () => {
      while (!stop) {
        try {
          const r = await fetch(url(path.replace('/live', '/overview')), {headers: headers(), credentials: 'include'});
          if (r.ok) onData(await r.json()); else onError(`HTTP ${r.status}`);
        } catch { onError('网络中断'); }
        await new Promise((r) => setTimeout(r, 5000));
      }
    };
    tick();
    return () => { stop = true; };
  }
  const es = new EventSource(url(path), {withCredentials: true});
  es.addEventListener('overview', (e) => onData(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('error', (e) => {
    const d = (e as MessageEvent).data;
    onError(d ? JSON.parse(d).message : '实时连接中断，正在重连…');
  });
  return () => es.close();
}
