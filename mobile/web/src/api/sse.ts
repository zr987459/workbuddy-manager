/** 解析 OpenAI 兼容的 SSE 流：分别回调思维链、正文与用量。 */
export type Usage = { prompt_tokens?: number; completion_tokens?: number; credit?: number }

export type StreamHandlers = {
  onReasoning?: (t: string) => void
  onContent?: (t: string) => void
  onUsage?: (u: Usage) => void
}

export async function readSSE(res: Response, h: StreamHandlers): Promise<void> {
  const ctype = res.headers.get('content-type') || ''
  if (!ctype.includes('event-stream')) {
    // 非流式：一次性 JSON
    const j = await res.json()
    const msg = j?.choices?.[0]?.message || {}
    if (msg.reasoning_content) h.onReasoning?.(msg.reasoning_content)
    if (msg.content) h.onContent?.(msg.content)
    if (j?.usage) h.onUsage?.(j.usage)
    return
  }
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        let j: any
        try { j = JSON.parse(data) } catch { continue }
        if (j?.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message || '上游返回错误')
        const d = j?.choices?.[0]?.delta || {}
        const think = d.reasoning_content ?? d.reasoning ?? d.thinking
        if (think) h.onReasoning?.(String(think))
        if (d.content) h.onContent?.(String(d.content))
        if (j?.usage) h.onUsage?.(j.usage)
      }
    }
  }
}
