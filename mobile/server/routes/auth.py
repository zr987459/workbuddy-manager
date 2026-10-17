"""登录 / 登出 / 我是谁。登录凭据就是 core 的用户名密码，BFF 不另设账号体系。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..deps import Principal, principal
from ..sessions import COOKIE

router = APIRouter(prefix='/m/api/auth', tags=['auth'])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


def _secure(request: Request) -> bool:
    proto = request.headers.get('x-forwarded-proto', request.url.scheme)
    return proto == 'https'


@router.post('/login')
async def login(body: LoginIn, request: Request) -> JSONResponse:
    core = request.app.state.core
    cookie, who = await core.login(body.username, body.password)
    sid = request.app.state.sessions.create(cookie, who['username'], who['role'])
    resp = JSONResponse({'ok': True, **who})
    resp.set_cookie(COOKIE, sid, max_age=request.app.state.settings.session_ttl,
                    httponly=True, samesite='strict', secure=_secure(request), path='/')
    return resp


@router.post('/logout')
async def logout(request: Request) -> JSONResponse:
    request.app.state.sessions.drop(request.cookies.get(COOKIE))
    resp = JSONResponse({'ok': True})
    resp.delete_cookie(COOKIE, path='/')
    return resp


@router.get('/me')
async def me(request: Request, p: Principal = Depends(principal)) -> dict:
    if p.via == 'token':  # 令牌没有用户名，问 core 拿角色
        who = await request.app.state.core.request('GET', '/api/me', p.auth)
        return {'username': who.get('username') or 'token', 'role': who.get('role', 'viewer'), 'via': 'token'}
    return {'username': p.username, 'role': p.role, 'via': 'session'}
