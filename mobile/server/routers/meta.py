"""无需登录：应用信息与核心连通性（登录页据此提示「核心连不上」）。"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request

from .. import __version__
from ..core_client import CoreClient, CoreError
from ..deps import get_core

router = APIRouter(prefix='/m/api', tags=['meta'])


@router.get('/meta')
async def meta(request: Request, core: CoreClient = Depends(get_core)) -> dict:
    t0 = time.perf_counter()
    reachable, error = True, ''
    try:
        await core.get('/api/healthz')
    except CoreError as exc:
        reachable, error = exc.status < 500, exc.message
    return {
        'app': 'workbuddy-mobile',
        'version': __version__,
        'realm': request.app.state.prefs.get('realm'),
        'core': {'reachable': reachable, 'latency_ms': int((time.perf_counter() - t0) * 1000),
                 'error': error},
    }


@router.get('/healthz')
def healthz() -> dict:
    return {'ok': True}
