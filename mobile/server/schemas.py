"""移动端 DTO：把 core 面向桌面表格的全量字段裁剪成卡片需要的那几个。

刻意**不**带出的东西：签到 / 成长任务 / 红包 / 积分账本 / 代理会话 / 企业 ID /
IP 白名单 —— 移动端不做这些，前端也就不该拿到它们。
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AccountState = Literal['ok', 'busy', 'cooling', 'disabled', 'expired', 'invalid', 'offline']

STATE_LABEL = {
    'ok': '可用',
    'busy': '忙碌',
    'cooling': '冷却中',
    'disabled': '已停用',
    'expired': '令牌过期',
    'invalid': '未加载',
    'offline': '未入池',
}


def account_state(a: dict) -> AccountState:
    """优先级与桌面端一致：停用 > 过期 > 未加载 > 冷却 > 未入池 > 忙碌 > 可用。"""
    if a.get('manual_disabled') or a.get('disabled_by_panel') or a.get('disabled'):
        return 'disabled'
    if a.get('is_expired'):
        return 'expired'
    if a.get('invalid_reason'):
        return 'invalid'
    if a.get('cooling'):
        return 'cooling'
    if a.get('in_pool') is False:
        return 'offline'
    if (a.get('in_flight') or 0) > 0:
        return 'busy'
    return 'ok'


def slim_account(a: dict) -> dict:
    state = account_state(a)
    uid = str(a.get('uid') or '')
    reason = (a.get('manual_reason') or a.get('disabled_reason') or a.get('invalid_reason') or '')
    return {
        'file': a.get('file') or '',
        'uid': uid,
        'uid_tail': uid[-6:],
        'nickname': a.get('nickname') or '未命名',
        'realm': a.get('realm') or 'cn',
        'state': state,
        'state_label': STATE_LABEL[state],
        'reason': str(reason)[:120],
        'cool_remaining_sec': a.get('cool_remaining_sec'),
        'remain_seconds': a.get('remain_seconds'),
        'credits': a.get('credits'),
        'in_flight': int(a.get('in_flight') or 0),
        'note': a.get('note') or '',
        'disabled': state == 'disabled',
    }


def slim_key(k: dict) -> dict:
    return {
        'id': k.get('id'),
        'name': k.get('name') or '',
        'prefix': k.get('prefix') or '',
        'enabled': bool(k.get('enabled')),
        'models': list(k.get('models') or []),
        'realm': k.get('realm') or '',
        'expires_at': k.get('expires_at'),
        'used_tokens': k.get('used_tokens') or 0,
        'used_credit': k.get('used_credit') or 0,
        'quota': k.get('quota') or 0,
        'last_used_at': k.get('last_used_at'),
        'from_packet': k.get('packet_id') is not None,
    }


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class ToggleIn(BaseModel):
    disabled: bool


class AuthorizeIn(BaseModel):
    realm: Literal['global', 'cn'] = 'global'
    region: str = Field(default='', max_length=16)


class KeyCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    models: list[str] = Field(default_factory=list, max_length=200)
    realm: Literal['', 'cn', 'global'] = ''


class KeyPatchIn(BaseModel):
    model_config = {'extra': 'forbid'}
    name: str | None = Field(None, min_length=1, max_length=64)
    enabled: bool | None = None
    models: list[str] | None = Field(None, max_length=200)


class ChatIn(BaseModel):
    model: str = Field(min_length=1, max_length=128)
    messages: list[dict[str, Any]] = Field(min_length=1, max_length=200)
    reasoning_effort: str = Field(default='', max_length=16)
    stream: bool = True
    temperature: float | None = Field(None, ge=0, le=2)
    max_tokens: int | None = Field(None, ge=1, le=200_000)
    realm: Literal['cn', 'global'] = 'cn'
