"""核心 Manager 的 HTTP 适配器 —— BFF 与核心之间**唯一**的边界。

凭据两种，原样转给核心，BFF 自己不签发、不校验身份：
  · 会话：核心 `/api/login` 下发的 `wb_session`，BFF 把它存在本源的
    `wbm_session` cookie 里，转发时还原成 `Cookie: wb_session=...`；
  · Bearer：管理面 API Token（`wbt_...`，APK 用），原样转 `Authorization`。
核心会在响应里续期 `wb_session`，这里捕获后交给中间件写回 `wbm_session`。
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator

import httpx

CORE_COOKIE = 'wb_session'


@dataclass
class Cred:
    session: str | None = None
    bearer: str | None = None
    client_ip: str = ''
    renewed: str | None = None  # 核心续期后的新会话


class CoreError(Exception):
    def __init__(self, status: int, message: str, code: str = 'core_error'):
        super().__init__(message)
        self.status, self.message, self.code = status, message, code


def _detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        return (resp.text or '').strip()[:300] or f'HTTP {resp.status_code}'
    if isinstance(body, dict):
        d = body.get('detail') or body.get('message') or body.get('error')
        if isinstance(d, dict):
            d = d.get('message') or str(d)
        if isinstance(d, list):  # FastAPI 422
            d = '; '.join(str(x.get('msg', x)) for x in d if isinstance(x, dict)) or str(d)
        if d:
            return str(d)
    return f'HTTP {resp.status_code}'


class CoreClient:
    def __init__(self, base_url: str, timeout: float = 15.0,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.base_url = base_url.rstrip('/')
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(timeout, connect=5.0),
            transport=transport,
            follow_redirects=False,
            # 核心通常在本机 / 内网：不能让 HTTP(S)_PROXY 环境变量把它绕到外部代理
            trust_env=False,
        )
        self._stream_timeout = httpx.Timeout(None, connect=5.0)

    async def aclose(self) -> None:
        await self._http.aclose()

    @staticmethod
    def _headers(cred: Cred | None) -> dict[str, str]:
        h = {'Accept': 'application/json', 'X-Requested-By': 'workbuddy-mobile'}
        if cred is None:
            return h
        if cred.bearer:
            h['Authorization'] = f'Bearer {cred.bearer}'
        elif cred.session:
            h['Cookie'] = f'{CORE_COOKIE}={cred.session}'
        if cred.client_ip:
            # 核心按客户端 IP 做登录防爆破与审计；loopback 是它默认信任的代理段
            h['X-Real-IP'] = cred.client_ip
            h['X-Forwarded-For'] = cred.client_ip
        return h

    @staticmethod
    def _capture(resp: httpx.Response, cred: Cred | None) -> None:
        if cred is None:
            return
        fresh = resp.cookies.get(CORE_COOKIE)
        if fresh:
            cred.renewed = fresh

    async def raw(self, method: str, path: str, cred: Cred | None = None, *,
                  params: dict | None = None, json: Any = None) -> httpx.Response:
        try:
            resp = await self._http.request(
                method, path, params={k: v for k, v in (params or {}).items() if v is not None},
                json=json, headers=self._headers(cred))
        except httpx.TimeoutException as exc:
            raise CoreError(504, f'核心服务超时：{self.base_url}', 'core_timeout') from exc
        except httpx.HTTPError as exc:
            raise CoreError(502, f'连不上核心服务 {self.base_url}：{type(exc).__name__}',
                            'core_unreachable') from exc
        self._capture(resp, cred)
        return resp

    async def call(self, method: str, path: str, cred: Cred | None = None, **kw: Any) -> Any:
        resp = await self.raw(method, path, cred, **kw)
        if resp.status_code >= 400:
            code = {401: 'unauthorized', 403: 'forbidden', 404: 'not_found',
                    429: 'rate_limited'}.get(resp.status_code, 'core_error')
            raise CoreError(resp.status_code, _detail(resp), code)
        if not resp.content:
            return None
        try:
            return resp.json()
        except ValueError as exc:
            raise CoreError(502, '核心返回了非 JSON 内容', 'bad_core_response') from exc

    async def get(self, path: str, cred: Cred | None = None, **kw: Any) -> Any:
        return await self.call('GET', path, cred, **kw)

    async def post(self, path: str, cred: Cred | None = None, **kw: Any) -> Any:
        return await self.call('POST', path, cred, **kw)

    async def patch(self, path: str, cred: Cred | None = None, **kw: Any) -> Any:
        return await self.call('PATCH', path, cred, **kw)

    async def put(self, path: str, cred: Cred | None = None, **kw: Any) -> Any:
        return await self.call('PUT', path, cred, **kw)

    async def delete(self, path: str, cred: Cred | None = None, **kw: Any) -> Any:
        return await self.call('DELETE', path, cred, **kw)

    @asynccontextmanager
    async def stream(self, method: str, path: str, cred: Cred | None, *,
                     json: Any = None) -> AsyncIterator[httpx.Response]:
        h = self._headers(cred)
        h['Accept'] = 'text/event-stream'
        req = self._http.build_request(method, path, json=json, headers=h,
                                       timeout=self._stream_timeout)
        try:
            resp = await self._http.send(req, stream=True)
        except httpx.HTTPError as exc:
            raise CoreError(502, f'连不上核心服务 {self.base_url}：{type(exc).__name__}',
                            'core_unreachable') from exc
        try:
            yield resp
        finally:
            await resp.aclose()
