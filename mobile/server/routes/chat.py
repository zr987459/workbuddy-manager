"""对话工作台：流式转发到 core 的 /api/playground/chat（同一账号池、同一套计量）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..deps import Principal, csrf_guard, principal

router = APIRouter(prefix='/m/api/chat', tags=['chat'], dependencies=[Depends(csrf_guard)])


class ChatIn(BaseModel):
    model: str = Field(min_length=1, max_length=128)
    messages: list[dict] = Field(min_length=1, max_length=200)
    reasoning_effort: str = Field(default='', max_length=16)
    realm: str = Field(default='global', max_length=16)
    temperature: float | None = None
    max_tokens: int | None = None


@router.get('/models')
async def models(request: Request, realm: str = 'global', p: Principal = Depends(principal)) -> dict:
    r = 'global' if realm == 'global' else 'cn'
    return await request.app.state.core.request('GET', '/api/playground/models', p.auth, params={'realm': r})


@router.post('')
async def chat(body: ChatIn, request: Request, p: Principal = Depends(principal)) -> StreamingResponse:
    payload = body.model_dump(exclude_none=True)
    payload['stream'] = True
    status, ctype, it = await request.app.state.core.stream('POST', '/api/playground/chat', p.auth, json=payload)

    async def relay():
        # 客户端断开时 StreamingResponse 会取消这个生成器，finally 里关闭上游连接
        async for chunk in it:
            yield chunk

    return StreamingResponse(relay(), status_code=status, media_type=ctype or 'text/event-stream',
                             headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
