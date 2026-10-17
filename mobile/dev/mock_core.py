#!/usr/bin/env python3
"""开发用的假 core：只实现移动端用到的 /api/* 子集，字段形态与 server/ 一致。

    python mobile/dev/mock_core.py --port 8795      # 账号 admin / 密码 admin
    python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795

不连腾讯、不落盘，进程退出即清空。也被 mobile/tests 用作契约桩。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import secrets
import time

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

COOKIE = 'wb_session'


def build() -> FastAPI:
    app = FastAPI()
    sessions: dict[str, dict] = {}
    now = int(time.time())
    accounts = [
        {'file': 'workbuddy-a1.json', 'uid': '100000231871', 'nickname': 'Aurora', 'realm': 'global',
         'in_pool': True, 'cooling': False, 'disabled': False, 'manual_disabled': False,
         'credits': 1820, 'in_flight': 2, 'is_expired': False, 'remain_seconds': 86000},
        {'file': 'workbuddy-a2.json', 'uid': '100000231990', 'nickname': 'Borealis', 'realm': 'global',
         'in_pool': True, 'cooling': True, 'cool_remaining_sec': 840, 'disabled': False,
         'manual_disabled': False, 'credits': 40, 'in_flight': 0, 'is_expired': False},
        {'file': 'workbuddy-c1.json', 'uid': '200000110022', 'nickname': '晨星', 'realm': 'cn',
         'in_pool': True, 'cooling': False, 'disabled': False, 'manual_disabled': True,
         'manual_reason': '面板手动停用', 'credits': 300, 'in_flight': 0, 'is_expired': False},
        {'file': 'workbuddy-c2.json', 'uid': '200000110093', 'nickname': '<img src=x onerror=alert(1)>',
         'realm': 'cn', 'in_pool': False, 'is_expired': True, 'credits': None, 'in_flight': 0},
    ]
    notes = {'100000231871': '主力号 · HK'}
    keys: list[dict] = [
        {'id': 2, 'name': 'Cursor 笔记本', 'prefix': 'wbk_9fA2c1', 'enabled': True,
         'models': ['claude-sonnet-4.5'], 'realm': 'global', 'used_tokens': 182044,
         'used_credit': 12.5, 'quota': 0, 'expires_at': None, 'last_used_at': now - 300,
         'packet_id': None},
        {'id': 1, 'name': 'CI 冒烟', 'prefix': 'wbk_31bE0d', 'enabled': False, 'models': [],
         'realm': '', 'used_tokens': 0, 'used_credit': 0, 'quota': 0, 'expires_at': None,
         'last_used_at': None, 'packet_id': None},
    ]
    polls: dict[str, int] = {}

    def user(request: Request) -> dict:
        tok = request.cookies.get(COOKIE)
        if not tok or tok not in sessions:
            raise HTTPException(401, '未登录')
        return sessions[tok]

    @app.get('/api/healthz')
    def healthz():
        return {'ok': True, 'service': 'workbuddy-manager'}

    @app.post('/api/login')
    async def login(request: Request):
        body = await request.json()
        if body.get('username') != 'admin' or body.get('password') != 'admin':
            raise HTTPException(401, '用户名或密码错误')
        tok = secrets.token_urlsafe(16)
        sessions[tok] = {'username': 'admin', 'role': 'admin', 'ip': request.headers.get('x-real-ip')}
        resp = JSONResponse({'ok': True, 'username': 'admin', 'role': 'admin'})
        resp.set_cookie(COOKIE, tok, max_age=7 * 86400, httponly=True, samesite='lax', path='/')
        return resp

    @app.post('/api/logout')
    def logout():
        resp = JSONResponse({'ok': True})
        resp.delete_cookie(COOKIE, path='/')
        return resp

    @app.get('/api/me')
    def me(request: Request):
        u = user(request)
        return {'username': u['username'], 'role': u['role']}

    @app.get('/api/accounts')
    def list_accounts(request: Request):
        user(request)
        out = []
        for a in accounts:
            out.append({**a, 'note': notes.get(a['uid'], ''), 'enterprise_id': 'secret-ent',
                        'proxy_session': 'should-not-leak'})
        return {'total': len(out), 'accounts': out, 'pool_available': True,
                'upstream': {'id': 0, 'name': 'wb2api 默认组', 'is_default': True},
                'manageable': True}

    @app.post('/api/accounts/{file}/disabled')
    def set_disabled(file: str, request: Request, body: dict = Body(...)):
        user(request)
        for a in accounts:
            if a['file'] == file:
                a['manual_disabled'] = bool(body['disabled'])
                return {'ok': True, 'disabled': a['manual_disabled']}
        raise HTTPException(404, '账号不存在')

    @app.post('/api/accounts/{file}/test')
    async def test_account(file: str, request: Request):
        user(request)
        await asyncio.sleep(0.4)
        return {'ok': file != 'workbuddy-c2.json', 'message': '连通正常' if file != 'workbuddy-c2.json' else '令牌已过期'}

    @app.post('/api/auth/start')
    def auth_start(request: Request, body: dict = Body(None)):
        user(request)
        st = secrets.token_hex(8)
        polls[st] = 0
        realm = (body or {}).get('realm', 'cn')
        return {'state': st, 'authUrl': f'https://www.codebuddy.ai/login?state={st}', 'realm': realm}

    @app.get('/api/auth/poll')
    def auth_poll(state: str, request: Request):
        user(request)
        if state not in polls:
            return {'status': 'invalid'}
        polls[state] += 1
        if polls[state] < 3:
            return {'status': 'waiting'}
        uid = str(100000300000 + len(accounts))
        accounts.insert(0, {'file': f'workbuddy-n{len(accounts)}.json', 'uid': uid, 'nickname': 'NewStar',
                            'realm': 'global', 'in_pool': True, 'cooling': False, 'disabled': False,
                            'manual_disabled': False, 'credits': 500, 'in_flight': 0, 'is_expired': False})
        polls.pop(state)
        return {'status': 'success', 'nickname': 'NewStar'}

    @app.get('/api/stats/summary')
    def summary(request: Request, realm: str | None = None):
        user(request)
        return {'today_requests': 1284, 'today_tokens': 3_912_440, 'today_credit': 86.4,
                'top_model': 'claude-sonnet-4.5', 'usage_health': {'ok': True, 'detail': ''},
                'failures': {'today_4xx': 3, 'today_5xx': 0, 'week_4xx': 9, 'week_5xx': 2}}

    @app.get('/api/stats/hourly')
    def hourly(request: Request, realm: str | None = None):
        user(request)
        import math
        h_now = time.localtime().tm_hour
        return [{'day': time.strftime('%Y-%m-%d'), 'hour': h,
                 'requests': 0 if h > h_now else int(40 + 35 * math.sin(h / 3.2) + h * 2),
                 'prompt_tokens': 0 if h > h_now else 90000 + h * 3000,
                 'completion_tokens': 0 if h > h_now else 30000 + h * 900, 'failed': 0}
                for h in range(24)]

    @app.get('/api/keys')
    def list_keys(request: Request):
        user(request)
        return keys

    @app.post('/api/keys')
    def create_key(request: Request, body: dict = Body(...)):
        user(request)
        kid = max((k['id'] for k in keys), default=0) + 1
        token = 'wbk_' + secrets.token_urlsafe(24)
        k = {'id': kid, 'name': body['name'], 'prefix': token[:10], 'enabled': True,
             'models': body.get('models') or [], 'realm': body.get('realm') or '',
             'used_tokens': 0, 'used_credit': 0, 'quota': 0, 'expires_at': None,
             'last_used_at': None, 'packet_id': None, 'ip_allowlist': []}
        keys.insert(0, k)
        return {**k, 'key': token}

    @app.patch('/api/keys/{kid}')
    def patch_key(kid: int, request: Request, body: dict = Body(...)):
        user(request)
        for k in keys:
            if k['id'] == kid:
                k.update(body)
                return k
        raise HTTPException(404, '密钥不存在')

    @app.delete('/api/keys/{kid}')
    def delete_key(kid: int, request: Request):
        user(request)
        for i, k in enumerate(keys):
            if k['id'] == kid:
                keys.pop(i)
                return {'ok': True}
        raise HTTPException(404, '密钥不存在')

    @app.get('/api/playground/models')
    def models(request: Request, realm: str = 'cn'):
        user(request)
        if realm == 'global':
            ms = [{'id': 'claude-sonnet-4.5', 'name': 'Claude Sonnet 4.5', 'efforts': ['low', 'medium', 'high'], 'series': 'Claude'},
                  {'id': 'gpt-5', 'name': 'GPT-5', 'efforts': ['minimal', 'low', 'medium', 'high'], 'series': 'GPT'}]
        else:
            ms = [{'id': 'hunyuan-t1', 'name': '混元 T1', 'efforts': [], 'series': '混元'},
                  {'id': 'deepseek-v3.1', 'name': 'DeepSeek V3.1', 'efforts': ['low', 'high'], 'series': 'DeepSeek'}]
        return {'models': ms, 'source': 'mock', 'realm': realm}

    @app.post('/api/playground/chat')
    async def chat(request: Request):
        user(request)
        body = await request.json()
        q = str(body['messages'][-1].get('content', ''))

        async def gen():
            think = f'用户问的是「{q[:40]}」。先确认意图，再给出简洁回答。'
            for ch in think:
                d = {'choices': [{'index': 0, 'delta': {'reasoning_content': ch}}]}
                yield f'data: {json.dumps(d, ensure_ascii=False)}\n\n'.encode()
                await asyncio.sleep(0.01)
            answer = f'**已收到**：{q}\n\n这是来自 `{body["model"]}` 的模拟回复。\n\n- 流式 ✓\n- 思维链 ✓'
            for i in range(0, len(answer), 3):
                d = {'choices': [{'index': 0, 'delta': {'content': answer[i:i + 3]}}]}
                yield f'data: {json.dumps(d, ensure_ascii=False)}\n\n'.encode()
                await asyncio.sleep(0.015)
            u = {'choices': [], 'usage': {'prompt_tokens': 42, 'completion_tokens': 96, 'credit': 0.12}}
            yield f'data: {json.dumps(u)}\n\n'.encode()
            yield b'data: [DONE]\n\n'

        return StreamingResponse(gen(), media_type='text/event-stream')

    return app


if __name__ == '__main__':
    import uvicorn
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=8795)
    a = p.parse_args()
    uvicorn.run(build(), host='127.0.0.1', port=a.port, log_level='warning')
