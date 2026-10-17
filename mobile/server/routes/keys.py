"""API 密钥：生成 / 启停 / 模型授权 / 删除。明文只在创建时返回一次。"""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import KeyCreateIn, KeyPatchIn, slim_key
from . import core

router = APIRouter(tags=['keys'])


@router.get('/keys')
async def list_keys(request: Request):
    return await core(request).passthrough(
        request, 'GET', '/api/keys',
        shape=lambda d: {'keys': [slim_key(k) for k in (d if isinstance(d, list) else [])]},
    )


@router.post('/keys')
async def create_key(body: KeyCreateIn, request: Request):
    def shape(d: dict) -> dict:
        out = slim_key(d)
        out['key'] = d.get('key') or ''   # 明文，仅此一次
        return out
    return await core(request).passthrough(
        request, 'POST', '/api/keys',
        json_body={'name': body.name.strip(), 'models': body.models, 'realm': body.realm},
        shape=shape,
    )


@router.patch('/keys/{key_id}')
async def patch_key(key_id: int, body: KeyPatchIn, request: Request):
    return await core(request).passthrough(
        request, 'PATCH', f'/api/keys/{key_id}',
        json_body=body.model_dump(exclude_none=True), shape=slim_key,
    )


@router.delete('/keys/{key_id}')
async def delete_key(key_id: int, request: Request):
    return await core(request).passthrough(request, 'DELETE', f'/api/keys/{key_id}')
