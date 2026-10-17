"""把 core 面向表格的数据裁剪成面向卡片的 DTO。纯函数，便于测试。"""
from __future__ import annotations

from typing import Any

# 胶囊枚举：前端只认这几个
PILL_OK, PILL_COOLING, PILL_DISABLED, PILL_EXPIRED, PILL_ERROR, PILL_OFFLINE = (
    'ok', 'cooling', 'disabled', 'expired', 'error', 'offline')


def account_pill(a: dict, pool_available: bool) -> tuple[str, str]:
    """(胶囊, 一句话原因)。优先级：人为停用 > 过期 > 无效 > 冷却 > 不在池 > 正常。"""
    if a.get('disabled_by_panel') or a.get('manual_disabled'):
        return PILL_DISABLED, str(a.get('manual_reason') or '已手动停用')
    if a.get('disabled'):
        return PILL_DISABLED, str(a.get('disabled_reason') or '被上游停用')
    if a.get('is_expired'):
        return PILL_EXPIRED, '登录已过期，需要重新授权'
    if a.get('invalid_reason'):
        return PILL_ERROR, str(a['invalid_reason'])
    if a.get('cooling'):
        sec = int(a.get('cool_remaining_sec') or 0)
        return PILL_COOLING, f'冷却中，还剩 {sec // 60}:{sec % 60:02d}' if sec else '冷却中'
    if pool_available and a.get('in_pool') is False:
        return PILL_OFFLINE, '未进入上游账号池'
    return PILL_OK, ''


def account_card(a: dict, pool_available: bool) -> dict:
    pill, reason = account_pill(a, pool_available)
    return {
        'file': a.get('file', ''),
        'uid': str(a.get('uid', '')),
        'nickname': a.get('nickname') or '未命名',
        'note': a.get('note') or '',
        'realm': a.get('realm') or '',
        'pill': pill,
        'reason': reason,
        'enabled': pill != PILL_DISABLED,
        'in_flight': int(a.get('in_flight') or 0),
        'success_count': int(a.get('success_count') or 0),
        'err_total': int(a.get('err_total') or 0),
        'last_err': a.get('last_err') or '',
        'token_remain_seconds': int(a.get('remain_seconds') or 0),
        'weight': a.get('weight'),
    }


def accounts_payload(core: dict) -> dict:
    pool = bool(core.get('pool_available'))
    cards = [account_card(a, pool) for a in core.get('accounts') or []]
    return {'pool_available': pool, 'manageable': bool(core.get('manageable', True)),
            'accounts': cards, 'counts': pool_counts(cards)}


def pool_counts(cards: list[dict]) -> dict:
    out = {k: 0 for k in (PILL_OK, PILL_COOLING, PILL_DISABLED, PILL_EXPIRED, PILL_ERROR, PILL_OFFLINE)}
    for c in cards:
        out[c['pill']] = out.get(c['pill'], 0) + 1
    out['total'] = len(cards)
    return out


def key_card(k: dict) -> dict:
    quota = int(k.get('quota') or 0)
    used = int(k.get('used_tokens') or 0)
    return {
        'id': k.get('id'),
        'name': k.get('name') or '',
        'prefix': k.get('prefix') or '',
        'enabled': bool(k.get('enabled')),
        'models': list(k.get('models') or []),
        'realm': k.get('realm') or '',
        'quota': quota,
        'used_tokens': used,
        'usage_ratio': (min(used / quota, 1.0) if quota else None),
        'expires_at': k.get('expires_at'),
        'last_used_at': k.get('last_used_at'),
        'from_red_packet': bool(k.get('packet_id')),
    }


def overview(health: Any, status: Any, summary: Any, accounts: Any) -> dict:
    """聚合仪表盘。任一路失败都只让对应卡片降级，不让整屏报错（失败值为 CoreError 或 None）。"""
    def ok(x: Any) -> bool:
        return isinstance(x, dict)

    gateway = {'core': ok(health), 'upstream': None, 'detail': ''}
    if ok(status):
        gateway['upstream'] = bool(status.get('connected'))
        if not status.get('connected'):
            gateway['detail'] = str(status.get('error') or '上游未连接')
    elif status is not None:
        gateway['detail'] = str(getattr(status, 'detail', status))
    state = 'down' if not gateway['core'] or gateway['upstream'] is False else 'ok'

    today = None
    if ok(summary):
        fails = summary.get('failures') or {}
        req = int(summary.get('today_requests') or 0)
        failed = (int(fails.get('today_4xx') or 0) + int(fails.get('today_5xx') or 0)) if isinstance(fails, dict) else 0
        today = {
            'requests': req,
            'tokens': int(summary.get('today_tokens') or 0),
            'credit': summary.get('today_credit'),
            'failed': failed,
            'success_rate': (round(max(req - failed, 0) / req, 4) if req else None),
            'top_model': summary.get('top_model'),
            'active_keys': int(summary.get('active_keys') or 0),
        }

    pool = None
    inflight = None
    if ok(accounts):
        payload = accounts_payload(accounts)
        pool = payload['counts']
        inflight = sum(c['in_flight'] for c in payload['accounts'])
        if pool['total'] and pool['ok'] == 0 and state == 'ok':
            state = 'degraded'

    return {'state': state, 'gateway': gateway, 'inflight': inflight, 'today': today, 'pool': pool}
