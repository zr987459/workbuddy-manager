import { useState } from 'preact/hooks'
import { api } from '../api/client'
import { session } from '../stores/session'
import { Button, inputCls } from '../ui/kit'
import { IcZap } from '../ui/icons'

export function Login() {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: Event) {
    e.preventDefault()
    if (!u || !p) return
    setBusy(true); setErr('')
    try {
      session.value = await api('/auth/login', { method: 'POST', json: { username: u.trim(), password: p } })
    } catch (ex: any) {
      setErr(ex.message)
    } finally { setBusy(false) }
  }

  return (
    <div class="min-h-full flex flex-col justify-center px-6 pt-safe pb-10">
      <div class="anim-rise">
        <div class="w-16 h-16 rounded-[22px] bg-primary text-on-primary grid place-items-center mb-6 shadow-lg"><IcZap size={32} /></div>
        <h1 class="text-[32px] font-bold tracking-tight leading-tight">WorkBuddy</h1>
        <p class="text-ink-2 mt-1.5 mb-8 text-[15px]">用管理后台的账号登录，权限与审计和桌面端一致。</p>
        <form onSubmit={submit} class="space-y-3">
          <input class={inputCls} placeholder="用户名" autocomplete="username" autocapitalize="none"
            value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} />
          <input class={inputCls} placeholder="密码" type="password" autocomplete="current-password"
            value={p} onInput={(e) => setP((e.target as HTMLInputElement).value)} />
          {err && <div class="text-bad text-[14px] px-1" role="alert">{err}</div>}
          <Button type="submit" class="w-full mt-2" disabled={busy || !u || !p}>{busy ? '登录中…' : '登录'}</Button>
        </form>
      </div>
    </div>
  )
}
