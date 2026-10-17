export type Pill = 'ok' | 'cooling' | 'disabled' | 'expired' | 'error' | 'offline';

export interface Overview {
  state: 'ok' | 'degraded' | 'down';
  gateway: { core: boolean; upstream: boolean | null; detail: string };
  inflight: number | null;
  today: null | {
    requests: number; tokens: number; credit: number | null; failed: number;
    success_rate: number | null; top_model: string | null; active_keys: number;
  };
  pool: null | (Record<Pill, number> & { total: number });
}

export interface AccountCard {
  file: string; uid: string; nickname: string; note: string; realm: string;
  pill: Pill; reason: string; enabled: boolean; in_flight: number;
  success_count: number; err_total: number; last_err: string; token_remain_seconds: number;
}

export interface KeyCard {
  id: number; name: string; prefix: string; enabled: boolean; models: string[]; realm: string;
  quota: number; used_tokens: number; usage_ratio: number | null;
  expires_at: number | null; last_used_at: number | null; from_red_packet: boolean;
  secret?: string;
}

export interface ModelInfo { id: string; name: string; efforts: string[]; series?: string }
export interface Me { username: string; role: string; via: 'session' | 'token' }
