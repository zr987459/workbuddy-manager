import { useEffect } from 'preact/hooks'
import { api } from './api/client'
import { tab } from './stores/router'
import { session } from './stores/session'
import { TabBar } from './ui/TabBar'
import { Toasts } from './ui/kit'
import { Accounts } from './pages/Accounts'
import { Chat } from './pages/Chat'
import { Dashboard } from './pages/Dashboard'
import { Keys } from './pages/Keys'
import { Login } from './pages/Login'

export function App() {
  useEffect(() => {
    api('/auth/me').then(s => { session.value = s }).catch(() => { session.value = null })
  }, [])

  if (session.value === undefined) {
    return <div class="h-full grid place-items-center text-ink-3 text-[14px]">正在连接…</div>
  }
  if (session.value === null) return <><Login /><Toasts /></>

  const t = tab.value
  return (
    <>
      <main class={t === 'chat' ? '' : 'pb-tabbar'}>
        {t === 'dash' && <Dashboard />}
        {t === 'accounts' && <Accounts />}
        {t === 'keys' && <Keys />}
        {t === 'chat' && <Chat />}
      </main>
      <TabBar />
      <Toasts />
    </>
  )
}
