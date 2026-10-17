/** 复制 + 触感反馈。APK（Capacitor）里 navigator.clipboard 同样可用（安全上下文）。 */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) return false;
  }
  haptic();
  return true;
}
export const haptic = (ms = 8) => navigator.vibrate?.(ms);
