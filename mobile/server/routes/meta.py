"""设置与健康：前端「设置」页与外部探活用。"""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..core import CoreError

router = APIRouter(prefix='/m/api', tags=['meta'])
VERSION = '0.1.0'


@router.get('/healthz')
async def healthz(request: Request) -> dict:
    """无需登录：BFF 自身存活 + core 是否可达（只回布尔，不泄露细节）。"""
    try:
        await request.app.state.core.request('GET', '/api/healthz')
        core_ok = True
    except CoreError:
        core_ok = False
    return {'ok': True, 'service': 'workbuddy-mobile', 'version': VERSION, 'core': core_ok}


@router.get('/settings')
async def settings(request: Request) -> dict:
    s = request.app.state.settings
    return {
        'version': VERSION,
        'core_url': s.core_base,
        'gateway_url': s.public_gateway,
        'live_interval': s.live_interval,
        'regions': ['HK', 'MO', 'SG', 'TH', 'PH', 'MY', 'ID'],
    }
