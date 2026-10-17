"""API 密钥：列表、一键生成（明文只返回一次）、启停与模型授权、删除。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from .. import dto
from ..deps import Principal, csrf_guard, principal

router = APIRouter(prefix='/m/api/keys', tags=['keys'], dependencies=[Depends(csrf_guard)])


@router.get('')
async def list_keys(request: Request, p: Principal = Depends(principal)) -> dict:
    rows = await request.app.state.core.request('GET', '/api/keys', p.auth)
    return {'keys': [dto.key_card(k) for k in rows or []]}


class KeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    models: list[str] = Field(default_factory=list, max_length=200)
    quota: int = Field(default=0, ge=0)
    expires_at: int | None = None
    realm: str = Field(default='global', max_length=16)


@router.post('')
async def create_key(body: KeyCreate, request: Request, p: Principal = Depends(principal)) -> dict:
    created = await request.app.state.core.request('POST', '/api/keys', p.auth, json=body.model_dump())
    card = dto.key_card(created)
    # 明文只在这一次响应里出现（core 的语义），前端展示一次后丢弃
    card['secret'] = created.get('key') or created.get('secret') or ''
    return card


class KeyPatch(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    enabled: bool | None = None
    models: list[str] | None = Field(default=None, max_length=200)
    quota: int | None = Field(default=None, ge=0)


@router.patch('/{key_id}')
async def patch_key(key_id: int, body: KeyPatch, request: Request, p: Principal = Depends(principal)) -> dict:
    out = await request.app.state.core.request(
        'PATCH', f'/api/keys/{key_id}', p.auth, json=body.model_dump(exclude_none=True))
    return dto.key_card(out) if isinstance(out, dict) and 'id' in out else {'ok': True}


@router.delete('/{key_id}')
async def delete_key(key_id: int, request: Request, p: Principal = Depends(principal)) -> dict:
    await request.app.state.core.request('DELETE', f'/api/keys/{key_id}', p.auth)
    return {'ok': True}


@router.get('/models')
async def models(request: Request, realm: str = 'global', p: Principal = Depends(principal)) -> dict:
    """模型授权用的候选清单（与对话工作台同源）。"""
    r = 'global' if realm == 'global' else 'cn'
    data = await request.app.state.core.request('GET', '/api/playground/models', p.auth, params={'realm': r})
    return {'models': data.get('models', [])}
