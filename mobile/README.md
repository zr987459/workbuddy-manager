# WorkBuddy Mobile

独立运行、移动端优先的管理 App：**轻量 BFF（FastAPI）+ PWA（Vite/React）**，
与桌面管理后台完全解耦——不 import 核心代码，只经 HTTP 调用核心 Manager。

```
手机浏览器 / PWA / APK ──► mobile/main.py :8796（BFF + 静态 PWA）
                              │  /m/api/*  卡片 DTO · 聚合 · SSE
                              ▼  HTTP（鉴权透传）
                        核心 Manager :7864（server/main.py）──► workbuddy2api ──► workbuddy.ai
                              └─ /v1/* 网关数据面仍由核心提供
```

## 运行

```bash
pip install -r mobile/requirements.txt
python mobile/main.py --port 8796 --core-url http://127.0.0.1:7864
# 打开 http://<主机>:8796 ，用桌面版的管理员账号登录
```

`mobile/web/dist` 已随仓库提交，无需 Node 即可运行。修改前端后：

```bash
cd mobile/web && npm ci && npm run build      # 产物写入 dist/
npm run dev                                   # 开发：5173 端口，/m/api 代理到 8796
```

没有真实上游时可用假核心演示：

```bash
python mobile/dev/mock_core.py --port 8795
python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795   # 登录 admin / admin
```

参数（均可用环境变量，见 `.env.example`）：`--host` `--port` `--core-url` `--realm global|cn`
`--secure-cookie auto|true|false` `--allowed-origins` `--data-dir` `--static-dir` `--core-timeout`。

## 鉴权

| 场景 | 方式 |
|---|---|
| PWA（同源） | 账号密码 → BFF 代登录核心 `/api/login`，把核心的 `wb_session` 存为本源 HttpOnly cookie `wbm_session`；核心续期时自动回写 |
| APK / 跨源 | 管理面 API Token `wbt_…`，`Authorization: Bearer` 原样透传 |
| 拒绝 | 网关密钥 `wbk_…` 不能用于管理面（BFF 直接 401） |

BFF 不保存密码、不签发身份，角色（admin / viewer）完全由核心判定。

## 接口（`/m/api/docs` 有 OpenAPI）

| 模块 | 接口 | 对应核心 |
|---|---|---|
| 元信息 | `GET /meta`（免登录，含核心连通性） | `/api/healthz` |
| 鉴权 | `POST /auth/login` `POST /auth/logout` `GET /auth/me` | `/api/login` `/api/logout` `/api/me` |
| 设置 | `GET/PUT /settings`（默认 realm，存 `data/prefs.json`） | `/api/me` |
| 概览 | `GET /overview` · `GET /live`（SSE，5s） | `/api/status` `/api/stats/summary` `/api/accounts` `/api/logs?status=error` 并发聚合，单项失败不拖垮整页 |
| 账号 | `GET /accounts?pill=&q=` · `POST /accounts/{file}/toggle·refresh·test` · `POST /accounts/login` · `GET /accounts/login/{state}` | `/api/accounts*` `/api/auth/start·poll` |
| 密钥 | `GET/POST /keys` · `PATCH/DELETE /keys/{id}` · `GET /keys/models` | `/api/keys*` `/api/playground/models` |
| 对话 | `POST /chat`（SSE 原样透传）· `GET /chat/models` | `/api/playground/chat` |

## 目录

```
mobile/
  main.py               入口（把 mobile/ 置于 sys.path 首位，避免与核心 server 包同名冲突）
  server/
    config.py           CLI / 环境变量
    core_client.py      核心 HTTP 适配器（唯一边界；trust_env=False，不走系统代理）
    deps.py             取凭据（cookie / Bearer wbt_）
    views.py            核心数据 → 卡片 DTO（纯函数）
    prefs.py            偏好原子写
    routers/            meta auth settings overview accounts keys chat
    tests/test_bff.py   契约测试（MockTransport 扮演核心）+ 解耦铁律检查
  web/                  Vite + React 19 + TS（零运行时依赖，除 React）
    src/features/       overview accounts keys chat auth settings
    src/ui/             胶囊 · 开关 · 分段 · Bottom Sheet · Toast · 骨架屏
    src/theme/          M3 设计令牌（浅 / 深色自动）
    public/             manifest · sw.js（只缓存 App Shell，/m/api 永远走网络）
  dev/mock_core.py      假核心
```

## 测试

```bash
cd mobile && python -m pytest       # 17 项
cd mobile/web && npm run typecheck
```

## 与架构文档的差异

`docs/MOBILE-APP-ARCH.md` 原方案是「同进程 import 核心」。本骨架按 `--core-url` 的要求改为
**HTTP 适配器**：可以分机 / 分容器部署，核心升级不影响移动端，代价是多一跳本地 HTTP。
因此移动进程**不挂载 `/v1/*`**（等同文档里的 `companion` 模式），网关仍只有核心一处，
不会出现两个进程同时接管流量的问题。
