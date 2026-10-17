"""应用工厂：挂 BFF 路由、统一错误形状、会话续期、静态 PWA。"""
from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import __version__
from .config import Settings
from .core_client import CoreClient, CoreError
from .deps import SESSION_COOKIE
from .prefs import Prefs
from .routers import accounts, auth, chat, keys, meta, overview, settings as settings_router


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message}})


def create_app(settings: Settings | None = None,
               transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await app.state.core.aclose()

    app = FastAPI(title='WorkBuddy Mobile', version=__version__, lifespan=lifespan,
                  docs_url='/m/api/docs', openapi_url='/m/api/openapi.json', redoc_url=None)
    app.state.settings = settings
    app.state.core = CoreClient(settings.core_url, settings.core_timeout, transport=transport)
    app.state.prefs = Prefs(settings.data_dir / 'prefs.json', {'realm': settings.realm})

    app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True,
                       allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                       allow_headers=['Authorization', 'Content-Type'])

    @app.middleware('http')
    async def renew_session(request: Request, call_next):
        response = await call_next(request)
        cred = getattr(request.state, 'cred', None)
        if cred is not None and cred.session and cred.renewed and cred.renewed != cred.session:
            from .routers.auth import SESSION_MAX_AGE, secure_flag
            response.set_cookie(SESSION_COOKIE, cred.renewed, max_age=SESSION_MAX_AGE,
                                httponly=True, samesite='lax', secure=secure_flag(request), path='/')
        if request.url.path.startswith('/m/api/'):
            response.headers.setdefault('Cache-Control', 'no-store')
        return response

    @app.exception_handler(CoreError)
    async def core_error(request: Request, exc: CoreError):
        resp = _err(exc.status, exc.code, exc.message)
        if exc.status == 401:
            resp.delete_cookie(SESSION_COOKIE, path='/')
        return resp

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = {401: 'unauthorized', 403: 'forbidden', 404: 'not_found'}.get(exc.status_code, 'bad_request')
        return _err(exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        msg = '; '.join(f"{'.'.join(str(p) for p in e.get('loc', [])[1:])}: {e.get('msg')}"
                        for e in exc.errors()[:3])
        return _err(422, 'invalid_input', msg or '参数不合法')

    for r in (meta, auth, settings_router, overview, accounts, keys, chat):
        app.include_router(r.router)

    _mount_spa(app, settings)
    return app


def _mount_spa(app: FastAPI, settings: Settings) -> None:
    root = settings.static_dir.resolve()
    index = root / 'index.html'

    @app.get('/{path:path}', include_in_schema=False)
    async def spa(path: str):
        if path.startswith('m/api'):
            return _err(404, 'not_found', '接口不存在')
        if not index.is_file():
            return JSONResponse(status_code=503, content={
                'error': {'code': 'web_not_built',
                          'message': '前端未构建：cd mobile/web && npm ci && npm run build'}})
        target = (root / path).resolve() if path else index
        if path and target.is_file() and root in target.parents:
            headers = {'Cache-Control': 'public, max-age=31536000, immutable'} \
                if '/assets/' in f'/{path}' else {'Cache-Control': 'no-cache'}
            return FileResponse(target, headers=headers)
        return FileResponse(index, headers={'Cache-Control': 'no-cache'})
