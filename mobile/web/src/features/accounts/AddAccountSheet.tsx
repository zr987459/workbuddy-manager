import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { haptic } from '../../lib/device';
import { Sheet } from '../../ui/Sheet';
import { btnGhost, btnPrimary } from '../../ui/bits';
import { useToast } from '../../ui/Toast';

const REGIONS: [string, string][] = [['HK', '中国香港'], ['MO', '中国澳门'], ['SG', '新加坡'], ['TH', '泰国'], ['PH', '菲律宾'], ['MY', '马来西亚'], ['ID', '印度尼西亚']];
type Step = 'region' | 'authorize' | 'done';

// 国际版一键授权：选地区 → 本机打开 workbuddy.ai 授权 → 轮询 → 自动完成地区注册与 trial
export function AddAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('region');
  const [region, setRegion] = useState('');
  const [link, setLink] = useState<{ state: string; auth_url: string } | null>(null);
  const [result, setResult] = useState<{ nickname: string; note: string } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!open) { window.clearTimeout(timer.current); setStep('region'); setLink(null); setResult(null); setErr(''); }
  }, [open]);

  useEffect(() => {
    if (step !== 'authorize' || !link) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const r = await api.get<{ status: string; nickname: string; note: string; done: boolean }>(
          `/accounts/login/${encodeURIComponent(link.state)}?region=${region}`);
        if (r.status === 'success') {
          haptic(30); setResult({ nickname: r.nickname, note: r.note }); setStep('done');
          qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['overview'] });
          return;
        }
        if (r.done) { setErr(r.status === 'expired' ? '授权链接已过期，请重新开始' : `授权未完成（${r.status}）`); return; }
      } catch (x) { setErr(x instanceof ApiError ? x.message : '轮询失败'); return; }
      timer.current = window.setTimeout(tick, 2000);
    };
    // 授权页盖住本页时浏览器会节流定时器：回到页面立即补一次
    const wake = () => { if (!document.hidden) { window.clearTimeout(timer.current); tick(); } };
    tick();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => { stopped = true; window.clearTimeout(timer.current); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake); };
  }, [step, link, region, qc]);

  async function start() {
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ state: string; auth_url: string }>('/accounts/login', { region });
      if (!/^https:\/\//.test(r.auth_url)) throw new Error('授权链接无效');
      setLink(r); setStep('authorize');
    } catch (x) { setErr(x instanceof Error ? x.message : '获取授权链接失败'); toast('获取授权链接失败', 'bad'); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="添加国际版账号">
      {step === 'region' && (
        <>
          <p className="mb-3 text-sm text-ink-2">新账号需要先登记地区，否则聊天会报 14017。地区属于账号归属信息，请按实际选择。</p>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {REGIONS.map(([code, name]) => (
              <button key={code} onClick={() => setRegion(code)}
                className={`tap rounded-2xl border px-3 py-3 text-left ${region === code ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-surface-2'}`}>
                <div className="font-medium">{name}</div><div className="text-xs opacity-70">{code}</div>
              </button>
            ))}
          </div>
          {err && <p className="mb-3 text-sm text-bad">{err}</p>}
          <button className={btnPrimary} disabled={!region || busy} onClick={start}>{busy ? '获取中…' : '下一步：去授权'}</button>
        </>
      )}
      {step === 'authorize' && link && (
        <div className="space-y-4">
          <a href={link.auth_url} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} flex items-center justify-center gap-2`}>
            在 workbuddy.ai 授权 <ExternalLink size={18} />
          </a>
          <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
            {err ? <span className="text-bad">{err}</span> : <><Loader2 className="animate-spin" size={18} /> 授权完成后回到这里，会自动完成添加</>}
          </div>
          {err && <button className={btnGhost} onClick={() => { setStep('region'); setErr(''); }}>重新开始</button>}
        </div>
      )}
      {step === 'done' && result && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto text-ok" size={56} />
          <div className="text-lg font-semibold">已添加 {result.nickname}</div>
          {result.note && <p className="text-sm text-ink-2">{result.note}</p>}
          <button className={btnPrimary} onClick={onClose}>完成</button>
        </div>
      )}
    </Sheet>
  );
}
