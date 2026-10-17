"""WorkBuddy Mobile BFF。

    浏览器 / PWA / APK ──▶ BFF (/m, /m/api/*) ──▶ WorkBuddy core (/api/*)

与 core 只通过 HTTP 交互：本包内**不得** `import server`（CI 用 grep 拦截）。
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse

from .core_client import CoreClient
from .routes import accounts, auth, chat, dash, keys
from .settings import Settings, load

UNSAFE = {'POST', 'PUT', 'PATCH', 'DELETE'}

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data:; connect-src 'self'; font-src 'self'; "
       "manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; "
       "form-action 'self'")


def create_app(settings: Settings | None = None,
               transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    s = settings or load()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await app.state.core.aclose()

    app = FastAPI(title='WorkBuddy Mobile', version='0.1.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = s
    app.state.core = CoreClient(s, transport=transport)

    # ------------------------------------------------------------ middleware
    @app.middleware('http')
    async def guard(request: Request, call_next):
        path = request.url.path
        if path.startswith(s.api_prefix) and request.method in UNSAFE:
            # CSRF：写操作必须是 JSON，且 Origin（若带）必须同源或在白名单里
            origin = request.headers.get('origin')
            if origin:
                allowed = {f'{request.url.scheme}://{request.headers.get("host", "")}', *s.extra_origins}
                if s.trust_proxy and request.headers.get('x-forwarded-proto'):
                    allowed.add(f'{request.headers["x-forwarded-proto"]}://{request.headers.get("host", "")}')
                if origin not in allowed:
                    return JSONResponse({'detail': '跨站请求已拒绝'}, status_code=403)
            ctype = request.headers.get('content-type', '')
            has_body = request.headers.get('content-length', '0') not in ('', '0')
            if has_body and not ctype.startswith('application/json'):
                return JSONResponse({'detail': '只接受 application/json'}, status_code=415)
        resp = await call_next(request)
        h = resp.headers
        h.setdefault('X-Content-Type-Options', 'nosniff')
        h.setdefault('Referrer-Policy', 'no-referrer')
        h.setdefault('X-Frame-Options', 'DENY')
        h.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        if not path.startswith(s.api_prefix):
            h.setdefault('Content-Security-Policy', CSP)
        else:
            h.setdefault('Cache-Control', 'no-store')
        return resp

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = '.'.join(str(x) for x in first.get('loc', [])[1:])
        return JSONResponse({'detail': f"参数错误：{loc} {first.get('msg', '')}".strip()},
                            status_code=422)

    # ------------------------------------------------------------ API
    api = APIRouter(prefix=s.api_prefix)
    for mod in (auth, dash, accounts, keys, chat):
        api.include_router(mod.router)

    @api.api_route('/{rest:path}', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
    async def _api_404(rest: str):
        # 未声明的接口一律 404，绝不「兜底转发」到 core：那会把签到、红包、
        # 令牌管理这些移动端刻意不暴露的接口重新放出来
        raise HTTPException(404, '接口不存在')

    app.include_router(api)

    # ------------------------------------------------------------ static SPA
    dist: Path = s.dist_dir
    base = s.base_path

    @app.get('/', include_in_schema=False)
    async def _root():
        return RedirectResponse(f'{base}/')

    @app.get(base, include_in_schema=False)
    async def _base():
        return RedirectResponse(f'{base}/')

    @app.get(base + '/{rest:path}', include_in_schema=False)
    async def _spa(rest: str):
        if not dist.is_dir():
            return HTMLResponse(
                '<h1>前端尚未构建</h1><p>在 mobile/web 下执行 <code>npm ci &amp;&amp; npm run build</code> 后刷新。</p>',
                status_code=503,
            )
        root = dist.resolve()
        target = (root / rest).resolve() if rest else root / 'index.html'
        if rest and target.is_file() and target.is_relative_to(root):
            headers = {}
            if rest.startswith('assets/'):
                headers['Cache-Control'] = 'public, max-age=31536000, immutable'
            elif rest in ('sw.js', 'manifest.webmanifest'):
                headers['Cache-Control'] = 'no-cache'
                if rest == 'sw.js':
                    headers['Service-Worker-Allowed'] = f'{base}/'
            return FileResponse(target, headers=headers)
        if rest.startswith('assets/') or '.' in rest.rsplit('/', 1)[-1]:
            raise HTTPException(404, 'Not Found')
        # 客户端路由回落到 index.html
        return FileResponse(root / 'index.html', headers={'Cache-Control': 'no-cache'})

    return app
