export type Realm = 'global' | 'cn';
export type Pill = 'ok' | 'busy' | 'cooling' | 'paused' | 'expired' | 'banned' | 'invalid' | 'offline';

export interface PoolCounts extends Record<Pill, number> {total: number; usable: number}

export interface Overview {
  realm: Realm;
  at: number;
  gateway: {state: 'ok' | 'degraded' | 'down'; label: string; detail: string} | null;
  inflight: number | null;
  today: {requests: number; tokens: number; credit: number; failures: number; success_rate: number | null} | null;
  week: {requests: number; tokens: number} | null;
  top_model: string | null;
  active_keys: number | null;
  pool: PoolCounts | null;
  recent_errors: {id: number; ts: number; status: number; model: string; key: string; error: string}[] | null;
  errors: Record<string, string>;
}

export interface AccountCard {
  id: string; file: string; uid: string; name: string; realm: Realm; note: string;
  pill: Pill; reason: string; enabled: boolean; in_flight: number;
  success: number | null; errors: number | null; last_error: string; weight: number;
  token: {expires_at: number; remain_seconds: number; ratio: number | null};
}

export interface KeyCard {
  id: number; name: string; prefix: string; enabled: boolean; models: string[]; realm: string;
  quota: number; used_tokens: number; usage_ratio: number | null; used_credit: number;
  expires_at: number | null; last_used_at: number | null; created_at: number | null; from_packet: boolean;
}

export interface ModelInfo {id: string; name: string; efforts: string[]; series: string}

export interface Me {username: string; role: 'admin' | 'viewer'}
