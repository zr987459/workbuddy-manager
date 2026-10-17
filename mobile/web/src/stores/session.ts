import { signal } from '@preact/signals'

export type Session = { username: string; role: 'admin' | 'viewer' | string }

/** undefined = 还没探测；null = 未登录 */
export const session = signal<Session | null | undefined>(undefined)
export const isAdmin = () => session.value?.role === 'admin'
