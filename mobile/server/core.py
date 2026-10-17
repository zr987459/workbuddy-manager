"""调用 core（桌面版 Manager）的 HTTP 客户端。

BFF 只用 core 的**公开接口**，鉴权两种：
- 会话：移动端登录时由 BFF 代为调用 core `/api/login`，拿到的 `wb_session` 只存在
  BFF 内存里（见 sessions.py），浏览器永远拿不到 core 的 cookie；
- Bearer：APK 等跨源客户端直接携带 core 的管理面 API Token（`wbt_...`），原样转发。
"""
from __future__ import annotations

from dataclasses import dataclass
from http.cookiejar import CookieJar, DefaultCookiePolicy
from typing import Any, AsyncIterator

import httpx

CORE_COOKIE = 'wb_session'


class CoreError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class CoreAuth:
    """一次请求代表的 core 身份。cookie 可能在响应里被 core 滑动续期，所以可变。"""
    cookie: str = ''
    bearer: str = ''

    def headers(self) -> dict:
        h = {}
        if self.bearer:
            h['Authorization'] = f'Bearer {self.bearer}'
        return h

    def all_headers(self) -> dict:
        h = self.headers()
        if self.cookie and not self.bearer:
            h['Cookie'] = f'{CORE_COOKIE}={self.cookie}'
        return h


def _detail(resp: httpx.Response) -> str:
    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        return (resp.text or '')[:300] or f'core 返回 {resp.status_code}'
    if isinstance(data, dict):
        d = data.get('detail')
        if isinstance(d, str):
            return d
        if d is not None:
            return str(d)[:300]
    return f'core 返回 {resp.status_code}'


class CoreClient:
    def __init__(self, base_url: str, timeout: float = 15.0, stream_timeout: float = 600.0,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.base_url = base_url.rstrip('/')
        self._timeout = timeout
        self._stream_timeout = stream_timeout
        self._client = httpx.AsyncClient(
            base_url=self.base_url, transport=transport, follow_redirects=False,
            # core 是直连的一跳：不吃 HTTP(S)_PROXY 环境变量，免得内网请求被送去外部代理
            trust_env=False,
            timeout=httpx.Timeout(timeout, connect=5.0),
            headers={'User-Agent': 'workbuddy-mobile-bff', 'X-Forwarded-By': 'workbuddy-mobile'},
            # 关键：共享客户端**绝不能**持久化 cookie。否则某个用户登录后 core 下发的
            # wb_session 会进到客户端 cookie 罐，之后所有人的请求（含未登录、Bearer）
            # 都会自动带上它，等于把管理员会话借给任何人。cookie 一律按请求显式传。
            cookies=CookieJar(policy=DefaultCookiePolicy(allowed_domains=[])),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    @staticmethod
    def _absorb_cookie(resp: httpx.Response, auth: CoreAuth | None) -> str:
        """core 续期或登录时会下发新的 wb_session；记下来，下次用新的。"""
        new = resp.cookies.get(CORE_COOKIE)
        if new and auth is not None and not auth.bearer:
            auth.cookie = new
        return new or ''

    async def request(self, method: str, path: str, auth: CoreAuth | None = None, *,
                      json: Any = None, params: dict | None = None) -> Any:
        try:
            resp = await self._client.request(
                method, path, json=json, params=params,
                headers=(auth.all_headers() if auth else None),
            )
        except httpx.HTTPError as exc:
            raise CoreError(502, f'连不上 core（{self.base_url}）：{type(exc).__name__}') from exc
        self._absorb_cookie(resp, auth)
        if resp.status_code >= 400:
            raise CoreError(resp.status_code, _detail(resp))
        if not resp.content:
            return None
        try:
            return resp.json()
        except ValueError:
            return resp.text

    async def login(self, username: str, password: str) -> tuple[str, dict]:
        """代为登录 core，返回 (core cookie, {username, role})。"""
        try:
            resp = await self._client.post('/api/login', json={'username': username, 'password': password})
        except httpx.HTTPError as exc:
            raise CoreError(502, f'连不上 core（{self.base_url}）：{type(exc).__name__}') from exc
        if resp.status_code >= 400:
            raise CoreError(resp.status_code, _detail(resp))
        cookie = resp.cookies.get(CORE_COOKIE) or ''
        if not cookie:
            raise CoreError(502, 'core 登录成功但未下发会话（检查 core 版本或反代是否吞掉了 Set-Cookie）')
        data = resp.json()
        return cookie, {'username': data.get('username', username), 'role': data.get('role', 'viewer')}

    async def stream(self, method: str, path: str, auth: CoreAuth, *, json: Any = None
                     ) -> tuple[int, str, AsyncIterator[bytes]]:
        """流式请求：返回 (状态码, content-type, 字节迭代器)。错误状态读完 body 后抛 CoreError。"""
        req = self._client.build_request(
            method, path, json=json, headers=auth.all_headers(),
            timeout=httpx.Timeout(self._timeout, read=self._stream_timeout),
        )
        try:
            resp = await self._client.send(req, stream=True)
        except httpx.HTTPError as exc:
            raise CoreError(502, f'连不上 core（{self.base_url}）：{type(exc).__name__}') from exc
        self._absorb_cookie(resp, auth)
        if resp.status_code >= 400:
            await resp.aread()
            await resp.aclose()
            raise CoreError(resp.status_code, _detail(resp))

        async def body() -> AsyncIterator[bytes]:
            try:
                async for chunk in resp.aiter_raw():
                    yield chunk
            finally:
                await resp.aclose()

        return resp.status_code, resp.headers.get('content-type', 'text/event-stream'), body()
