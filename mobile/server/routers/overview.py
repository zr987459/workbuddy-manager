"""概览：一屏一个请求。各数据源**独立失败**，不因一项挂掉整页空白。"""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from .. import views
from ..core_client import CoreClient, CoreError, Cred
from ..deps import get_core, get_cred

router = APIRouter(prefix='/m/api', tags=['overview'])


def _realm(request: Request, realm: str | None) -> str:
    r = (realm or request.app.state.prefs.get('realm') or 'global').lower()
    return r if r in ('cn', 'global') else 'global'


async def _safe(coro):
    try:
        return await coro, None
    except CoreError as exc:
        if exc.status in (401, 403):
            raise
        return None, exc.message


async def build_overview(core: CoreClient, cred: Cred, realm: str) -> dict:
    (status, e1), (summary, e2), (accounts, e3), (logs, e4) = await asyncio.gather(
        _safe(core.get('/api/status', cred)),
        _safe(core.get('/api/stats/summary', cred, params={'realm': realm})),
        _safe(core.get('/api/accounts', cred)),
        _safe(core.get('/api/logs', cred, params={'status': 'error', 'size': 5, 'realm': realm})),
    )
    cards = [views.account_card(a) for a in
             views.filter_realm((accounts or {}).get('accounts') or [], realm)] if accounts else None
    counts = views.pool_counts(cards) if cards is not None else None
    s = summary or {}
    fails = s.get('failures') or {}
    today_req = s.get('today_requests')
    today_fail = (fails.get('today_4xx') or 0) + (fails.get('today_5xx') or 0)
    return {
        'realm': realm,
        'at': int(time.time()),
        'gateway': views.gateway_state(status, counts) if status is not None else None,
        'inflight': sum(c['in_flight'] for c in cards) if cards is not None else None,
        'today': None if summary is None else {
            'requests': today_req or 0,
            'tokens': s.get('today_tokens') or 0,
            'credit': s.get('today_credit') or 0,
            'failures': today_fail,
            'success_rate': (round(1 - today_fail / (today_req + today_fail), 4)
                             if (today_req or today_fail) else None),
        },
        'week': None if summary is None else {
            'requests': s.get('week_requests') or 0, 'tokens': s.get('week_tokens') or 0},
        'top_model': s.get('top_model'),
        'active_keys': s.get('active_keys'),
        'pool': counts,
        'recent_errors': [views.recent_error(i) for i in (logs or {}).get('items') or []]
        if logs is not None else None,
        'errors': {k: v for k, v in
                   (('status', e1), ('summary', e2), ('accounts', e3), ('logs', e4)) if v},
    }


@router.get('/overview')
async def overview(request: Request, realm: str | None = None,
                   cred: Cred = Depends(get_cred), core: CoreClient = Depends(get_core)) -> dict:
    return await build_overview(core, cred, _realm(request, realm))


@router.get('/live')
async def live(request: Request, realm: str | None = None, interval: int = 5,
               cred: Cred = Depends(get_cred), core: CoreClient = Depends(get_core)):
    """SSE：每 interval 秒推一次概览。客户端断开（页面隐藏）即停。"""
    r = _realm(request, realm)
    every = min(60, max(3, int(interval)))

    async def gen():
        while not await request.is_disconnected():
            try:
                data = await build_overview(core, cred, r)
                yield f'event: overview\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'
            except CoreError as exc:
                yield f'event: error\ndata: {json.dumps({"status": exc.status, "message": exc.message}, ensure_ascii=False)}\n\n'
                if exc.status in (401, 403):
                    return
            await asyncio.sleep(every)

    return StreamingResponse(gen(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
