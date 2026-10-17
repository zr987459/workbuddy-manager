export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* iOS Safari 不支持，静默 */ }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 非安全上下文（http 局域网）没有 clipboard API：退回 execCommand
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) return false;
  }
  haptic(15);
  return true;
}
