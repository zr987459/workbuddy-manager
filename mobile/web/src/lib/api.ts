import type {AccountCard, KeyCard, Me, ModelInfo, Overview, PoolCounts, Realm} from './types';

/** APK 场景：服务器地址与 wbt_ token 存在本机；PWA 同源时两者都为空，走 cookie。 */
const LS_SERVER = 'wbm.server';
const LS_TOKEN = 'wbm.token';

export const conn = {
  get server() { return localStorage.getItem(LS_SERVER) || ''; },
  get token() { return localStorage.getItem(LS_TOKEN) || ''; },
  set(server: string, token: string) {
    server ? localStorage.setItem(LS_SERVER, server.replace(/\/+$/, '')) : localStorage.removeItem(LS_SERVER);
    token ? localStorage.setItem(LS_TOKEN, token) : localStorage.removeItem(LS_TOKEN);
  },
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

type Listener = () => void;
const unauthorized = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => { unauthorized.add(fn); return () => { unauthorized.delete(fn); }; };

export function url(path: string) { return `${conn.server}${path}`; }

export function headers(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  if (conn.token) h.set('Authorization', `Bearer ${conn.token}`);
  return h;
}

export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path), {
      method,
      credentials: 'include',
      signal,
      headers: headers(body !== undefined ? {'Content-Type': 'application/json'} : undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', '网络不可用，请检查连接');
  }
  if (res.status === 401) unauthorized.forEach((fn) => fn());
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (data as {error?: {code: string; message: string}})?.error;
    throw new ApiError(res.status, err?.code || 'http_' + res.status, err?.message || `请求失败（${res.status}）`);
  }
  return data as T;
}

function safeJson(t: string) { try { return JSON.parse(t); } catch { return {text: t}; } }

const q = (o: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && s.set(k, String(v)));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  meta: () => request<{version: string; realm: Realm; core: {reachable: boolean; latency_ms: number; error: string}}>('GET', '/m/api/meta'),
  login: (username: string, password: string) => request<Me & {ok: boolean}>('POST', '/m/api/auth/login', {username, password}),
  logout: () => request('POST', '/m/api/auth/logout'),
  me: () => request<Me>('GET', '/m/api/auth/me'),
  settings: () => request<{prefs: {realm: Realm}; core_url: string; version: string; user: Me}>('GET', '/m/api/settings'),
  saveSettings: (p: {realm?: Realm}) => request<{prefs: {realm: Realm}}>('PUT', '/m/api/settings', p),

  overview: (realm?: Realm) => request<Overview>('GET', '/m/api/overview' + q({realm})),

  accounts: (o: {realm?: Realm; pill?: string; q?: string} = {}) =>
    request<{realm: Realm; counts: PoolCounts; items: AccountCard[]; manageable: boolean; pool_available: boolean}>(
      'GET', '/m/api/accounts' + q(o)),
  toggleAccount: (file: string, enabled: boolean) =>
    request('POST', `/m/api/accounts/${encodeURIComponent(file)}/toggle`, {enabled}),
  refreshAccount: (file: string) => request<{ok?: boolean; message?: string}>('POST', `/m/api/accounts/${encodeURIComponent(file)}/refresh`),
  testAccount: (file: string) => request<{ok?: boolean; message?: string}>('POST', `/m/api/accounts/${encodeURIComponent(file)}/test`),
  startLogin: (region?: string, realm?: Realm) =>
    request<{state: string; auth_url: string; realm: Realm}>('POST', '/m/api/accounts/login', {region, realm}),
  pollLogin: (state: string, region?: string, realm?: Realm) =>
    request<{status: string; done: boolean; uid?: string; name?: string; message?: string}>(
      'GET', `/m/api/accounts/login/${encodeURIComponent(state)}` + q({region, realm})),

  keys: () => request<{items: KeyCard[]; total: number; enabled: number}>('GET', '/m/api/keys'),
  createKey: (b: {name: string; models: string[]; quota?: number}) =>
    request<{key: string; card: KeyCard; hint: {base_url: string}}>('POST', '/m/api/keys', b),
  updateKey: (id: number, b: Partial<Pick<KeyCard, 'name' | 'enabled' | 'models' | 'quota'>>) =>
    request<KeyCard>('PATCH', `/m/api/keys/${id}`, b),
  deleteKey: (id: number) => request('DELETE', `/m/api/keys/${id}`),
  models: (realm?: Realm) => request<{realm: Realm; models: ModelInfo[]}>('GET', '/m/api/chat/models' + q({realm})),
};
