"""移动端偏好（本进程自己的，不写核心）。修改需要核心 admin 角色。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import __version__
from ..core_client import CoreClient, Cred
from ..deps import get_core, get_cred

router = APIRouter(prefix='/m/api/settings', tags=['settings'])


class PrefsIn(BaseModel):
    realm: str | None = None


@router.get('')
async def get_settings(request: Request, cred: Cred = Depends(get_cred),
                       core: CoreClient = Depends(get_core)) -> dict:
    me = await core.get('/api/me', cred)
    s = request.app.state.settings
    return {
        'prefs': request.app.state.prefs.data,
        'core_url': s.core_url,
        'version': __version__,
        'user': me,
    }


@router.put('')
async def put_settings(body: PrefsIn, request: Request, cred: Cred = Depends(get_cred),
                       core: CoreClient = Depends(get_core)) -> dict:
    me = await core.get('/api/me', cred)
    if (me or {}).get('role') != 'admin':
        raise HTTPException(status_code=403, detail='需要管理员权限')
    patch = body.model_dump(exclude_unset=True)
    if 'realm' in patch:
        if patch['realm'] not in ('global', 'cn'):
            raise HTTPException(status_code=400, detail='realm 只能是 global 或 cn')
    request.app.state.prefs.update(patch)
    return {'prefs': request.app.state.prefs.data}
