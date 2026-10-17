import {useCallback, useEffect, useRef, useState} from 'react';

export interface Async<T> {data: T | null; error: string | null; loading: boolean; reload: () => Promise<void>; set: (d: T) => void}

/** 极简数据钩子：首屏加载、重新加载、错误保留旧数据（不把旧数字伪装成新数据——页面标注「刷新失败」）。 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await fnRef.current()); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return {data, error, loading, reload, set: setData};
}

/** 页面可见性：隐藏时停掉实时连接，省电省流量。 */
export function useVisible(): boolean {
  const [v, setV] = useState(!document.hidden);
  useEffect(() => {
    const f = () => setV(!document.hidden);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  return v;
}

/** 下拉刷新（触屏）。返回绑定到滚动容器的 ref 与当前下拉距离。 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let y0 = 0, active = false, dist = 0;
    const start = (e: TouchEvent) => { if (el.scrollTop <= 0) { y0 = e.touches[0].clientY; active = true; } };
    const move = (e: TouchEvent) => {
      if (!active) return;
      dist = Math.max(0, Math.min(120, (e.touches[0].clientY - y0) * 0.5));
      setPull(dist);
    };
    const end = async () => {
      if (!active) return;
      active = false;
      if (dist > 64) { setBusy(true); navigator.vibrate?.(10); await onRefresh(); setBusy(false); }
      dist = 0; setPull(0);
    };
    el.addEventListener('touchstart', start, {passive: true});
    el.addEventListener('touchmove', move, {passive: true});
    el.addEventListener('touchend', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); };
  }, [onRefresh]);
  return {ref, pull, busy};
}
