import {lazy, Suspense, useEffect, useState} from 'react';
import {api, onUnauthorized} from './lib/api';
import {go, usePath} from './lib/router';
import type {Me} from './lib/types';
import Login from './features/auth/Login';
import Overview from './features/overview/Overview';
import {Skeleton} from './ui/kit';
import {IconChat, IconKey, IconPulse, IconUsers} from './ui/Icons';

// 首屏只带概览；其它 Tab 按需加载
const Accounts = lazy(() => import('./features/accounts/Accounts'));
const Keys = lazy(() => import('./features/keys/Keys'));
const Chat = lazy(() => import('./features/chat/Chat'));
const Settings = lazy(() => import('./features/settings/Settings'));

const TABS = [
  {path: '/', label: '概览', Icon: IconPulse},
  {path: '/accounts', label: '账号', Icon: IconUsers},
  {path: '/keys', label: '密钥', Icon: IconKey},
  {path: '/chat', label: '对话', Icon: IconChat},
];

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const path = usePath();

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
    return onUnauthorized(() => setMe(null));
  }, []);

  if (me === undefined) return <div className="page"><Skeleton h={120} n={3} /></div>;
  if (me === null) return <Login onDone={(m) => { setMe(m); go('/', true); }} />;

  const page = path.startsWith('/accounts') ? <Accounts />
    : path.startsWith('/keys') ? <Keys />
    : path.startsWith('/chat') ? <Chat />
    : path.startsWith('/settings') ? <Settings onLogout={() => setMe(null)} />
    : <Overview />;

  return (
    <>
      <main className={path.startsWith('/chat') ? 'main main-chat' : 'main'}>
        <Suspense fallback={<div className="page"><Skeleton n={3} /></div>}>{page}</Suspense>
      </main>
      {!path.startsWith('/settings') && (
        <nav className="tabbar" aria-label="主导航">
          {TABS.map(({path: p, label, Icon}) => {
            const active = p === '/' ? path === '/' : path.startsWith(p);
            return (
              <button key={p} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => go(p)}>
                <Icon width={22} height={22} /><span>{label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}
