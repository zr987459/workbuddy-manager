// OpenAI 兼容 SSE 解析：把字节流切成 data 帧，回调增量。
export interface Delta { content?: string; reasoning?: string; usage?: Record<string, number>; raw: string }

export async function readChatStream(res: Response, onDelta: (d: Delta) => void, signal?: AbortSignal) {
  if (!res.body) throw new Error('浏览器不支持流式响应');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    if (signal?.aborted) { await reader.cancel(); return; }
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          if (j.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message || '上游错误');
          const delta = j.choices?.[0]?.delta ?? {};
          onDelta({
            content: delta.content ?? undefined,
            reasoning: delta.reasoning_content ?? delta.reasoning ?? undefined,
            usage: j.usage ?? undefined,
            raw: data,
          });
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  }
}
