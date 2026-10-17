#!/usr/bin/env python3
"""假的核心 Manager，用于在没有真实上游时开发 / 演示移动端 UI。

    python mobile/dev/mock_core.py --port 8795
    python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795
    # 登录：admin / admin
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import time

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
NOW = time.time()
ACCOUNTS = [
    {'file': f'workbuddy-{i}.json', 'uid': f'uid-{i:04d}-9f2c1e', 'nickname': n, 'realm': 'global',
     'in_pool': True, 'ttl_seconds': 604800, 'remain_seconds': r, 'expires_at': int(NOW + r), **x}
    for i, (n, r, x) in enumerate([
        ('alice@workbuddy.ai', 520000, {'in_flight': 2, 'success_count': 812}),
        ('bob@workbuddy.ai', 300000, {'success_count': 133}),
        ('carol@workbuddy.ai', 90000, {'cooling': True, 'cool_remaining_sec': 900}),
        ('dave@workbuddy.ai', 0, {'is_expired': True}),
        ('erin@workbuddy.ai', 410000, {'manual_disabled': True, 'manual_reason': '先歇一会'}),
    ])
]
KEYS = [{'id': 2, 'name': 'Cursor', 'prefix': 'wbk_7Hq2', 'enabled': 1, 'models': ['global:claude-sonnet-4'],
         'quota': 2_000_000, 'used_tokens': 734_000, 'last_used_at': int(NOW - 300), 'realm': 'global'},
        {'id': 1, 'name': '手机', 'prefix': 'wbk_a91K', 'enabled': 1, 'models': [], 'quota': 0,
         'used_tokens': 52_100, 'last_used_at': int(NOW - 7200), 'realm': 'global'}]
MODELS = [{'id': 'claude-sonnet-4', 'name': 'Claude Sonnet 4', 'efforts': ['low', 'medium', 'high'], 'series': 'Claude'},
          {'id': 'gpt-5', 'name': 'GPT-5', 'efforts': ['minimal', 'low', 'medium', 'high'], 'series': 'GPT'},
          {'id': 'gemini-2.5-pro', 'name': 'Gemini 2.5 Pro', 'efforts': [], 'series': 'Gemini'}]
TOKEN = 'mock-session'


def authed(req: Request) -> bool:
    return req.cookies.get('wb_session') == TOKEN or req.headers.get('authorization', '').startswith('Bearer wbt_')


@app.middleware('http')
async def guard(req: Request, call_next):
    if req.url.path not in ('/api/login', '/api/healthz') and not authed(req):
        return JSONResponse({'detail': '未登录'}, status_code=401)
    return await call_next(req)


@app.get('/api/healthz')
def healthz():
    return {'ok': True}


@app.post('/api/login')
async def login(req: Request):
    b = await req.json()
    if (b.get('username'), b.get('password')) != ('admin', 'admin'):
        return JSONResponse({'detail': '用户名或密码错误'}, status_code=401)
    r = JSONResponse({'ok': True, 'username': 'admin', 'role': 'admin'})
    r.set_cookie('wb_session', TOKEN, httponly=True)
    return r


@app.post('/api/logout')
def logout():
    return {'ok': True}


@app.get('/api/me')
def me():
    return {'username': 'admin', 'role': 'admin'}


@app.get('/api/status')
def status():
    return {'connected': True, 'version': 'workbuddy2api v2.6 (mock)'}


@app.get('/api/stats/summary')
def summary():
    return {'today_requests': 1284 + random.randint(0, 9), 'today_tokens': 3_912_440, 'today_credit': 0,
            'week_requests': 8120, 'week_tokens': 25_400_000, 'active_keys': 2, 'top_model': 'claude-sonnet-4',
            'failures': {'today_4xx': 9, 'today_5xx': 3}}


@app.get('/api/accounts')
def accounts():
    return {'accounts': ACCOUNTS, 'manageable': True, 'pool_available': True}


@app.get('/api/logs')
def logs():
    return {'total': 2, 'items': [
        {'id': 91, 'ts': int(time.time() - 420), 'status': 503, 'model': 'claude-sonnet-4', 'key_name': 'Cursor',
         'error': 'no healthy account available in pool'},
        {'id': 88, 'ts': int(time.time() - 3600), 'status': 429, 'model': 'gpt-5', 'key_name': '手机',
         'error': 'rate limited by upstream, retry after 60s'}]}


@app.post('/api/accounts/{file}/disabled')
async def disabled(file: str, req: Request):
    b = await req.json()
    for a in ACCOUNTS:
        if a['file'] == file:
            a['manual_disabled'] = b['disabled']
    return {'ok': True, 'message': '已更新'}


@app.post('/api/accounts/{file}/refresh')
def refresh(file: str):
    return {'ok': True, 'message': '令牌已续期'}


@app.post('/api/accounts/{file}/test')
def test(file: str):
    return {'ok': True, 'message': '连通正常，耗时 812ms'}


@app.post('/api/auth/start')
def auth_start():
    return {'state': 'mock-state', 'authUrl': 'https://www.workbuddy.ai/', 'realm': 'global'}


@app.get('/api/auth/poll')
def auth_poll():
    return {'status': 'waiting'}


@app.get('/api/keys')
def keys():
    return KEYS


@app.post('/api/keys')
async def create_key(req: Request):
    b = await req.json()
    k = {'id': max(x['id'] for x in KEYS) + 1, 'name': b['name'], 'prefix': 'wbk_Zx8m', 'enabled': 1,
         'models': b.get('models', []), 'quota': b.get('quota', 0), 'used_tokens': 0, 'realm': b.get('realm', '')}
    KEYS.insert(0, k)
    return {**k, 'key': 'wbk_Zx8mQ4f1Ln6cP0rT2yV9bW3hK5sJ7dA'}


@app.patch('/api/keys/{kid}')
async def patch_key(kid: int, req: Request):
    b = await req.json()
    for k in KEYS:
        if k['id'] == kid:
            k.update(b)
            return k
    return JSONResponse({'detail': '密钥不存在'}, status_code=404)


@app.delete('/api/keys/{kid}')
def del_key(kid: int):
    KEYS[:] = [k for k in KEYS if k['id'] != kid]
    return Response(status_code=204)


@app.get('/api/playground/models')
def pg_models():
    return {'models': MODELS, 'source_label': 'mock'}


@app.post('/api/playground/chat')
async def chat(req: Request):
    async def gen():
        for t in ['用户在问候，', '简短友好地回应，', '并说明我能做什么。']:
            yield f'data: {json.dumps({"choices": [{"delta": {"reasoning_content": t}}]}, ensure_ascii=False)}\n\n'
            await asyncio.sleep(0.25)
        for t in ['你好！', '我是通过 WorkBuddy 网关', '转发的模型，', '链路一切正常。']:
            yield f'data: {json.dumps({"choices": [{"delta": {"content": t}}]}, ensure_ascii=False)}\n\n'
            await asyncio.sleep(0.12)
        yield 'data: ' + json.dumps({'choices': [], 'usage': {'prompt_tokens': 21, 'completion_tokens': 38}}) + '\n\n'
        yield 'data: [DONE]\n\n'
    return StreamingResponse(gen(), media_type='text/event-stream')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=8795)
    uvicorn.run(app, host='127.0.0.1', port=p.parse_args().port, log_level='warning')
