"""create_app：挂载 BFF 路由、PWA 静态资源、安全头与可选 CORS。"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from .core import CoreClient, CoreError
from .routes import accounts, auth, chat, keys, meta, overview
from .sessions import SessionStore
from .settings import Settings

CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
       "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

_NO_DIST = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>WorkBuddy Mobile</title><body style="font-family:system-ui;padding:24px;line-height:1.6">
<h2>前端尚未构建</h2><p>BFF 已在运行（<code>/m/api/healthz</code>）。构建前端：</p>
<pre>cd mobile/web &amp;&amp; npm ci &amp;&amp; npm run build</pre></body>"""


def create_app(settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await app.state.core.aclose()

    app = FastAPI(title='WorkBuddy Mobile BFF', version=meta.VERSION, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url='/m/api/openapi.json')
    app.state.settings = settings
    app.state.core = CoreClient(settings.core_base, settings.core_timeout, settings.stream_timeout,
                                transport=transport)
    app.state.sessions = SessionStore(settings.session_ttl)

    if settings.allowed_origins:
        app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins),
                           allow_credentials=True, allow_methods=['GET', 'POST', 'PATCH', 'DELETE'],
                           allow_headers=['Authorization', 'Content-Type', 'X-WBM'])

    @app.exception_handler(CoreError)
    async def _core_error(_: Request, exc: CoreError) -> JSONResponse:
        # 401 原样透出（前端据此回到登录页）；其余保留 core 的状态码与中文原因
        return JSONResponse({'detail': exc.detail, 'from': 'core'}, status_code=exc.status)

    @app.middleware('http')
    async def headers(request: Request, call_next):
        resp = await call_next(request)
        path = request.url.path
        resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
        resp.headers.setdefault('Referrer-Policy', 'same-origin')
        if path.startswith('/m/api/'):
            resp.headers['Cache-Control'] = 'no-store'
        elif path.startswith('/assets/'):
            resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        else:
            resp.headers.setdefault('Cache-Control', 'no-cache')
            resp.headers.setdefault('Content-Security-Policy', CSP)
            resp.headers.setdefault('X-Frame-Options', 'DENY')
        return resp

    for r in (meta, auth, overview, accounts, keys, chat):
        app.include_router(r.router)

    dist: Path = settings.web_dist

    @app.get('/{path:path}', include_in_schema=False)
    async def spa(path: str):
        if path.startswith('m/api/'):
            raise HTTPException(status_code=404)
        if not (dist / 'index.html').is_file():
            return HTMLResponse(_NO_DIST)
        if path:
            target = (dist / path).resolve()
            # 只允许 dist 目录内的真实文件（防穿越）
            if target.is_file() and dist.resolve() in target.parents:
                return FileResponse(target)
        return FileResponse(dist / 'index.html')

    return app
