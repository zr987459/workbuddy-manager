"""核心数据 → 卡片 DTO 的纯函数（无 IO，便于单测）。"""
from __future__ import annotations

from typing import Any

# 状态胶囊：前端只认这些值
PILL_ORDER = ('ok', 'busy', 'cooling', 'paused', 'expired', 'banned', 'invalid', 'offline')


def account_pill(a: dict) -> tuple[str, str]:
    """(pill, 一句人话原因)。判定顺序 = 用户要做的事从「必须处理」到「等就行」。"""
    if a.get('invalid_reason') and not a.get('disabled_by_panel'):
        return 'invalid', str(a['invalid_reason'])
    if a.get('is_expired'):
        return 'expired', '登录已过期，需要重新授权'
    if a.get('disabled'):
        return 'banned', str(a.get('disabled_reason') or '被上游停用，需要重新登录')
    if a.get('manual_disabled') or a.get('disabled_by_panel'):
        return 'paused', str(a.get('manual_reason') or '已手动停用')
    if a.get('cooling'):
        sec = a.get('cool_remaining_sec')
        if a.get('degrade_until'):
            return 'cooling', '连续失败，暂时降权'
        return 'cooling', f'冷却中，约 {max(1, int(sec) // 60)} 分钟后恢复' if sec else '冷却中'
    if a.get('in_pool') is False:
        return 'offline', '未进入账号池'
    if (a.get('in_flight') or 0) > 0:
        return 'busy', f'{a["in_flight"]} 个请求进行中'
    return 'ok', '可用'


def account_card(a: dict) -> dict:
    pill, reason = account_pill(a)
    ttl = a.get('ttl_seconds') or 0
    remain = a.get('remain_seconds') or 0
    return {
        'id': a.get('file') or a.get('uid'),
        'file': a.get('file'),
        'uid': a.get('uid') or '',
        'name': a.get('nickname') or '未命名',
        'realm': a.get('realm') or 'cn',
        'note': a.get('note') or '',
        'pill': pill,
        'reason': reason,
        'enabled': pill not in ('paused',),
        'in_flight': int(a.get('in_flight') or 0),
        'success': a.get('success_count'),
        'errors': a.get('err_total'),
        'last_error': a.get('last_err') or '',
        'weight': a.get('weight') or 0,
        'token': {
            'expires_at': a.get('expires_at') or 0,
            'remain_seconds': remain,
            'ratio': round(min(1.0, remain / ttl), 3) if ttl else None,
        },
    }


def filter_realm(items: list[dict], realm: str | None) -> list[dict]:
    if realm not in ('cn', 'global'):
        return items
    return [a for a in items if (a.get('realm') or 'cn') == realm]


def pool_counts(cards: list[dict]) -> dict[str, int]:
    out = {k: 0 for k in PILL_ORDER}
    for c in cards:
        out[c['pill']] = out.get(c['pill'], 0) + 1
    out['total'] = len(cards)
    out['usable'] = out['ok'] + out['busy']
    return out


def gateway_state(status: dict | None, counts: dict | None) -> dict:
    if not status or not status.get('connected'):
        return {'state': 'down', 'label': '上游不可达',
                'detail': str((status or {}).get('error') or '无法连接 workbuddy2api')}
    if counts is not None and counts.get('usable', 0) == 0:
        return {'state': 'degraded', 'label': '无可用账号', 'detail': '账号池里没有健康账号'}
    if counts is not None and counts.get('total') and counts['usable'] < counts['total'] / 2:
        return {'state': 'degraded', 'label': '部分降级',
                'detail': f'{counts["usable"]}/{counts["total"]} 个账号可用'}
    return {'state': 'ok', 'label': '运行中', 'detail': str(status.get('version') or '')}


def key_card(k: dict) -> dict:
    quota = k.get('quota') or 0
    used = k.get('used_tokens') or 0
    return {
        'id': k.get('id'),
        'name': k.get('name') or '',
        'prefix': k.get('prefix') or '',
        'enabled': bool(k.get('enabled')),
        'models': list(k.get('models') or []),
        'realm': k.get('realm') or '',
        'quota': quota,
        'used_tokens': used,
        'usage_ratio': round(min(1.0, used / quota), 3) if quota else None,
        'used_credit': k.get('used_credit') or 0,
        'expires_at': k.get('expires_at'),
        'last_used_at': k.get('last_used_at'),
        'created_at': k.get('created_at'),
        'from_packet': bool(k.get('packet_id')),
    }


def recent_error(item: dict) -> dict[str, Any]:
    return {
        'id': item.get('id'),
        'ts': item.get('ts'),
        'status': item.get('status'),
        'model': item.get('model') or '',
        'key': item.get('key_name') or '',
        'error': (item.get('error') or '')[:240],
        'latency_ms': item.get('latency_ms'),
    }
