import {useEffect, useState} from 'react';

/** 极简 History 路由：四个 Tab + 设置/登录，用不着引入路由库。 */
const listeners = new Set<() => void>();
export function go(path: string, replace = false) {
  if (location.pathname === path) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  listeners.forEach((f) => f());
  window.scrollTo(0, 0);
}
export function usePath(): string {
  const [p, setP] = useState(location.pathname);
  useEffect(() => {
    const f = () => setP(location.pathname);
    listeners.add(f);
    window.addEventListener('popstate', f);
    return () => { listeners.delete(f); window.removeEventListener('popstate', f); };
  }, []);
  return p;
}
