"""BFF 契约测试：用 httpx.MockTransport 扮演核心 Manager。"""
from __future__ import annotations

import ast
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.config import Settings, parse_args
from server import views

ACCOUNTS = [
    {'file': 'workbuddy-a.json', 'uid': 'u1', 'nickname': 'Alice', 'realm': 'global',
     'in_pool': True, 'in_flight': 2, 'ttl_seconds': 100, 'remain_seconds': 50},
    {'file': 'workbuddy-b.json', 'uid': 'u2', 'nickname': 'Bob', 'realm': 'global',
     'in_pool': True, 'cooling': True, 'cool_remaining_sec': 600},
    {'file': 'workbuddy-c.json', 'uid': 'u3', 'nickname': 'Cn', 'realm': 'cn', 'in_pool': True},
    {'file': 'workbuddy-d.json', 'uid': 'u4', 'nickname': 'Dead', 'realm': 'global',
     'is_expired': True},
]


class FakeCore:
    def __init__(self):
        self.calls: list[httpx.Request] = []
        self.fail: set[str] = set()

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.calls.append(req)
        p = req.url.path
        if p in self.fail:
            return httpx.Response(500, json={'detail': f'{p} boom'})
        if p == '/api/healthz':
            return httpx.Response(200, json={'ok': True})
        if p == '/api/login':
            body = json.loads(req.content)
            if body['password'] != 'pw':
                return httpx.Response(401, json={'detail': '用户名或密码错误'})
            return httpx.Response(200, json={'ok': True, 'username': 'admin', 'role': 'admin'},
                                  headers={'set-cookie': 'wb_session=core-tok; Path=/; HttpOnly'})
        cookie = req.headers.get('cookie', '')
        bearer = req.headers.get('authorization', '')
        if 'wb_session=core-tok' not in cookie and bearer != 'Bearer wbt_ok':
            return httpx.Response(401, json={'detail': '未登录'})
        if p == '/api/me':
            return httpx.Response(200, json={'username': 'admin', 'role': 'admin'},
                                  headers={'set-cookie': 'wb_session=core-tok; Path=/'})
        if p == '/api/status':
            return httpx.Response(200, json={'connected': True, 'version': 'v1'})
        if p == '/api/stats/summary':
            return httpx.Response(200, json={'today_requests': 98, 'today_tokens': 1234,
                                             'today_credit': 1.5, 'failures': {'today_4xx': 1, 'today_5xx': 1}})
        if p == '/api/accounts':
            return httpx.Response(200, json={'accounts': ACCOUNTS, 'manageable': True,
                                             'pool_available': True})
        if p == '/api/logs':
            return httpx.Response(200, json={'total': 1, 'items': [
                {'id': 9, 'ts': 1, 'status': 503, 'model': 'm', 'error': 'no healthy account'}]})
        if p == '/api/keys' and req.method == 'POST':
            body = json.loads(req.content)
            return httpx.Response(200, json={'id': 7, 'name': body['name'], 'prefix': 'wbk_ab',
                                             'enabled': True, 'models': body['models'],
                                             'realm': body['realm'], 'key': 'wbk_secret'})
        if p == '/api/keys':
            return httpx.Response(200, json=[{'id': 1, 'name': 'k', 'prefix': 'wbk_x', 'enabled': 1,
                                              'quota': 100, 'used_tokens': 25}])
        if p.endswith('/disabled'):
            return httpx.Response(200, json={'ok': True, 'echo': json.loads(req.content)})
        if p == '/api/auth/start':
            return httpx.Response(200, json={'state': 's1', 'authUrl': 'https://www.workbuddy.ai/x',
                                             'realm': json.loads(req.content)['realm']})
        if p == '/api/auth/poll':
            return httpx.Response(200, json={'status': 'success', 'uid': 'u9', 'nickname': 'New'})
        if p == '/api/playground/chat':
            sse = (b'data: {"choices":[{"delta":{"reasoning_content":"hm"}}]}\n\n'
                   b'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n')
            return httpx.Response(200, content=sse, headers={'content-type': 'text/event-stream'})
        return httpx.Response(404, json={'detail': 'nope'})


@pytest.fixture
def env(tmp_path):
    core = FakeCore()
    s = Settings(core_url='http://core', data_dir=tmp_path, static_dir=tmp_path / 'dist')
    app = create_app(s, transport=httpx.MockTransport(core))
    with TestClient(app) as c:
        yield c, core


def login(c):
    r = c.post('/m/api/auth/login', json={'username': 'admin', 'password': 'pw'})
    assert r.status_code == 200, r.text
    assert c.cookies.get('wbm_session') == 'core-tok'


def test_cli_args():
    s = parse_args(['--port', '8796', '--core-url', 'http://127.0.0.1:8795/'])
    assert s.port == 8796 and s.core_url == 'http://127.0.0.1:8795' and s.realm == 'global'


def test_login_failure_shape(env):
    c, _ = env
    r = c.post('/m/api/auth/login', json={'username': 'a', 'password': 'bad'})
    assert r.status_code == 401
    assert r.json()['error']['message'] == '用户名或密码错误'


