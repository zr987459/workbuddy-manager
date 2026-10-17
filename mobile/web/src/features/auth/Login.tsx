import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Me } from '../../lib/types';
import { btnPrimary, inputCls } from '../../ui/bits';

export function Login({ onDone }: { onDone: (me: Me) => void }) {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api.post<{ username: string; role: string }>('/auth/login', { username, password });
      onDone({ username: r.username, role: r.role, via: 'session' });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : '登录失败');
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 pt-safe">
      <img src="/icon.svg" alt="" className="mb-6 size-16 rounded-2xl" />
      <h1 className="text-3xl font-bold tracking-tight">WorkBuddy</h1>
      <p className="mb-8 mt-1 text-ink-2">使用管理后台的账号登录</p>
      <form onSubmit={submit} className="space-y-3">
        <input className={inputCls} placeholder="用户名" autoComplete="username" autoCapitalize="off"
          value={username} onChange={(e) => setU(e.target.value)} required />
        <input className={inputCls} placeholder="密码" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setP(e.target.value)} required />
        {err && <p className="px-1 text-sm text-bad">{err}</p>}
        <button className={btnPrimary} disabled={busy}>{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  );
}
