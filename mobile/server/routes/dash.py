"""仪表盘聚合：桌面端要打 4～5 个接口，这里合成一次。

单个子请求失败只把对应区块置为 null 并写进 `errors`，不让整页报错 ——
手机弱网下「部分可见」比「整页红屏」有用得多。401 例外：会话失效必须整体返回，
前端据此跳登录页。
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request

from ..schemas import account_state
from . import core

router = APIRouter(tags=['dash'])


@router.get('/dash')
async def dash(request: Request, realm: str | None = None):
    c = core(request)
    r = realm if realm in ('cn', 'global') else None

    async def get(path: str, params: dict | None = None):
        return await c.json(request, 'GET', path, params=params)

    results = await asyncio.gather(
        get('/api/accounts'),
        get('/api/stats/summary', {'realm': r}),
        get('/api/stats/hourly', {'realm': r}),
        return_exceptions=True,
    )
    for res in results:
        if isinstance(res, HTTPException) and res.status_code == 401:
            raise res
    errors: dict[str, str] = {}

    def ok(name: str, res):
        if isinstance(res, BaseException):
            errors[name] = res.detail if isinstance(res, HTTPException) else '读取失败'
            return None
        return res

    accounts, summary, hourly = (ok(n, x) for n, x in zip(('accounts', 'summary', 'hourly'), results))

    gateway = None
    pool = None
    if accounts is not None:
        items = accounts.get('accounts') or []
        if r:
            items = [a for a in items if (a.get('realm') or 'cn') == r]
        states = [account_state(a) for a in items]
        available = sum(1 for s in states if s in ('ok', 'busy'))
        # 在途连接 = 各账号 in_flight 之和（上游 /status 逐账号给出），无需改 core
        inflight = sum(int(a.get('in_flight') or 0) for a in items)
        connected = bool(accounts.get('pool_available'))
        if not connected:
            level, text = 'down', '上游未连接'
        elif available == 0:
            level, text = 'warn', '没有可用账号'
        elif summary and (summary.get('failures') or {}).get('today_5xx'):
            level, text = 'warn', '运行中，今日有上游错误'
        else:
            level, text = 'ok', '运行正常'
        gateway = {
            'level': level,
            'text': text,
            'upstream': (accounts.get('upstream') or {}).get('name') or '默认上游',
            'inflight': inflight,
        }
        pool = {
            'total': len(items),
            'available': available,
            'cooling': states.count('cooling'),
            'disabled': states.count('disabled'),
            'problem': sum(1 for s in states if s in ('expired', 'invalid', 'offline')),
        }

    today = None
    if summary is not None:
        f = summary.get('failures') or {}
        today = {
            'requests': summary.get('today_requests') or 0,
            'tokens': summary.get('today_tokens') or 0,
            'credit': summary.get('today_credit') or 0,
            'failed': (f.get('today_4xx') or 0) + (f.get('today_5xx') or 0),
            'top_model': summary.get('top_model'),
            'health_hint': (summary.get('usage_health') or {}).get('detail') or '',
        }

    series = None
    if isinstance(hourly, list):
        series = [
            {'hour': int(h.get('hour', i)),
             'requests': int(h.get('requests') or 0),
             'tokens': int((h.get('prompt_tokens') or 0) + (h.get('completion_tokens') or 0))}
            for i, h in enumerate(hourly)
        ]

    return {'gateway': gateway, 'pool': pool, 'today': today, 'hourly': series, 'errors': errors}
