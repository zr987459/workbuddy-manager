"""WorkBuddy Mobile BFF 后端服务：轻量聚合、移动端会话代理与流式对话网关。"""
from __future__ import annotations

import os
import json
import asyncio
import logging
from typing import Optional
from fastapi import FastAPI, Request, HTTPException, Query, Body
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import httpx

logger = logging.getLogger("mobile.bff")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

CORE_URL = os.getenv("WB_CORE_URL", "http://127.0.0.1:8795").rstrip("/")
ADMIN_USER = os.getenv("WB_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("WB_ADMIN_PASSWORD", "admin123456")

app = FastAPI(title="WorkBuddy Mobile", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_admin_cookies: dict[str, str] = {}
_client: Optional[httpx.AsyncClient] = None

async def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    return _client

async def ensure_admin_auth() -> dict[str, str]:
    """确保拿到 core 的管理登录 Cookie。"""
    global _admin_cookies
    client = await get_http_client()
    try:
        # 简单测活
        if _admin_cookies:
            r = await client.get(f"{CORE_URL}/api/me", cookies=_admin_cookies, timeout=3.0)
            if r.status_code == 200:
                return _admin_cookies
    except Exception:
        pass

    try:
        r = await client.post(
            f"{CORE_URL}/api/login",
            json={"username": ADMIN_USER, "password": ADMIN_PASSWORD},
            timeout=5.0
        )
        if r.status_code == 200:
            _admin_cookies = dict(r.cookies)
            logger.info("已成功通过 Core 管理员鉴权")
            return _admin_cookies
        else:
            logger.warning(f"Core 登录失败: {r.status_code} {r.text}")
    except Exception as e:
        logger.error(f"连接 Core 异常: {e}")
    return {}

# ─────────────────── 聚合与移动端 API ───────────────────

@app.get("/m/api/overview")
async def get_overview():
    """移动端首页首屏聚合：1个请求并发收集网关状态、账号数与统计指标。"""
    cookies = await ensure_admin_auth()
    client = await get_http_client()

    health_task = client.get(f"{CORE_URL}/healthz", timeout=3.0)
    stats_task = client.get(f"{CORE_URL}/api/stats/summary", cookies=cookies, timeout=3.0)
    accounts_task = client.get(f"{CORE_URL}/api/accounts", cookies=cookies, timeout=3.0)

    health_res, stats_res, accounts_res = await asyncio.gather(
        health_task, stats_task, accounts_task, return_exceptions=True
    )

    is_online = False
    if not isinstance(health_res, Exception) and health_res.status_code == 200:
        is_online = health_res.json().get("upstream_ok", False)

    stats_data = {}
    if not isinstance(stats_res, Exception) and stats_res.status_code == 200:
        stats_data = stats_res.json()

    accounts_list = []
    if not isinstance(accounts_res, Exception) and accounts_res.status_code == 200:
        accounts_list = accounts_res.json().get("accounts", [])

    active_count = sum(1 for a in accounts_list if a.get("in_pool") and not a.get("disabled") and not a.get("cooling"))

    return {
        "status": "online" if is_online else "offline",
        "core_url": CORE_URL,
        "accounts": {
            "total": len(accounts_list),
            "active": active_count,
        },
        "stats": {
            "today_requests": stats_data.get("today_requests", 0),
            "today_tokens": stats_data.get("today_tokens", 0),
            "total_requests": stats_data.get("total_requests", 0),
            "total_tokens": stats_data.get("total_tokens", 0),
            "active_keys": stats_data.get("active_keys", 0),
        }
    }

@app.get("/m/api/accounts")
async def list_accounts():
    """获取精简后的账号卡片列表（过滤掉国内复杂的碎包积分噪点）。"""
    cookies = await ensure_admin_auth()
    client = await get_http_client()
    try:
        r = await client.get(f"{CORE_URL}/api/accounts", cookies=cookies, timeout=5.0)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        data = r.json()
        accounts = []
        for a in data.get("accounts", []):
            accounts.append({
                "uid": a.get("uid"),
                "nickname": a.get("nickname") or "未命名",
                "realm": a.get("realm", "cn"),
                "in_pool": a.get("in_pool", False),
                "cooling": a.get("cooling", False),
                "disabled": a.get("disabled", False),
                "is_expired": a.get("is_expired", False),
                "remain_days": round(a.get("remain_seconds", 0) / 86400, 1),
                "file": a.get("file"),
            })
        return {"accounts": accounts}
    except Exception as e:
        logger.error(f"读取账号异常: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/m/api/auth/start")
async def start_auth(realm: str = Body("global", embed=True), region: str = Body("HK", embed=True)):
    """发起移动端一键授权链接。"""
    cookies = await ensure_admin_auth()
    client = await get_http_client()
    try:
        r = await client.post(
            f"{CORE_URL}/api/auth/start",
            cookies=cookies,
            json={"realm": realm, "region": region},
            timeout=15.0
        )
        return r.json()
    except Exception as e:
        logger.error(f"发起授权异常: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/m/api/keys")
async def list_keys():
    """获取移动端 API Key 列表。"""
    cookies = await ensure_admin_auth()
    client = await get_http_client()
    r = await client.get(f"{CORE_URL}/api/keys", cookies=cookies, timeout=5.0)
    return r.json()

@app.post("/m/api/keys")
async def create_key(name: str = Body("Mobile-Key"), credit_limit: int = Body(0)):
    """生成新 Key。"""
    cookies = await ensure_admin_auth()
    client = await get_http_client()
    r = await client.post(
        f"{CORE_URL}/api/keys",
        cookies=cookies,
        json={"name": name, "credit_limit": credit_limit},
        timeout=5.0
    )
    return r.json()

@app.delete("/m/api/keys/{key_id}")
async def delete_key(key_id: int):
    """删除 Key。"""
    cookies = await ensure_admin_auth()
    client = await get_http_client()
    r = await client.delete(f"{CORE_URL}/api/keys/{key_id}", cookies=cookies, timeout=5.0)
    return r.json()

@app.get("/m/api/models")
async def list_models(realm: str = "global"):
    """拉取模型列表。"""
    cookies = await ensure_admin_auth()
    client = await get_http_client()
    r = await client.get(f"{CORE_URL}/api/models?realm={realm}", cookies=cookies, timeout=5.0)
    return r.json()

@app.post("/m/api/chat")
async def chat_stream(request: Request):
    """流式对话：利用 Core 的 playground 通道，管理员会话直连，原生 SSE 流式转发。"""
    body = await request.json()
    model = body.get("model", "global:deepseek-v4.1-flash")
    messages = body.get("messages", [])

    cookies = await ensure_admin_auth()

    payload = {
        "model": model,
        "messages": messages,
        "realm": "global" if "global:" in model else "cn",
        "stream": True,
    }

    async def stream_generator():
        upstream_client = httpx.AsyncClient(timeout=120.0)
        try:
            async with upstream_client.stream(
                "POST",
                f"{CORE_URL}/api/playground/chat",
                cookies=cookies,
                json=payload
            ) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    yield f"data: {json.dumps({'error': err_body.decode(errors='ignore')})}\n\n"
                    return
                async for chunk in response.aiter_lines():
                    if chunk:
                        yield f"{chunk}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            await upstream_client.aclose()

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

# ─────────────────── 静态文件托管 ───────────────────

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
