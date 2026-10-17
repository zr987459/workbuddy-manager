"""仪表盘：一屏一个请求（并发聚合 core 的 4 个接口）+ SSE 增量推送。"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from .. import dto
from ..core import CoreError
from ..deps import Principal, principal

router = APIRouter(prefix='/m/api', tags=['overview'])


async def _safe(coro):
    try:
        return await coro
    except CoreError as exc:
        if exc.status == 401:
            raise
        return exc


async def build_overview(request: Request, p: Principal) -> dict:
    core = request.app.state.core
    health, status, summary, accounts = await asyncio.gather(
        _safe(core.request('GET', '/api/healthz')),
        _safe(core.request('GET', '/api/status', p.auth)),
        _safe(core.request('GET', '/api/stats/summary', p.auth)),
        _safe(core.request('GET', '/api/accounts', p.auth)),
    )
    return dto.overview(health, status, summary, accounts)


@router.get('/overview')
async def overview(request: Request, p: Principal = Depends(principal)) -> dict:
    return await build_overview(request, p)


@router.get('/live')
async def live(request: Request, p: Principal = Depends(principal)) -> StreamingResponse:
    """每 live_interval 秒推一次 overview。客户端页面隐藏时应主动断开。"""
    interval = request.app.state.settings.live_interval

    async def gen():
        last = None
        while not await request.is_disconnected():
            try:
                data = await build_overview(request, p)
                text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
                if text != last:
                    yield f'event: overview\ndata: {text}\n\n'
                    last = text
                else:
                    yield ': ping\n\n'
            except CoreError as exc:
                yield f'event: error\ndata: {json.dumps({"status": exc.status, "detail": exc.detail}, ensure_ascii=False)}\n\n'
                if exc.status == 401:
                    return
            await asyncio.sleep(interval)

    return StreamingResponse(gen(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
