"""请求依赖：识别身份、写操作防 CSRF。"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request

from .core import CoreAuth
from .sessions import COOKIE

# 写操作必须带这个头：跨站表单 / <img> 发不出自定义头，跨站 fetch 会触发预检被 CORS 拦下
CSRF_HEADER = 'x-wbm'


@dataclass
class Principal:
    auth: CoreAuth
    username: str
    role: str
    via: str  # session | token


def principal(request: Request) -> Principal:
    authz = request.headers.get('authorization', '')
    if authz.lower().startswith('bearer '):
        token = authz[7:].strip()
        # 只接受 core 的管理面令牌；网关密钥 wbk_ 不能当后台凭据（与 core 的约束一致）
        if not token.startswith('wbt_'):
            raise HTTPException(status_code=401, detail='只接受 wbt_ 开头的管理面令牌')
        return Principal(CoreAuth(bearer=token), '', '', 'token')
    store = request.app.state.sessions
    s = store.get(request.cookies.get(COOKIE))
    if s is None:
        raise HTTPException(status_code=401, detail='未登录或会话已过期')
    return Principal(s.auth, s.username, s.role, 'session')


def csrf_guard(request: Request) -> None:
    if request.method in ('GET', 'HEAD', 'OPTIONS'):
        return
    if request.headers.get('authorization', '').lower().startswith('bearer '):
        return  # Bearer 本身不会被浏览器自动携带，没有 CSRF 面
    if request.headers.get(CSRF_HEADER) != '1':
        raise HTTPException(status_code=403, detail='缺少 X-WBM 请求头')
