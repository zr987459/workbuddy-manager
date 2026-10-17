import { session } from '../stores/session'

export const API = `${import.meta.env.BASE_URL}api`

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const FALLBACK: Record<number, string> = {
  0: '网络不可用，请检查连接',
  401: '登录已失效，请重新登录',
  403: '没有权限执行此操作',
  429: '操作太频繁，请稍后再试',
  502: '上游线路不可用',
  503: '核心服务不可用',
  504: '核心服务响应超时',
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const headers = new Headers(rest.headers)
  if (json !== undefined) headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  let res: Response
  try {
    res = await fetch(API + path, {
      credentials: 'same-origin',
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError(0, FALLBACK[0])
  }
  if (res.status === 401 && !path.startsWith('/auth/login')) session.value = null
  if (!res.ok) {
    let msg = FALLBACK[res.status] || `请求失败（${res.status}）`
    try {
      const b = await res.json()
      if (typeof b?.detail === 'string' && b.detail) msg = b.detail
    } catch { /* 非 JSON */ }
    throw new ApiError(res.status, msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}
