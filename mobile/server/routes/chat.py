"""调试台：模型列表 + SSE 字节流直通。

不在 BFF 里解析或缓冲 SSE —— 首字延迟只取决于上游。客户端断开时 Starlette
会取消生成器，finally 里立刻关掉到 core 的连接，core 再关掉到上游的连接，
手机切后台不会继续烧额度。
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ..core_client import core_detail
from ..schemas import ChatIn
from . import core

router = APIRouter(tags=['chat'])


@router.get('/models')
async def models(request: Request, realm: str = 'cn'):
    r = 'global' if realm == 'global' else 'cn'
    return await core(request).passthrough(
        request, 'GET', '/api/playground/models', params={'realm': r},
        shape=lambda d: {'realm': d.get('realm', r), 'models': d.get('models') or []},
    )


@router.post('/chat')
async def chat(body: ChatIn, request: Request):
    c = core(request)
    payload = body.model_dump(exclude_none=True)
    req = c.http.build_request(
        'POST', '/api/playground/chat', json=payload,
        headers={**c.outbound_headers(request), 'Accept': 'text/event-stream'},
        timeout=httpx.Timeout(None, connect=5),
    )
    try:
        resp = await c.http.send(req, stream=True)
    except httpx.ConnectError:
        raise HTTPException(503, '核心服务未启动或不可达') from None
    except httpx.HTTPError as exc:
        raise HTTPException(502, f'核心服务通信失败：{exc.__class__.__name__}') from None

    if resp.status_code >= 400:
        try:
            await resp.aread()
        finally:
            await resp.aclose()
        return JSONResponse({'detail': core_detail(resp)}, status_code=resp.status_code)

    async def relay():
        try:
            async for chunk in resp.aiter_raw():
                yield chunk
        finally:
            await resp.aclose()

    return StreamingResponse(
        relay(),
        status_code=resp.status_code,
        media_type=resp.headers.get('content-type', 'text/event-stream'),
        headers={'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no'},
    )
