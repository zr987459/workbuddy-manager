import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// 模型输出里的原始 HTML 一律按文本显示，根本不生成元素。
// 只靠 DOMPurify 也不会执行脚本，但解析阶段 <img onerror> 仍会触发一次被 CSP 拦下的尝试；
// 在 Markdown 层就转义掉，连这一次都没有。
marked.use({
  renderer: {
    html(token: { text: string }) { return esc(token.text) },
  },
})

// 所有链接新开且断开 opener；只放行 http(s) / mailto
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || ''
    if (!/^(https?:|mailto:)/i.test(href)) node.removeAttribute('href')
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  }
})

/** 模型输出 → 安全 HTML。禁止图片（防外链追踪）、表单、样式与任何脚本。 */
export function renderMarkdown(src: string): string {
  const html = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li',
      'a', 'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  })
}
