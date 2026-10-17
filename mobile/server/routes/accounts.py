"""账号卡片流：列表、启停、测试、国际版一键授权。"""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..core_client import seg
from ..schemas import AuthorizeIn, ToggleIn, slim_account
from . import core

router = APIRouter(tags=['accounts'])


@router.get('/accounts')
async def list_accounts(request: Request):
    def shape(d: dict) -> dict:
        items = [slim_account(a) for a in d.get('accounts') or []]
        return {
            'accounts': items,
            'manageable': bool(d.get('manageable', True)),
            'pool_available': bool(d.get('pool_available')),
            'upstream': (d.get('upstream') or {}).get('name') or '默认上游',
        }
    return await core(request).passthrough(request, 'GET', '/api/accounts', shape=shape)


@router.post('/accounts/{file}/toggle')
async def toggle(file: str, body: ToggleIn, request: Request):
    return await core(request).passthrough(
        request, 'POST', f'/api/accounts/{seg(file)}/disabled',
        json_body={'disabled': body.disabled, 'reload': True, 'reason': '移动端手动停用'},
    )


@router.post('/accounts/{file}/test')
async def test(file: str, request: Request):
    return await core(request).passthrough(request, 'POST', f'/api/accounts/{seg(file)}/test')


@router.post('/accounts/authorize')
async def authorize(body: AuthorizeIn, request: Request):
    """发起授权：返回 state + authUrl。手机上直接打开 authUrl，不让用户扫自己屏幕的码。"""
    payload = {'realm': body.realm}
    if body.region:
        payload['region'] = body.region
    return await core(request).passthrough(
        request, 'POST', '/api/auth/start', json_body=payload,
        shape=lambda d: {'state': d.get('state'), 'auth_url': d.get('authUrl') or '',
                         'realm': d.get('realm')},
    )


@router.get('/accounts/authorize/{state}')
async def authorize_poll(state: str, request: Request, realm: str = 'global', region: str = ''):
    def shape(d: dict) -> dict:
        out = {'status': d.get('status') or 'waiting'}
        for k in ('nickname', 'message', 'msg', 'detail'):
            if d.get(k):
                out['message' if k != 'nickname' else 'nickname'] = str(d[k])[:200]
        return out
    return await core(request).passthrough(
        request, 'GET', '/api/auth/poll',
        params={'state': state[:128], 'realm': realm, 'region': region[:16]}, shape=shape,
    )
