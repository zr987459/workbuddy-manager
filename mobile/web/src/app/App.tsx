import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized } from '../lib/api';
import type { Me } from '../lib/types';
import { Login } from '../features/auth/Login';
import { Overview } from '../features/overview/Overview';
import { Accounts } from '../features/accounts/Accounts';
import { Keys } from '../features/keys/Keys';
import { Chat } from '../features/chat/Chat';
import { TabBar, type Tab } from '../ui/TabBar';

const TABS: Tab[] = ['overview', 'accounts', 'keys', 'chat'];
const fromHash = (): Tab => { const h = location.hash.slice(1) as Tab; return TABS.includes(h) ? h : 'overview'; };

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), retry: false, staleTime: Infinity });
  const [tab, setTab] = useState<Tab>(fromHash);
  // 切换身份时丢掉上一个身份的数据。不能 qc.clear()：那会把 ['me'] 的观察者一起拆掉，界面不再响应登录结果
  const resetData = () => qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });

  useEffect(() => onUnauthorized(() => { qc.setQueryData(['me'], null); }), [qc]);
  useEffect(() => { const f = () => setTab(fromHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (t: Tab) => { history.replaceState(null, '', `#${t}`); setTab(t); window.scrollTo(0, 0); };

  if (me.isPending) return <div className="grid h-full place-items-center text-ink-2">加载中…</div>;
  if (!me.data) return <Login onDone={(m) => { resetData(); qc.setQueryData(['me'], m); }} />;

  return (
    <>
      {tab === 'overview' && <Overview onOpenAccounts={() => go('accounts')} onLogout={async () => { await api.post('/auth/logout').catch(() => {}); resetData(); qc.setQueryData(['me'], null); }} />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'keys' && <Keys />}
      {tab === 'chat' && <Chat />}
      <TabBar tab={tab} onChange={go} />
    </>
  );
}
