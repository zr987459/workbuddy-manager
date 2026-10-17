"""鉴权代理：登录 / 登出 / 当前用户。身份完全由核心判定。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..core_client import CORE_COOKIE, CoreClient, CoreError, Cred
from ..deps import SESSION_COOKIE, client_ip, get_core, get_cred

router = APIRouter(prefix='/m/api/auth', tags=['auth'])

SESSION_MAX_AGE = 30 * 86400  # 上限；真正的有效期由核心判定


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


def secure_flag(request: Request) -> bool:
    mode = request.app.state.settings.secure_cookie
    if mode in ('true', 'false'):
        return mode == 'true'
    proto = request.headers.get('x-forwarded-proto', request.url.scheme)
    return proto.split(',')[0].strip() == 'https'


def set_session(resp: JSONResponse, request: Request, token: str) -> None:
    resp.set_cookie(SESSION_COOKIE, token, max_age=SESSION_MAX_AGE, httponly=True,
                    samesite='lax', secure=secure_flag(request), path='/')


@router.post('/login')
async def login(body: LoginIn, request: Request, core: CoreClient = Depends(get_core)):
    cred = Cred(client_ip=client_ip(request))
    resp = await core.raw('POST', '/api/login', cred,
                          json={'username': body.username, 'password': body.password})
    if resp.status_code >= 400:
        from ..core_client import _detail
        raise CoreError(resp.status_code, _detail(resp),
                        'rate_limited' if resp.status_code == 429 else 'login_failed')
    token = resp.cookies.get(CORE_COOKIE)
    if not token:
        raise CoreError(502, '核心登录成功但没有下发会话', 'bad_core_response')
    data = resp.json()
    out = JSONResponse({'ok': True, 'username': data.get('username'), 'role': data.get('role')})
    set_session(out, request, token)
    return out


@router.post('/logout')
async def logout(request: Request, core: CoreClient = Depends(get_core)):
    try:
        await core.raw('POST', '/api/logout', get_cred(request))
    except Exception:  # noqa: BLE001  登出总要成功
        pass
    out = JSONResponse({'ok': True})
    out.delete_cookie(SESSION_COOKIE, path='/')
    return out


@router.get('/me')
async def me(cred: Cred = Depends(get_cred), core: CoreClient = Depends(get_core)):
    return await core.get('/api/me', cred)
