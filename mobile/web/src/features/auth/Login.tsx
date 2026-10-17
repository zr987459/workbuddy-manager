import {useEffect, useState} from 'react';
import {api, conn} from '../../lib/api';
import type {Me} from '../../lib/types';
import {useToast} from '../../ui/kit';

export default function Login({onDone}: {onDone: (me: Me) => void}) {
  const [mode, setMode] = useState<'password' | 'token'>(conn.token ? 'token' : 'password');
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [server, setServer] = useState(conn.server);
  const [token, setToken] = useState(conn.token);
  const [busy, setBusy] = useState(false);
  const [core, setCore] = useState<{reachable: boolean; error: string} | null>(null);
  const toast = useToast();

  useEffect(() => { api.meta().then((m) => setCore(m.core)).catch(() => setCore(null)); }, [server]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === 'token') {
        if (!token.startsWith('wbt_')) throw new Error('请填写管理面 API Token（wbt_ 开头）');
        conn.set(server, token);
        onDone(await api.me());
      } else {
        conn.set(server, '');
        const r = await api.login(username, password);
        onDone({username: r.username, role: r.role});
      }
    } catch (err) { toast((err as Error).message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-brand"><img src="/icon.svg" alt="" /><h1>WorkBuddy</h1><p className="muted">国际版网关 · 移动管理</p></div>
      {core && !core.reachable && <div className="banner banner-err">核心服务连不上：{core.error}</div>}
      <form className="login-form" onSubmit={submit}>
        <div className="seg">
          <button type="button" className={mode === 'password' ? 'active' : ''} onClick={() => setMode('password')}>账号密码</button>
          <button type="button" className={mode === 'token' ? 'active' : ''} onClick={() => setMode('token')}>API Token</button>
        </div>
        {mode === 'password' ? (
          <>
            <input className="input" autoComplete="username" placeholder="用户名" value={username} onChange={(e) => setU(e.target.value)} />
            <input className="input" type="password" autoComplete="current-password" placeholder="密码" value={password} onChange={(e) => setP(e.target.value)} />
          </>
        ) : (
          <>
            <input className="input" inputMode="url" placeholder="服务器地址（同源访问可留空）" value={server} onChange={(e) => setServer(e.target.value.trim())} />
            <input className="input mono" placeholder="wbt_..." value={token} onChange={(e) => setToken(e.target.value.trim())} />
            <p className="muted small">在桌面版「设置 → API Token」创建；App 内保存于本机。</p>
          </>
        )}
        <button className="btn filled block" disabled={busy}>{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  );
}
