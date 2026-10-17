"""BFF 契约测试：用 dev/mock_core 作为 core 桩，经 ASGITransport 直连，不起端口。

    cd <repo> && python -m pytest mobile/tests -q
"""
from __future__ import annotations

import json
import pathlib
import re

import httpx
import pytest

from mobile.dev.mock_core import build as build_core
from mobile.server.app import create_app
from mobile.server.settings import Settings

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return 'asyncio'


def make_app():
    core = build_core()
    s = Settings(core_url='http://core.test')
    return create_app(s, transport=httpx.ASGITransport(app=core))


def client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://m.test')


async def login(c: httpx.AsyncClient):
    r = await c.post('/m/api/auth/login', json={'username': 'admin', 'password': 'admin'})
    assert r.status_code == 200, r.text
    return r


async def test_login_rewrites_session_cookie():
    app = make_app()
    async with client(app) as c:
        r = await login(c)
        sc = r.headers['set-cookie']
        assert sc.startswith('wbm_session=')
        assert 'HttpOnly' in sc and 'Path=/m' in sc and 'samesite=lax' in sc.lower()
        assert 'wb_session' not in sc
        assert (await c.get('/m/api/auth/me')).json()['role'] == 'admin'


async def test_bad_password_passes_core_detail():
    app = make_app()
    async with client(app) as c:
        r = await c.post('/m/api/auth/login', json={'username': 'admin', 'password': 'x'})
        assert r.status_code == 401
        assert r.json()['detail'] == '用户名或密码错误'
        assert 'set-cookie' not in r.headers


async def test_sessions_never_shared_between_browsers():
    """出站 httpx 客户端不得缓存 core 的 Set-Cookie，否则 A 的会话会发给 B。"""
    app = make_app()
    async with client(app) as a, client(app) as b:
        await login(a)
        assert (await a.get('/m/api/auth/me')).status_code == 200
        assert (await b.get('/m/api/auth/me')).status_code == 401
        assert len(app.state.core.http.cookies.jar) == 0


async def test_logout_clears_cookie():
    app = make_app()
    async with client(app) as c:
        await login(c)
        r = await c.post('/m/api/auth/logout')
        assert 'wbm_session=""' in r.headers['set-cookie'] or 'Max-Age=0' in r.headers['set-cookie']


async def test_dash_aggregates_and_counts_inflight():
    app = make_app()
    async with client(app) as c:
        await login(c)
        d = (await c.get('/m/api/dash')).json()
        assert d['errors'] == {}
        assert d['gateway']['inflight'] == 2
        assert d['gateway']['level'] == 'ok'
        assert d['pool'] == {'total': 4, 'available': 1, 'cooling': 1, 'disabled': 1, 'problem': 1}
        assert d['today']['requests'] == 1284 and d['today']['failed'] == 3
        assert len(d['hourly']) == 24
        g = (await c.get('/m/api/dash?realm=global')).json()
        assert g['pool']['total'] == 2


async def test_dash_requires_login():
    app = make_app()
    async with client(app) as c:
        assert (await c.get('/m/api/dash')).status_code == 401


async def test_accounts_are_slimmed():
    app = make_app()
    async with client(app) as c:
        await login(c)
        d = (await c.get('/m/api/accounts')).json()
        raw = json.dumps(d)
        assert 'secret-ent' not in raw and 'should-not-leak' not in raw
        states = {a['nickname']: a['state'] for a in d['accounts']}
        assert states['Aurora'] == 'busy' and states['Borealis'] == 'cooling'
        assert states['晨星'] == 'disabled'


async def test_toggle_and_authorize_flow():
    app = make_app()
    async with client(app) as c:
        await login(c)
        r = await c.post('/m/api/accounts/workbuddy-c1.json/toggle', json={'disabled': False})
        assert r.status_code == 200
        st = (await c.post('/m/api/accounts/authorize', json={'realm': 'global', 'region': 'HK'})).json()
        assert st['auth_url'].startswith('https://') and st['state']
        seen = [(await c.get(f"/m/api/accounts/authorize/{st['state']}")).json()['status'] for _ in range(3)]
        assert seen == ['waiting', 'waiting', 'success']


async def test_path_segment_rejects_traversal():
    app = make_app()
    async with client(app) as c:
        await login(c)
        r = await c.post('/m/api/accounts/..%2F..%2Fapi%2Fkeys/test')
        assert r.status_code in (400, 404)


async def test_keys_plaintext_once_and_patch_whitelist():
    app = make_app()
    async with client(app) as c:
        await login(c)
        r = (await c.post('/m/api/keys', json={'name': '手机', 'models': ['gpt-5'], 'realm': 'global'})).json()
        assert r['key'].startswith('wbk_')
        listed = (await c.get('/m/api/keys')).json()['keys']
        assert all('key' not in k for k in listed)
        bad = await c.patch(f"/m/api/keys/{r['id']}", json={'ip_allowlist': ['0.0.0.0/0']})
        assert bad.status_code == 422
        ok = await c.patch(f"/m/api/keys/{r['id']}", json={'enabled': False})
        assert ok.json()['enabled'] is False


async def test_chat_streams_sse():
    app = make_app()
    async with client(app) as c:
        await login(c)
        body = {'model': 'gpt-5', 'realm': 'global', 'messages': [{'role': 'user', 'content': 'hi'}]}
        async with c.stream('POST', '/m/api/chat', json=body) as r:
            assert r.status_code == 200
            assert r.headers['content-type'].startswith('text/event-stream')
            assert r.headers['x-accel-buffering'] == 'no'
            text = ''.join([t async for t in r.aiter_text()])
        assert 'reasoning_content' in text and '[DONE]' in text and '"credit"' in text


async def test_csrf_guards():
    app = make_app()
    async with client(app) as c:
        await login(c)
        r = await c.post('/m/api/keys', json={'name': 'x'}, headers={'Origin': 'https://evil.example'})
        assert r.status_code == 403
        r = await c.post('/m/api/keys', content='name=x', headers={'Content-Type': 'application/x-www-form-urlencoded'})
        assert r.status_code == 415


async def test_unlisted_core_endpoints_not_exposed():
    app = make_app()
    async with client(app) as c:
        await login(c)
        for p in ('/m/api/accounts/checkin-all', '/m/api/redpackets', '/m/api/tokens'):
            assert (await c.post(p, json={})).status_code in (404, 405)


async def test_spa_fallback_and_headers():
    app = make_app()
    async with client(app) as c:
        r = await c.get('/', follow_redirects=False)
        assert r.status_code == 307 and r.headers['location'] == '/m/'
        r = await c.get('/m/keys')
        assert r.status_code in (200, 503)
        assert "frame-ancestors 'none'" in r.headers['content-security-policy']
        assert (await c.get('/m/../server/app.py')).status_code == 404


def test_bff_never_imports_core_package():
    root = pathlib.Path(__file__).resolve().parents[1]
    pat = re.compile(r'^\s*(from|import)\s+server(\.|\s|$)', re.M)
    for f in root.rglob('*.py'):
        if 'node_modules' in f.parts:
            continue
        assert not pat.search(f.read_text(encoding='utf-8')), f
