"""账号：卡片流、启停、国际版一键授权、刷新 token、解除冷却。"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import dto
from ..deps import Principal, csrf_guard, principal

router = APIRouter(prefix='/m/api/accounts', tags=['accounts'], dependencies=[Depends(csrf_guard)])

# 与 core 的账号文件名白名单一致：只做第一道过滤，最终以 core 校验为准
_FILE_RE = re.compile(r'workbuddy[0-9A-Za-z_-]{0,80}\.json(\.disabled)?')
_REGIONS = {'HK', 'MO', 'SG', 'TH', 'PH', 'MY', 'ID'}


def _file(name: str) -> str:
    if not _FILE_RE.fullmatch(name):
        raise HTTPException(status_code=400, detail='非法的账号文件名')
    return name


@router.get('')
async def list_accounts(request: Request, p: Principal = Depends(principal)) -> dict:
    data = await request.app.state.core.request('GET', '/api/accounts', p.auth)
    return dto.accounts_payload(data)


class ToggleIn(BaseModel):
    enabled: bool
    reason: str = Field(default='', max_length=120)


@router.post('/{file}/enabled')
async def set_enabled(file: str, body: ToggleIn, request: Request,
                      p: Principal = Depends(principal)) -> dict:
    out = await request.app.state.core.request(
        'POST', f'/api/accounts/{_file(file)}/disabled', p.auth,
        json={'disabled': not body.enabled, 'reason': body.reason or '移动端手动停用'})
    return {'ok': True, 'core': out}


@router.post('/{file}/refresh')
async def refresh(file: str, request: Request, p: Principal = Depends(principal)) -> dict:
    return await request.app.state.core.request('POST', f'/api/accounts/{_file(file)}/refresh', p.auth)


@router.post('/{file}/clear-cooling')
async def clear_cooling(file: str, request: Request, p: Principal = Depends(principal)) -> dict:
    return await request.app.state.core.request('POST', f'/api/accounts/{_file(file)}/clear-cooling', p.auth)


class LoginStartIn(BaseModel):
    region: str = Field(default='', max_length=4)


@router.post('/login')
async def login_start(body: LoginStartIn, request: Request, p: Principal = Depends(principal)) -> dict:
    """国际版授权：返回 authUrl，手机上直接打开（不用扫码）。"""
    region = body.region.strip().upper()
    if region and region not in _REGIONS:
        raise HTTPException(status_code=400, detail='不支持的地区')
    payload = {'realm': 'global'}
    if region:
        payload['region'] = region
    out = await request.app.state.core.request('POST', '/api/auth/start', p.auth, json=payload)
    return {'state': out.get('state', ''), 'auth_url': out.get('authUrl', '')}


@router.get('/login/{state}')
async def login_poll(state: str, request: Request, region: str = '',
                     p: Principal = Depends(principal)) -> dict:
    if not re.fullmatch(r'[0-9A-Za-z_-]{1,128}', state):
        raise HTTPException(status_code=400, detail='非法的 state')
    params = {'state': state, 'realm': 'global'}
    if region.upper() in _REGIONS:
        params['region'] = region.upper()
    out = await request.app.state.core.request('GET', '/api/auth/poll', p.auth, params=params)
    status = out.get('status', 'waiting')
    return {
        'status': status,  # waiting | success | expired | invalid | ...
        'nickname': out.get('nickname', ''),
        'note': out.get('region_note', ''),
        'done': status not in ('waiting',),
    }