def test_requires_auth_without_calling_core(env):
    c, core = env
    assert c.get('/m/api/overview').status_code == 401
    assert core.calls == []


def test_rejects_gateway_key_as_bearer(env):
    c, _ = env
    r = c.get('/m/api/keys', headers={'Authorization': 'Bearer wbk_123'})
    assert r.status_code == 401


def test_bearer_token_passthrough(env):
    c, _ = env
    r = c.get('/m/api/keys', headers={'Authorization': 'Bearer wbt_ok'})
    assert r.status_code == 200 and r.json()['items'][0]['usage_ratio'] == 0.25


def test_overview_aggregates_global_only(env):
    c, _ = env
    login(c)
    d = c.get('/m/api/overview').json()
    assert d['realm'] == 'global'
    assert d['pool']['total'] == 3  # cn 账号被过滤
    assert d['pool']['busy'] == 1 and d['pool']['cooling'] == 1 and d['pool']['expired'] == 1
    assert d['inflight'] == 2
    assert d['today']['requests'] == 98 and d['today']['failures'] == 2
    assert d['today']['success_rate'] == 0.98
    assert d['gateway']['state'] == 'degraded'  # 1/3 可用
    assert d['recent_errors'][0]['status'] == 503
    assert d['errors'] == {}


def test_overview_partial_failure(env):
    c, core = env
    login(c)
    core.fail.add('/api/stats/summary')
    d = c.get('/m/api/overview').json()
    assert d['today'] is None and 'summary' in d['errors']
    assert d['pool'] is not None


def test_accounts_filters_and_sorts(env):
    c, _ = env
    login(c)
    d = c.get('/m/api/accounts').json()
    assert [i['pill'] for i in d['items']] == ['expired', 'cooling', 'busy']
    assert c.get('/m/api/accounts?pill=usable').json()['items'][0]['name'] == 'Alice'
    assert c.get('/m/api/accounts?realm=cn').json()['counts']['total'] == 1


def test_toggle_maps_to_core_disabled(env):
    c, _ = env
    login(c)
    r = c.post('/m/api/accounts/workbuddy-a.json/toggle', json={'enabled': False})
    assert r.json()['echo']['disabled'] is True
    assert c.post('/m/api/accounts/evil.json/toggle', json={'enabled': True}).status_code == 400


def test_global_login_flow(env):
    c, _ = env
    login(c)
    s = c.post('/m/api/accounts/login', json={'region': 'hk'}).json()
    assert s['realm'] == 'global' and s['auth_url'].startswith('https://www.workbuddy.ai')
    p = c.get('/m/api/accounts/login/s1?region=hk').json()
    assert p['status'] == 'success' and p['done'] is True


def test_create_key_returns_plaintext_once(env):
    c, _ = env
    login(c)
    d = c.post('/m/api/keys', json={'name': 'phone', 'models': ['glm-5']}).json()
    assert d['key'] == 'wbk_secret' and d['card']['realm'] == 'global'
    assert 'key' not in d['card']


def test_chat_stream_passthrough(env):
    c, _ = env
    login(c)
    with c.stream('POST', '/m/api/chat', json={'model': 'm', 'messages': [{'role': 'user', 'content': 'x'}]}) as r:
        body = b''.join(r.iter_raw())
    assert r.headers['content-type'].startswith('text/event-stream')
    assert b'reasoning_content' in body and b'[DONE]' in body


def test_settings_roundtrip(env):
    c, _ = env
    login(c)
    assert c.put('/m/api/settings', json={'realm': 'cn'}).json()['prefs']['realm'] == 'cn'
    assert c.put('/m/api/settings', json={'realm': 'xx'}).status_code == 400


def test_core_unreachable(tmp_path):
    def boom(req):
        raise httpx.ConnectError('down')
    app = create_app(Settings(core_url='http://core', data_dir=tmp_path, static_dir=tmp_path),
                     transport=httpx.MockTransport(boom))
    with TestClient(app) as c:
        m = c.get('/m/api/meta').json()
        assert m['core']['reachable'] is False


def test_spa_not_built_message(env):
    c, _ = env
    r = c.get('/accounts')
    assert r.status_code == 503 and r.json()['error']['code'] == 'web_not_built'


def test_pill_priority():
    assert views.account_pill({'is_expired': True, 'cooling': True})[0] == 'expired'
    assert views.account_pill({'manual_disabled': True, 'in_pool': True})[0] == 'paused'


def test_never_imports_core_package():
    """解耦铁律：mobile/server 不得 import 仓库根的核心模块。"""
    root = Path(__file__).resolve().parents[1]
    banned = ('keysvc', 'tokensvc', 'security', 'db', 'upstreamsvc', 'iputil')
    for f in root.rglob('*.py'):
        tree = ast.parse(f.read_text(encoding='utf-8'))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                assert node.module.split('.')[-1] not in banned, f'{f}: {node.module}'
            if isinstance(node, ast.Import):
                for n in node.names:
                    assert not n.name.startswith('server.services'), f
