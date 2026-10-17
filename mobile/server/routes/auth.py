"""鉴权：会话透传。BFF 不存密码、不签发自己的令牌。"""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..schemas import LoginIn
from . import core

router = APIRouter(tags=['auth'])


@router.post('/auth/login')
async def login(body: LoginIn, request: Request):
    c = core(request)
    # 登录请求不带旧会话：避免把上一个用户残留的 Cookie 一起交给 core
    return await c.passthrough(
        request, 'POST', '/api/login',
        json_body={'username': body.username, 'password': body.password},
        with_session=False,
        shape=lambda d: {'ok': True, 'username': d.get('username'), 'role': d.get('role')},
    )


@router.post('/auth/logout')
async def logout(request: Request):
    c = core(request)
    try:
        await c.call(request, 'POST', '/api/logout')
    finally:
        out = JSONResponse({'ok': True})
        out.delete_cookie(c.s.cookie_name, path=c.s.base_path)
    return out


@router.get('/auth/me')
async def me(request: Request):
    return await core(request).passthrough(request, 'GET', '/api/me')


@router.get('/healthz')
async def healthz(request: Request):
    c = core(request)
    try:
        resp = await c.call(request, 'GET', '/api/healthz', with_session=False)
        ok = resp.status_code == 200
    except Exception:  # noqa: BLE001
        ok = False
    return {'ok': True, 'service': 'workbuddy-mobile', 'core': c.s.core_url, 'core_ok': ok}


@router.get('/meta')
async def meta(request: Request):
    """前端展示用的公开配置（无敏感信息）。"""
    return {'gateway_url': core(request).s.public_gateway}
