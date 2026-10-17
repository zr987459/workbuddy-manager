"""一个最小的假 core：只实现 BFF 用到的接口，行为对齐 server/ 的真实返回形状。"""
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

ACCOUNTS = [
    {'file': 'workbuddy-a.json', 'uid': 'u1', 'nickname': 'Alice', 'in_flight': 2, 'in_pool': True,
     'remain_seconds': 3600, 'success_count': 9},
    {'file': 'workbuddy-b.json', 'uid': 'u2', 'nickname': 'Bob', 'cooling': True, 'cool_remaining_sec': 125,
     'in_pool': True, 'in_flight': 1},
    {'file': 'workbuddy-c.json.disabled', 'uid': 'u3', 'nickname': 'Cat', 'disabled_by_panel': True},
    {'file': 'workbuddy-d.json', 'uid': 'u4', 'nickname': 'Dan', 'is_expired': True},
]


def make_core() -> FastAPI:
    app = FastAPI()
    app.state.calls = []
    app.state.keys = [{'id': 1, 'name': 'phone', 'prefix': 'wbk_abcd', 'enabled': True, 'models': [],
                       'quota': 1000, 'used_tokens': 250, 'realm': 'global'}]

    def auth(request: Request):
        c = request.cookies.get('wb_session')
        b = request.headers.get('authorization', '')
        if c in ('s1', 's2') or b == 'Bearer wbt_good':
            return
        raise HTTPException(401, '未登录')

    @app.middleware('http')
    async def log(request: Request, call_next):
        request.app.state.calls.append((request.method, request.url.path))
        resp = await call_next(request)
        # 模拟会话滑动续期
        if request.cookies.get('wb_session') == 's1' and request.url.path == '/api/stats/summary':
            resp.set_cookie('wb_session', 's2')
        return resp

    @app.get('/api/healthz')
    def healthz():
        return {'ok': True}

    @app.post('/api/login')
    def login(body: dict = Body(...)):
        if body.get('password') != 'pw':
            raise HTTPException(401, '用户名或密码错误')
        r = JSONResponse({'ok': True, 'username': body['username'], 'role': 'admin'})
        r.set_cookie('wb_session', 's1', httponly=True)
        return r

    @app.get('/api/me')
    def me(request: Request):
        auth(request)
        return {'username': 'token-user', 'role': 'admin'}

    @app.get('/api/status')
    def status(request: Request):
        auth(request)
        return {'connected': True}

    @app.get('/api/stats/summary')
    def summary(request: Request):
        auth(request)
        return {'today_requests': 100, 'today_tokens': 5000, 'today_credit': 1.5, 'top_model': 'gpt',
                'active_keys': 1, 'failures': {'today_4xx': 3, 'today_5xx': 2}}

    @app.get('/api/accounts')
    def accounts(request: Request):
        auth(request)
        return {'accounts': ACCOUNTS, 'pool_available': True, 'manageable': True}

    @app.post('/api/accounts/{file}/disabled')
    def disabled(file: str, request: Request, body: dict = Body(...)):
        auth(request)
        request.app.state.last_disabled = (file, body)
        return {'ok': True}

    @app.post('/api/auth/start')
    def start(request: Request, body: dict = Body(...)):
        auth(request)
        request.app.state.last_start = body
        return {'state': 'st_1', 'authUrl': 'https://www.workbuddy.ai/auth?s=1', 'realm': 'global'}

    @app.get('/api/auth/poll')
    def poll(request: Request, state: str, realm: str = '', region: str = ''):
        auth(request)
        return {'status': 'success', 'nickname': 'New', 'region_note': '地区已提交'}

    @app.get('/api/keys')
    def keys(request: Request):
        auth(request)
        return request.app.state.keys

    @app.post('/api/keys')
    def create(request: Request, body: dict = Body(...)):
        auth(request)
        row = {'id': 2, 'name': body['name'], 'prefix': 'wbk_new', 'enabled': True,
               'models': body.get('models', []), 'quota': 0, 'used_tokens': 0}
        return {**row, 'key': 'wbk_new_secret'}

    @app.patch('/api/keys/{kid}')
    def patch(kid: int, request: Request, body: dict = Body(...)):
        auth(request)
        return {'id': kid, 'name': 'phone', 'prefix': 'wbk_abcd', **body}

    @app.get('/api/playground/models')
    def models(request: Request, realm: str = 'cn'):
        auth(request)
        return {'models': [{'id': 'global:gpt-5', 'name': 'GPT-5', 'efforts': ['low', 'high']}]}

    @app.post('/api/playground/chat')
    async def chat(request: Request, body: dict = Body(...)):
        auth(request)
        request.app.state.last_chat = body

        async def gen():
            yield b'data: {"choices":[{"delta":{"reasoning_content":"think"}}]}\n\n'
            yield b'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'
            yield b'data: [DONE]\n\n'
        return StreamingResponse(gen(), media_type='text/event-stream')

    return app
