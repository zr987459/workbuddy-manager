"""请求级依赖：取凭据、拿核心客户端。"""
from __future__ import annotations

from fastapi import HTTPException, Request

from .core_client import CoreClient, Cred

SESSION_COOKIE = 'wbm_session'


def client_ip(request: Request) -> str:
    # uvicorn 的 proxy_headers 已按 forwarded_allow_ips 处理过 X-Forwarded-For
    return request.client.host if request.client else ''


def get_core(request: Request) -> CoreClient:
    return request.app.state.core


def get_cred(request: Request) -> Cred:
    """会话 cookie 或 Bearer wbt_；都没有时 401（不打扰核心）。"""
    cred = getattr(request.state, 'cred', None)
    if cred is not None:
        return cred
    auth = request.headers.get('authorization', '')
    bearer = auth[7:].strip() if auth.lower().startswith('bearer ') else ''
    if bearer and not bearer.startswith('wbt_'):
        # wbk_ 是网关数据面密钥，不能拿来登录管理面
        raise HTTPException(status_code=401, detail='请使用管理面 API Token（wbt_ 开头）')
    session = request.cookies.get(SESSION_COOKIE) or ''
    if not bearer and not session:
        raise HTTPException(status_code=401, detail='未登录')
    cred = Cred(session=session or None, bearer=bearer or None, client_ip=client_ip(request))
    request.state.cred = cred
    return cred


def optional_cred(request: Request) -> Cred:
    try:
        return get_cred(request)
    except HTTPException:
        return Cred(client_ip=client_ip(request))
