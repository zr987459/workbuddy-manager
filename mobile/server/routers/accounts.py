"""账号：卡片流、启停、刷新 token、国际版一键授权。"""
from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import views
from ..core_client import CoreClient, Cred
from ..deps import get_core, get_cred
from .overview import _realm

router = APIRouter(prefix='/m/api/accounts', tags=['accounts'])


def _file(file: str) -> str:
    # 核心也会校验；这里先挡掉明显越界，避免把怪路径拼进 URL
    if not file.startswith('workbuddy') or '/' in file or '\\' in file or '..' in file:
        raise HTTPException(status_code=400, detail='非法账号文件名')
    return quote(file, safe='')


@router.get('')
async def list_accounts(request: Request, realm: str | None = None, pill: str | None = None,
                        q: str | None = None, cred: Cred = Depends(get_cred),
                        core: CoreClient = Depends(get_core)) -> dict:
    r = _realm(request, realm)
    data = await core.get('/api/accounts', cred)
    cards = [views.account_card(a) for a in views.filter_realm(data.get('accounts') or [], r)]
    counts = views.pool_counts(cards)
    if pill == 'usable':
        cards = [c for c in cards if c['pill'] in ('ok', 'busy')]
    elif pill == 'attention':
        cards = [c for c in cards if c['pill'] in ('expired', 'banned', 'invalid', 'offline')]
    elif pill in views.PILL_ORDER:
        cards = [c for c in cards if c['pill'] == pill]
    if q:
        ql = q.strip().lower()
        cards = [c for c in cards if ql in c['name'].lower() or ql in c['uid'].lower()
                 or ql in c['note'].lower()]
    order = {p: i for i, p in enumerate(('banned', 'expired', 'invalid', 'offline',
                                         'cooling', 'busy', 'ok', 'paused'))}
    cards.sort(key=lambda c: (order.get(c['pill'], 99), c['name']))
    return {'realm': r, 'counts': counts, 'items': cards,
            'manageable': bool(data.get('manageable', True)),
            'pool_available': bool(data.get('pool_available'))}


class ToggleIn(BaseModel):
    enabled: bool
    reason: str = Field(default='', max_length=200)


@router.post('/{file}/toggle')
async def toggle(file: str, body: ToggleIn, cred: Cred = Depends(get_cred),
                 core: CoreClient = Depends(get_core)) -> dict:
    return await core.post(f'/api/accounts/{_file(file)}/disabled', cred,
                           json={'disabled': not body.enabled,
                                 'reason': body.reason or '移动端操作', 'reload': True})


@router.post('/{file}/refresh')
async def refresh(file: str, cred: Cred = Depends(get_cred),
                  core: CoreClient = Depends(get_core)) -> dict:
    return await core.post(f'/api/accounts/{_file(file)}/refresh', cred)


@router.post('/{file}/test')
async def test(file: str, cred: Cred = Depends(get_cred),
               core: CoreClient = Depends(get_core)) -> dict:
    return await core.post(f'/api/accounts/{_file(file)}/test', cred)


class LoginIn(BaseModel):
    realm: str | None = None
    region: str | None = Field(default=None, max_length=8)
    proxy: str | None = Field(default=None, max_length=64)


@router.post('/login')
async def start_login(body: LoginIn, request: Request, cred: Cred = Depends(get_cred),
                      core: CoreClient = Depends(get_core)) -> dict:
    """一键授权：拿到 authUrl，前端直接跳转（手机上不需要扫码）。"""
    r = _realm(request, body.realm)
    payload = {'realm': r}
    if body.region:
        payload['region'] = body.region.strip().upper()
    if body.proxy:
        payload['proxy'] = body.proxy
    out = await core.post('/api/auth/start', cred, json=payload)
    return {'state': out.get('state'), 'auth_url': out.get('authUrl'), 'realm': out.get('realm', r)}


@router.get('/login/{state}')
async def poll_login(state: str, request: Request, realm: str | None = None,
                     region: str | None = None, cred: Cred = Depends(get_cred),
                     core: CoreClient = Depends(get_core)) -> dict:
    r = _realm(request, realm)
    out = await core.get('/api/auth/poll', cred,
                         params={'state': state, 'realm': r,
                                 'region': region.strip().upper() if region else None})
    status = out.get('status')
    return {'status': status, 'done': status in ('success', 'expired', 'invalid', 'realm_mismatch'),
            'uid': out.get('uid'), 'name': out.get('nickname'), 'message': out.get('message')}
