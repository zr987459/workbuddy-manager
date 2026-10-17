# WorkBuddy Mobile

为手机重做的独立管理端：**BFF（FastAPI）+ PWA（React）**，一个进程、一个端口。
桌面版 Manager（仓库根目录 `server/`，下称 core）保持不动，移动端只通过 core 的 HTTP 接口工作。

```
手机浏览器 / PWA ──HTTPS──► mobile BFF :8796 ──HTTP──► core（Manager）:7864 ──► wb2api ──► workbuddy.ai
                             ├─ /          PWA 静态资源（web/dist，已随仓库提交）
                             └─ /m/api/*   设置 · 鉴权代理 · 聚合统计 · 流式转发
```

## 运行

```bash
pip install -r mobile/requirements.txt          # fastapi / uvicorn / httpx，与 core 相同
python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795
# 浏览器打开 http://127.0.0.1:8796 ，用 core 的管理员账号登录
```

| 参数 | 环境变量 | 默认 | 说明 |
|---|---|---|---|
| `--port` | `MOBILE_PORT` | 8796 | 监听端口 |
| `--host` | `MOBILE_HOST` | 127.0.0.1 | 局域网访问用 0.0.0.0（务必放在 HTTPS 反代 / Tailscale 之后） |
| `--core-url` | `MOBILE_CORE_URL` | http://127.0.0.1:7864 | core 地址 |
| `--gateway-url` | `MOBILE_GATEWAY_URL` | 同 core-url | 下游客户端调 `/v1` 的公开地址（「复制为 curl」用） |
| `--allowed-origin` | `MOBILE_ALLOWED_ORIGINS` | 空 | 跨源客户端（APK 壳 `capacitor://localhost`），可重复 |

## 四个 Tab

| Tab | 能力 | BFF 接口 | core 接口 |
|---|---|---|---|
| 概览 | 网关状态、在途连接、今日请求 / Token / 成功率、账号池分段条；SSE 实时 | `GET /m/api/overview`、`GET /m/api/live` | `/api/healthz` `/api/status` `/api/stats/summary` `/api/accounts`（并发聚合，单路失败只降级对应卡片） |
| 账号 | 卡片流 + 状态胶囊、开关启停（乐观更新）、刷新 Token、解除冷却、国际版一键授权（选地区 → 本机打开授权页 → 自动轮询） | `/m/api/accounts*` | `/api/accounts` `/api/accounts/{f}/disabled|refresh|clear-cooling` `/api/auth/start|poll`（realm=global） |
| 密钥 | 一键生成并复制（明文只显示一次）、复制为 curl、模型 Chip 授权、启停、删除 | `/m/api/keys*` | `/api/keys` `/api/playground/models` |
| 对话 | 流式回复、可折叠思维链、首字延迟 / Token / 积分、停止、本机保存最近 60 条 | `POST /m/api/chat` | `/api/playground/chat`（同一账号池与计量，管理员限定） |

## 安全设计

- **core 会话不出服务端**：登录时 BFF 代调 `POST /api/login`，`wb_session` 只存在 BFF 内存；浏览器拿到的是不透明的 `wbm_sid`（HttpOnly、SameSite=Strict）。登出立即作废，BFF 重启需重新登录。
- **共享 HTTP 客户端禁用 cookie 罐**：否则一个人登录后，所有人的请求都会顺带 core 会话（有测试覆盖）。
- **写操作必须带 `X-WBM: 1`**：跨站表单发不出自定义头，跨站 fetch 会被预检拦下。
- **APK / 脚本**用 core 的管理面令牌：`Authorization: Bearer wbt_...` 原样转发；`wbk_` 网关密钥会被拒绝。
- BFF 只暴露白名单接口，不做 `/api/*` 通配转发；账号文件名、state、地区在 BFF 先校验一遍，最终以 core 为准。
- 调 core 不读取 `HTTP(S)_PROXY`（直连一跳）；PWA 的 Service Worker 不缓存 `/m/api/*`。

## 开发

```bash
cd mobile/web && npm ci && npm run dev          # Vite :5173，/m/api 代理到 :8796
npm run build                                   # 产物写入 mobile/web/dist（提交到仓库，保证 python 直接可跑）
python -m pytest mobile/tests -q                # 用假 core 跑 BFF 契约测试
```

解耦约束（`tests/test_bff.py::test_mobile_never_imports_core_server` 强制）：`mobile/` 不 import 根目录 `server` 包；`server/` 与 `web/` 也不引用 `mobile/`。
