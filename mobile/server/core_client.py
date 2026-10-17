"""对 WorkBuddy core 的 HTTP 客户端：会话透传 + 错误翻译。

三条硬约束：

1. **出站客户端绝不保存 Cookie。** httpx 默认会把响应里的 Set-Cookie 存进
   client 级的 cookie jar，并在之后**所有**请求里带上——对一个多用户共享的
   BFF 来说，这等于把 A 的会话发给 B。这里给 client 装一个拒收一切的 jar，
   每个请求只带当前浏览器自己的 `wbm_session`。
2. **BFF 不持有凭据。** 浏览器登录拿到的 core 会话被原样包进 BFF 域下的
   HttpOnly Cookie；core 续期（重新下发 wb_session）时同步更新，core 清除
   时同步清除。角色、锁定、审计、吊销全以 core 为准。
3. **真实客户端 IP 交给 core。** core 的登录锁定按 IP 计数，若不传，所有手机
   用户在 core 眼里都是 127.0.0.1，一个人输错密码会把所有人锁 10 分钟。
   core 只在 TCP 对端属于可信网段时才采信 X-Real-IP（见 server/iputil.py），
   BFF 与 core 同机部署时 127.0.0.1 默认可信。
"""
from __future__ import annotations

import http.cookiejar
import json
from http.cookies import SimpleCookie
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, Response

from .settings import Settings

CORE_COOKIE = 'wb_session'


class _RejectAll(http.cookiejar.DefaultCookiePolicy):
    def set_ok(self, cookie, request):  # noqa: D401
        return False

    def return_ok(self, cookie, request):
        return False


def _no_cookie_jar() -> http.cookiejar.CookieJar:
    # 必须传**裸 CookieJar**：httpx.Cookies(httpx.Cookies(...)) 会把内容拷进一个
    # 新的默认 jar，自定义 policy 随之丢失（实测踩过，见 tests 的会话隔离用例）。
    return http.cookiejar.CookieJar(policy=_RejectAll())


def seg(value: str) -> str:
    """路径段编码：账号文件名里可能有空格、中文、点号；禁止借 `/` 或 `..` 跳路由。"""
    v = str(value)
    if not v or v in ('.', '..') or '/' in v or '\\' in v:
        raise HTTPException(400, '非法的标识')
    return quote(v, safe='')


class CoreClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.s = settings
        kw: dict[str, Any] = {}
        if transport is not None:
            kw['transport'] = transport
        self.http = httpx.AsyncClient(
            base_url=settings.core_url,
            timeout=httpx.Timeout(settings.core_timeout, connect=5),
            limits=httpx.Limits(max_connections=64, max_keepalive_connections=16),
            cookies=_no_cookie_jar(),
            follow_redirects=False,
            # 不读 HTTP(S)_PROXY 等环境变量：core 在内网/本机，走系统代理只会绕路或直接 404
            trust_env=False,
            **kw,
        )
        assert isinstance(self.http.cookies.jar._policy, _RejectAll)

    async def aclose(self) -> None:
        await self.http.aclose()

    # ------------------------------------------------------------------ headers
    def client_ip(self, request: Request) -> str:
        if self.s.trust_proxy:
            real = request.headers.get('x-real-ip', '').strip()
            if real:
                return real
        return request.client.host if request.client else ''

    def is_https(self, request: Request) -> bool:
        if self.s.secure_cookie in ('true', '1'):
            return True
        if self.s.secure_cookie in ('false', '0'):
            return False
        proto = request.headers.get('x-forwarded-proto', '') if self.s.trust_proxy else ''
        return (proto or request.url.scheme) == 'https'

    def outbound_headers(self, request: Request, *, with_session: bool = True) -> dict[str, str]:
        ip = self.client_ip(request)
        h = {
            'Accept': 'application/json',
            'User-Agent': f"wb-mobile/1 ({request.headers.get('user-agent', '')[:180]})",
            'X-Forwarded-Proto': 'https' if self.is_https(request) else 'http',
        }
        if ip:
            h['X-Real-IP'] = ip
            h['X-Forwarded-For'] = ip
        token = request.cookies.get(self.s.cookie_name) if with_session else None
        if token:
            h['Cookie'] = f'{CORE_COOKIE}={token}'
        return h

    # ------------------------------------------------------------------ cookie sync
    @staticmethod
    def core_session_update(resp: httpx.Response) -> tuple[bool, str | None, int | None]:
        """从 core 响应里读出 wb_session 的变化：(是否变化, 新值或 None=已清除, max_age)。"""
        for raw in resp.headers.get_list('set-cookie'):
            jar = SimpleCookie()
            try:
                jar.load(raw)
            except Exception:  # noqa: BLE001
                continue
            if CORE_COOKIE not in jar:
                continue
            m = jar[CORE_COOKIE]
            max_age = m['max-age']
            if m.value in ('', '""') or max_age in ('0',) or 'expires=thu, 01 jan 1970' in raw.lower():
                return True, None, 0
            return True, m.value, int(max_age) if str(max_age).isdigit() else None
        return False, None, None

    def apply_session(self, request: Request, out: Response, resp: httpx.Response) -> None:
        changed, value, max_age = self.core_session_update(resp)
        if not changed:
            return
        path = self.s.base_path
        if value is None:
            out.delete_cookie(self.s.cookie_name, path=path)
            return
        out.set_cookie(
            self.s.cookie_name, value,
            max_age=max_age, httponly=True, samesite='lax',
            secure=self.is_https(request), path=path,
        )

    # ------------------------------------------------------------------ calls
    async def call(self, request: Request, method: str, path: str, *,
                   json_body: Any = None, params: dict | None = None,
                   with_session: bool = True) -> httpx.Response:
        try:
            return await self.http.request(
                method, path, json=json_body,
                params={k: v for k, v in (params or {}).items() if v not in (None, '')},
                headers=self.outbound_headers(request, with_session=with_session),
            )
        except httpx.ConnectError:
            raise HTTPException(503, f'核心服务未启动或不可达（{self.s.core_url}）') from None
        except httpx.TimeoutException:
            raise HTTPException(504, '核心服务响应超时，请稍后再试') from None
        except httpx.HTTPError as exc:
            raise HTTPException(502, f'核心服务通信失败：{exc.__class__.__name__}') from None

    async def json(self, request: Request, method: str, path: str, **kw) -> Any:
        """调用并返回 JSON；非 2xx 统一翻译成 HTTPException（保留 core 的中文 detail）。"""
        resp = await self.call(request, method, path, **kw)
        raise_for_core(resp)
        try:
            return resp.json()
        except ValueError:
            raise HTTPException(502, '核心服务返回了无法解析的数据') from None

    async def passthrough(self, request: Request, method: str, path: str, *, shape=None, **kw) -> Response:
        """调用并把结果交回浏览器，同时同步会话 Cookie。shape 用来裁剪成功响应。"""
        resp = await self.call(request, method, path, **kw)
        if resp.status_code >= 400:
            out = JSONResponse({'detail': core_detail(resp)}, status_code=resp.status_code)
        else:
            try:
                data = resp.json()
            except ValueError:
                raise HTTPException(502, '核心服务返回了无法解析的数据') from None
            out = JSONResponse(shape(data) if shape else data, status_code=resp.status_code)
        self.apply_session(request, out, resp)
        return out


_FALLBACK = {
    401: '登录已失效，请重新登录',
    403: '当前账号没有权限执行此操作',
    404: '资源不存在或已被删除',
    429: '操作太频繁，请稍后再试',
    502: '上游线路不可用，换线路或稍后再试',
    503: '暂时没有可用账号或上游',
}


def core_detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        d = body.get('detail') if isinstance(body, dict) else None
        if isinstance(d, str) and d:
            return d[:500]
        if isinstance(d, list) and d:  # pydantic 校验错误
            first = d[0]
            loc = '.'.join(str(x) for x in first.get('loc', [])[1:])
            return f"参数错误：{loc} {first.get('msg', '')}".strip()[:500]
    except (ValueError, AttributeError):
        pass
    return _FALLBACK.get(resp.status_code, f'核心服务返回 {resp.status_code}')


def raise_for_core(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, core_detail(resp))


def dumps(obj: Any) -> bytes:
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
