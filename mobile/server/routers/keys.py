"""API 密钥：卡片、一键生成（明文只出现一次）、启停、模型授权。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from .. import views
from ..core_client import CoreClient, Cred
from ..deps import get_core, get_cred
from .overview import _realm

router = APIRouter(prefix='/m/api/keys', tags=['keys'])


@router.get('')
async def list_keys(q: str | None = None, cred: Cred = Depends(get_cred),
                    core: CoreClient = Depends(get_core)) -> dict:
    rows = await core.get('/api/keys', cred) or []
    items = [views.key_card(k) for k in rows]
    if q:
        ql = q.strip().lower()
        items = [k for k in items if ql in k['name'].lower() or ql in k['prefix'].lower()]
    return {'items': items, 'total': len(items),
            'enabled': sum(1 for k in items if k['enabled'])}


class KeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    models: list[str] = Field(default_factory=list, max_length=500)
    quota: int = Field(default=0, ge=0)
    expires_at: int | None = None
    realm: str | None = None


@router.post('')
async def create_key(body: KeyCreate, request: Request, cred: Cred = Depends(get_cred),
                     core: CoreClient = Depends(get_core)) -> dict:
    realm = _realm(request, body.realm) if body.realm != '' else ''
    created = await core.post('/api/keys', cred, json={
        'name': body.name.strip(), 'models': body.models, 'quota': body.quota,
        'expires_at': body.expires_at, 'realm': realm,
    })
    base = str(request.base_url).rstrip('/')
    return {'key': created.get('key'), 'card': views.key_card(created),
            'hint': {'base_url': f'{request.app.state.settings.core_url}/v1',
                     'mobile_base': base}}


class KeyPatch(BaseModel):
    name: str | None = Field(default=None, max_length=64)
    enabled: bool | None = None
    models: list[str] | None = Field(default=None, max_length=500)
    quota: int | None = Field(default=None, ge=0)


@router.patch('/{key_id}')
async def update_key(key_id: int, body: KeyPatch, cred: Cred = Depends(get_cred),
                     core: CoreClient = Depends(get_core)) -> dict:
    out = await core.patch(f'/api/keys/{key_id}', cred, json=body.model_dump(exclude_unset=True))
    return views.key_card(out)


@router.delete('/{key_id}')
async def delete_key(key_id: int, cred: Cred = Depends(get_cred),
                     core: CoreClient = Depends(get_core)) -> dict:
    await core.delete(f'/api/keys/{key_id}', cred)
    return {'ok': True}


@router.get('/models')
async def models(request: Request, realm: str | None = None, cred: Cred = Depends(get_cred),
                 core: CoreClient = Depends(get_core)) -> dict:
    """模型授权 Chip 的数据源（与对话页同源）。"""
    r = _realm(request, realm)
    data = await core.get('/api/playground/models', cred, params={'realm': r})
    return {'realm': r, 'models': data.get('models') or [], 'source': data.get('source_label')}
