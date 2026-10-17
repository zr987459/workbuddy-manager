# WorkBuddy Mobile

专为手机触屏打造的独立管理端：**轻量 BFF（FastAPI）+ PWA（Preact）**，与仓库根目录的
桌面端（`server/` + `web/`）完全解耦，只通过 HTTP 调用 core 的 `/api/*`。

```
手机浏览器 / PWA ──▶ mobile BFF (:7870, /m/*) ──▶ WorkBuddy core (:7864, /api/*) ──▶ 上游组
```

## 快速开始

```bash
pip install -r mobile/requirements.txt

# 已有 core 在跑（默认 7864）：
python mobile/main.py

# 指定端口与 core 地址：
python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795
```

浏览器打开 `http://127.0.0.1:8796/m/`，用 core 的管理员账号登录。

仓库里附带了构建好的前端（`mobile/web/dist`），只装 Python 依赖即可运行。

### 没有 core 也想看效果

```bash
python mobile/dev/mock_core.py --port 8795      # 假 core：admin / admin
python mobile/main.py --port 8796 --core-url http://127.0.0.1:8795
```

## 四个 Tab

| Tab | 内容 | 调用的 core 接口 |
|---|---|---|
| 概览 | 网关状态、在途连接、可用账号、今日请求 / Token、24h 趋势 | `/api/accounts` `/api/stats/summary` `/api/stats/hourly`（BFF 并发聚合为一次） |
| 账号 | 卡片流、筛选、搜索、一键启停、连通测试、国际版一键授权 | `/api/accounts` `/api/accounts/{file}/disabled` `/test` `/api/auth/start` `/api/auth/poll` |
| 密钥 | 一键生成（明文只显示一次）、复制 key / curl / SDK 配置、启停、模型授权、删除 | `/api/keys` |
| 对话 | 流式输出、可折叠思维链、首字延迟 / 耗时 / tokens / credit、真实中断 | `/api/playground/models` `/api/playground/chat` |

签到、成长任务、红包、积分账本、令牌管理、代理线路**刻意不进移动端**：BFF 只声明上表的接口，
其余路径一律 404，不做兜底转发。

## 鉴权：会话透传

- `POST /m/api/auth/login` 转发到 core 的 `/api/login`，把 core 下发的 `wb_session`
  包进 BFF 域下的 `wbm_session`（HttpOnly、SameSite=Lax、Path=/m，HTTPS 下带 Secure）。
- 之后每个请求把它原样带给 core；core 续期或清除时同步更新。角色、登录锁定、审计、
  会话吊销**全部以 core 为准**，BFF 不存任何密码或 API Token。
- 出站 httpx 客户端装了拒收一切的 cookie jar，杜绝「A 的会话被缓存后发给 B」（有测试覆盖）。
- 真实客户端 IP 通过 `X-Real-IP` 交给 core，避免一人输错密码锁住所有手机用户。
  BFF 与 core 同机时 127.0.0.1 默认在 core 的可信网段内；跨机部署请配置 core 的
  `WB_TRUSTED_PROXY_CIDRS`。

## 配置

命令行参数优先于环境变量（也可写在 `mobile/.env`，见 `.env.example`）。

| 变量 | 默认 | 说明 |
|---|---|---|
| `WBM_HOST` / `--host` | `127.0.0.1` | 监听地址；对外请放在 HTTPS 反代之后 |
| `WBM_PORT` / `--port` | `7870` | 监听端口 |
| `WBM_CORE_URL` / `--core-url` | `http://127.0.0.1:7864` | core 地址 |
| `WBM_BASE_PATH` / `--base-path` | `m` | 挂载前缀（前端构建 base 同为 `/m/`） |
| `WBM_PUBLIC_GATEWAY` | 空 | 密钥页展示的网关 `/v1` 对外地址；空 = 假定与本页同域 |
| `WBM_TRUST_PROXY` | `false` | BFF 前面有自己的反代时设为 `true` |
| `WBM_SECURE_COOKIE` | `auto` | `auto` / `true` / `false` |
| `WBM_EXTRA_ORIGINS` | 空 | 额外允许的 Origin（如 Capacitor 的 `capacitor://localhost`） |

## 安全基线

- 页面 CSP：`script-src 'self'`、`connect-src 'self'`、`frame-ancestors 'none'`；接口 `Cache-Control: no-store`。
- 写操作要求 JSON 请求体，且 Origin 必须同源（防 CSRF）。
- 模型输出：Markdown 中的原始 HTML 一律按文本显示，再经 DOMPurify 白名单；链接强制 `noopener`。
- Service Worker 只缓存 `/m/assets/*` 与外壳，`/m/api/*` 永远走网络。
- 授权页用 `opener = null` 打开，防反向 Tab 劫持。

## 开发

```bash
cd mobile/web && npm ci
npm run dev            # http://localhost:5173/m/，/m/api 代理到 127.0.0.1:8796
npm run build          # 产物写入 mobile/web/dist，请与源码一起提交

cd ../.. && pip install -r mobile/requirements-dev.txt
python -m pytest mobile/tests -q
```

目录：

```
mobile/
├── main.py              独立入口
├── server/              BFF：settings / core_client / schemas / app / routes/*
├── web/                 Preact + Vite + Tailwind v4（src/ 源码，dist/ 构建产物）
├── dev/mock_core.py     假 core（开发 & 测试桩）
├── tests/               契约测试
└── Dockerfile
```

**解耦铁律**：`mobile/` 内禁止 `import server`（CI 会拦）。

## 下一步

- Capacitor 套壳 + Actions 打签名 APK
- docker-compose 增加 `workbuddy-mobile` 服务
- 对话历史改存 IndexedDB（目前 localStorage 保留最近 60 条）
