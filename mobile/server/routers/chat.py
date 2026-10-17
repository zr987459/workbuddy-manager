"""对话工作台：流式转发核心 /api/playground/chat（同一账号池、同一套计量）。

SSE 原样透传（OpenAI chat.completion.chunk，含 reasoning_content 与末帧 usage），
前端自己解析；这里不缓冲，保证首字延迟只多一次本地转发。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..core_client import CoreClient, CoreError, Cred, _detail
from ..deps import get_core, get_cred
from .overview import _realm

router = APIRouter(prefix='/m/api/chat', tags=['chat'])


class ChatIn(BaseModel):
    model: str = Field(min_length=1, max_length=128)
    messages: list[dict] = Field(min_length=1, max_length=200)
    reasoning_effort: str = Field(default='', max_length=16)
    temperature: float | None = None
    max_tokens: int | None = None
    realm: str | None = None
    stream: bool = True


@router.get('/models')
async def models(request: Request, realm: str | None = None, cred: Cred = Depends(get_cred),
                 core: CoreClient = Depends(get_core)) -> dict:
    r = _realm(request, realm)
    data = await core.get('/api/playground/models', cred, params={'realm': r})
    return {'realm': r, 'models': data.get('models') or []}


@router.post('')
async def chat(body: ChatIn, request: Request, cred: Cred = Depends(get_cred),
               core: CoreClient = Depends(get_core)):
    payload = body.model_dump(exclude_none=True)
    payload['realm'] = _realm(request, body.realm)
    if not body.stream:
        return await core.post('/api/playground/chat', cred, json=payload)

    cm = core.stream('POST', '/api/playground/chat', cred, json=payload)
    resp = await cm.__aenter__()
    if resp.status_code >= 400:
        await resp.aread()
        await cm.__aexit__(None, None, None)
        raise CoreError(resp.status_code, _detail(resp))
    ctype = resp.headers.get('content-type', 'text/event-stream')

    async def relay():
        try:
            async for chunk in resp.aiter_bytes():
                if await request.is_disconnected():
                    break
                yield chunk
        finally:
            await cm.__aexit__(None, None, None)

    if not ctype.startswith('text/event-stream'):
        body_bytes = b''.join([c async for c in relay()])
        return JSONResponse(status_code=resp.status_code, content=_json_or_text(body_bytes))
    return StreamingResponse(relay(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


def _json_or_text(b: bytes):
    import json
    try:
        return json.loads(b)
    except ValueError:
        return {'text': b.decode('utf-8', 'replace')}
