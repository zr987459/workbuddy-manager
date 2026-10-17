// 统一请求封装：同源 Cookie 会话；写操作带 X-WBM 头（防 CSRF）；401 广播给外壳回到登录页。
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const listeners = new Set<() => void>();
export const onUnauthorized = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

async function parse(res: Response) {
  if (res.status === 401) listeners.forEach((f) => f());
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = (data && typeof data === 'object' && 'detail' in data) ? String((data as { detail: unknown }).detail) : `请求失败（${res.status}）`;
    throw new ApiError(res.status, detail);
  }
  return data;
}

export function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-WBM'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`/m/api${path}`, {
    method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body), ...init,
  }).then(parse) as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};
