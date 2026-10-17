import ast
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from mobile.server.app import create_app
from mobile.server.settings import Settings

from .fake_core import make_core

H = {'X-WBM': '1'}


@pytest.fixture()
def env(tmp_path):
    core = make_core()
    app = create_app(Settings(core_url='http://core.test', web_dist=tmp_path),
                     transport=httpx.ASGITransport(app=core))
    with TestClient(app) as c:
        yield c, core


def login(c):
    r = c.post('/m/api/auth/login', json={'username': 'admin', 'password': 'pw'})
    assert r.status_code == 200, r.text
    return r


def test_login_keeps_core_cookie_server_side(env):
    c, _ = env
    r = login(c)
    assert 'wbm_sid' in r.cookies and 'wb_session' not in r.cookies
    assert 'samesite=strict' in r.headers['set-cookie'].lower()
    assert c.get('/m/api/auth/me').json()['role'] == 'admin'


def test_login_failure_passes_core_reason(env):
    c, _ = env
    r = c.post('/m/api/auth/login', json={'username': 'admin', 'password': 'bad'})
    assert r.status_code == 401 and '密码错误' in r.json()['detail']


def test_requires_auth(env):
    c, _ = env
    assert c.get('/m/api/overview').status_code == 401
    assert c.get('/m/api/healthz').json()['core'] is True


def test_overview_aggregates(env):
    c, _ = env
    login(c)
    o = c.get('/m/api/overview').json()
    assert o['state'] == 'ok'
    assert o['inflight'] == 3
    assert o['today'] == {'requests': 100, 'tokens': 5000, 'credit': 1.5, 'failed': 5,
                          'success_rate': 0.95, 'top_model': 'gpt', 'active_keys': 1}
    assert o['pool'] == {'ok': 1, 'cooling': 1, 'disabled': 1, 'expired': 1, 'error': 0,
                         'offline': 0, 'total': 4}


def test_core_cookie_renewal_is_absorbed(env):
    c, core = env
    login(c)
    c.get('/m/api/overview')  # summary 触发续期 s1 → s2
    sess = next(iter(c.app.state.sessions._items.values()))
    assert sess.auth.cookie == 's2'
    assert c.get('/m/api/accounts').status_code == 200


def test_account_cards_and_pills(env):
    c, _ = env
    login(c)
    acc = c.get('/m/api/accounts').json()['accounts']
    pills = {a['nickname']: (a['pill'], a['enabled']) for a in acc}
    assert pills == {'Alice': ('ok', True), 'Bob': ('cooling', True), 'Cat': ('disabled', False),
                     'Dan': ('expired', True)}
    assert acc[1]['reason'] == '冷却中，还剩 2:05'


def test_toggle_needs_csrf_header_and_forwards(env):
    c, core = env
    login(c)
    assert c.post('/m/api/accounts/workbuddy-a.json/enabled', json={'enabled': False}).status_code == 403
    r = c.post('/m/api/accounts/workbuddy-a.json/enabled', json={'enabled': False}, headers=H)
    assert r.status_code == 200
    assert core.state.last_disabled[0] == 'workbuddy-a.json'
    assert core.state.last_disabled[1]['disabled'] is True


def test_bad_filename_rejected(env):
    c, _ = env
    login(c)
    r = c.post('/m/api/accounts/evil.txt/enabled', json={'enabled': True}, headers=H)
    assert r.status_code == 400


def test_global_login_flow(env):
    c, core = env
    login(c)
    r = c.post('/m/api/accounts/login', json={'region': 'sg'}, headers=H).json()
    assert r == {'state': 'st_1', 'auth_url': 'https://www.workbuddy.ai/auth?s=1'}
    assert core.state.last_start == {'realm': 'global', 'region': 'SG'}
    p = c.get('/m/api/accounts/login/st_1').json()
    assert p['status'] == 'success' and p['done'] is True


def test_keys_create_returns_secret_once(env):
    c, _ = env
    login(c)
    ks = c.get('/m/api/keys').json()['keys']
    assert ks[0]['usage_ratio'] == 0.25
    k = c.post('/m/api/keys', json={'name': 'ipad', 'models': ['global:gpt-5']}, headers=H).json()
    assert k['secret'] == 'wbk_new_secret' and k['name'] == 'ipad'
    assert 'secret' not in c.get('/m/api/keys').json()['keys'][0]


def test_bearer_token_passthrough(env):
    c, _ = env
    assert c.get('/m/api/overview', headers={'Authorization': 'Bearer wbt_good'}).status_code == 200
    assert c.get('/m/api/overview', headers={'Authorization': 'Bearer wbk_gateway'}).status_code == 401
    assert c.get('/m/api/auth/me', headers={'Authorization': 'Bearer wbt_good'}).json()['via'] == 'token'


def test_chat_stream_relay(env):
    c, core = env
    login(c)
    with c.stream('POST', '/m/api/chat', json={'model': 'global:gpt-5',
                                                'messages': [{'role': 'user', 'content': 'hi'}]},
                  headers=H) as r:
        assert r.status_code == 200
        body = b''.join(r.iter_raw()).decode()
    assert 'reasoning_content' in body and '[DONE]' in body
    assert core.state.last_chat['stream'] is True and core.state.last_chat['realm'] == 'global'


def test_logout_revokes(env):
    c, _ = env
    login(c)
    c.post('/m/api/auth/logout')
    assert c.get('/m/api/overview').status_code == 401


def test_spa_fallback_and_traversal(env, tmp_path):
    c, _ = env
    assert '前端尚未构建' in c.get('/').text
    (tmp_path / 'index.html').write_text('<div id=root></div>')
    (tmp_path / 'sw.js').write_text('//sw')
    assert c.get('/keys').text == '<div id=root></div>'
    assert c.get('/sw.js').text == '//sw'
    assert c.get('/m/api/nope').status_code == 404
    r = c.get('/')
    assert "frame-ancestors 'none'" in r.headers['content-security-policy']


def test_mobile_never_imports_core_server():
    """解耦铁律：mobile/ 只通过 HTTP 访问 core，不能 import 仓库根目录的 server 包。"""
    base = Path(__file__).resolve().parents[1]
    for f in base.rglob('*.py'):
        if 'node_modules' in f.parts:
            continue
        tree = ast.parse(f.read_text(encoding='utf-8'))
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                assert node.module.split('.')[0] != 'server', f'{f} imports {node.module}'
            if isinstance(node, ast.Import):
                for n in node.names:
                    assert n.name.split('.')[0] != 'server', f'{f} imports {n.name}'


def test_core_session_never_leaks_between_clients(env):
    """登录后 core 的 wb_session 不能进共享客户端的 cookie 罐，被别人的请求顺带使用。"""
    c, _ = env
    login(c)
    assert len(c.app.state.core._client.cookies.jar) == 0
    other = TestClient(c.app)
    assert other.get('/m/api/overview').status_code == 401
    r = other.get('/m/api/auth/me', headers={'Authorization': 'Bearer wbt_bad'})
    assert r.status_code == 401
