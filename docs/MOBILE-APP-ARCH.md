# WorkBuddy Mobile：独立移动端 App 架构与工程规范

> 基线：`zr987459/workbuddy-manager`，基于 `docs/global-edition-plan` 分支。
> 一句话定位：**新进程、新 UI、复用旧核心**。`mobile/` 自带入口，能独立运行，完全不依赖桌面版 Next.js；
> 数据面（网关鉴权、选号、计量）直接 import 现有 `server` 核心模块，**绝不重写热路径**。

---

## 1. 架构定位

### 1.1 关键决策：BFF + 共享内核，不另起一套网关

```
 手机浏览器 / PWA / Capacitor APK
        │ HTTPS
        ▼
┌──────────────── mobile/start.py（单进程 FastAPI）────────────────┐
│  /                → 静态 PWA（mobile/web/dist）                   │
│  /m/api/*         → Mobile BFF：聚合、裁剪、面向卡片的 DTO          │
│  /v1/*, /healthz  → 直接挂载 server.routers.gateway / anthropic /   │
│                     responses（可关，见 1.3）                        │
│        │ import（只读依赖，禁止反向）                               │
│        ▼                                                          │
│  server.keysvc · server.db · server.tokensvc · server.security    │
│  server.services.{wb2api, tencent(登录/刷新/模型), realm, modelmap} │
└───────────────────────────────┬───────────────────────────────────┘
                                │ HTTP 127.0.0.1:7863（WB2API_BASE）+ AUTH_DIR 账号文件
                                ▼
                     workbuddy2api（Go：账号池 / 选号 / 冷却）
                                ▼
                     www.workbuddy.ai（Global） / copilot.tencent.com（CN）
```

| 方案 | 结论 |
|---|---|
| A. mobile 后端自己实现鉴权、转发、计量 | ✗ 等于复制 `gateway.py`（50 KB）、`responses.py`（87 KB）、`keysvc.py`，与上游同步时双倍冲突，计量口径也会漂移 |
| B. mobile 后端通过 HTTP 调桌面 Manager 的 `/api/*` | ✗ 不能独立运行，桌面接口的形状是为表格设计的 |
| **C. 独立进程 + import 核心库（BFF）** | ✓ 独立启动、独立 UI；Key、账号、日志与桌面版**同一份数据、同一套校验** |

### 1.2 后端技术栈

- Python 3.12、FastAPI、uvicorn，与现有依赖相同，**不新增运行时依赖**
- BFF 层只做三件事：**聚合**（一屏一个请求）、**裁剪**（字段只给卡片用得到的）、**语义化**（把状态翻译成 `ok | cooling | disabled | expired` 这类胶囊枚举）
- 实时数据用 SSE：`/m/api/live` 每 5 秒推送一次仪表盘增量，页面隐藏（visibilitychange）时断开；对话流复用网关的 SSE

### 1.3 运行模式（`MOBILE_MODE`）

| 模式 | 适用场景 | 挂载内容 |
|---|---|---|
| `standalone`（默认） | 只部署移动端，不跑桌面版 | BFF + PWA + `/v1/*` 网关 |
| `companion` | 和桌面 Manager 共存（共用 `manager.db`） | BFF + PWA，**不挂网关**（`/v1` 继续由桌面版提供，避免两个进程监听同一份流量） |

两个进程共用 SQLite 时，`server.db` 必须已开启 WAL（P0 核实）；移动端**不启动**任何调度器（续期、pgsync 由桌面版负责）。`standalone` 模式下只启动 `renew`（token 续期属于账号健康，必须有）。

### 1.4 前端技术栈

| 选型 | 理由 |
|---|---|
| **Vite 6 + React 19 + TypeScript** | 团队已经熟悉 React；不用 SSR，舍弃 Next.js，产物是纯静态文件，首屏 JS 目标 ≤ 120 KB gzip |
| **Tailwind CSS v4 + 自建 M3 设计令牌** | 用 CSS 变量实现 Material 3 色彩体系（dynamic color 种子色）和 iOS 圆角/毛玻璃；不引入重型组件库 |
| **TanStack Query v5** | 请求缓存、下拉刷新、乐观更新（启停开关立即反馈） |
| **TanStack Router**（或 wouter） | 类型安全、体积小；四个 Tab 加若干全屏 Sheet |
| **Vaul**（底部抽屉）+ **Motion**（手势与转场） | 所有编辑都在 Bottom Sheet 里完成，不用居中弹窗 |
| **vite-plugin-pwa**（Workbox） | 可安装、App Shell 离线、更新提示 |
| **Capacitor 7** | 同一份 dist 打包 Android APK，由 GitHub Actions 构建；iOS 可选 |
| i18n | 直接复用 `web/lib/i18n/locales/*.json` 的子集，新文案放进 `mobile/web/src/i18n/` |

---

## 2. 鉴权

| 客户端 | 方式 |
|---|---|
| PWA（同源） | 复用 `server.security` 的 HMAC 签名会话 Cookie（HttpOnly、SameSite=Strict），登录走 `/m/api/auth/login`，内部调用同一个校验函数 |
| APK（`capacitor://localhost` 跨源，Cookie 不可靠） | 使用现成的**管理面 API Token**（`tokensvc`，前缀 `wbt_`，scope 分 readonly/admin）。首次打开时填服务器地址和 token，token 存进 Android Keystore（`@capacitor/preferences` + 加密插件）；请求头 `Authorization: Bearer wbt_...` |
| 数据面 | 网关 Key（`wbk_`）照旧，和管理面凭据严格分开 |

CORS 只放行 `capacitor://localhost`、`https://localhost` 和 `MOBILE_ALLOWED_ORIGINS`；生产环境强制 HTTPS（提示用户配置反代，或使用 Cloudflare Tunnel）。

---

## 3. 四大模块（只有卡片，没有表格）

导航：**iOS 风格悬浮胶囊底栏**（毛玻璃，`env(safe-area-inset-bottom)`），四个 Tab：状态 · 账号 · 密钥 · 对话。右上角头像进入设置（服务器、主题、语言、退出）。

### 3.1 状态 `/`
- **网关状态主卡**：一个大号状态胶囊（运行中 / 降级 / 不可用），数据来自 `wb2api.get_status()` 和 `/healthz`；附上游版本和运行时长
- **四个指标格（2×2）**：在途请求（各账号 `in_flight` 求和 / `max_in_flight_global`）、今日请求、今日 Token（输入/输出用双色环）、成功率
- **账号池健康条**：一根分段条形（可用 / 冷却 / 停用 / 过期），点击跳到账号页并带上筛选
- **最近 5 次失败**：错误码 + 一句人话（复用 `errtext`），点开在 Sheet 里看详情
- 下拉刷新；`/m/api/live` SSE 增量推送
- 接口：`GET /m/api/overview` → `{gateway, inflight, today:{req,pt,ct,ok_rate}, pool:{ok,cooling,disabled,expired}, recent_errors[5]}`

### 3.2 账号 `/accounts`
- **卡片流**（虚拟列表）：头像首字母 + 昵称/邮箱、realm 小标、**状态胶囊**、token 剩余寿命进度条、在途数
- 手势：**左滑**启用/停用（乐观更新，失败回滚并 toast）；**长按**进入多选（批量启停、刷新 token）；点击卡片打开详情 Sheet（备注、权重、出口代理、复制 UID、强制解除冷却）
- 顶部分段控件：全部 / 可用 / 冷却 / 异常
- **国际版一键授权**：右下 FAB「添加账号」→ Sheet：
  1. `POST /m/api/accounts/login` → 内部调用 `tencent.start_login(realm='global')`，返回授权链接
  2. 手机上直接跳转 workbuddy.ai 授权（不需要扫码；APK 用 `@capacitor/browser` 打开 Custom Tab）
  3. 前端每 2 秒轮询 `GET /m/api/accounts/login/{state}`（→ `poll_login`），成功后自动完成地区注册和 `claim_trial`，卡片插入列表顶部并震动反馈
- 接口：`GET /m/api/accounts?status=&cursor=`、`PATCH /m/api/accounts/{uid}`（`{enabled, note, weight}`）、`POST /m/api/accounts/{uid}/refresh`

### 3.3 密钥 `/keys`
- 卡片：名称、`wbk_••••末4位`、模型授权数、今日用量迷你折线、启用开关
- **一键生成**：FAB → Sheet 只有三个字段（名称、模型白名单、额度，额度可留空）→ 创建成功后进入**一次性展示页**：大号等宽字体 + 「复制」+「复制为 curl / OpenAI SDK 配置」+「我已保存」，关闭后无法再次查看明文（与 `keysvc` 的语义一致）
- 模型授权：用 Chip 多选（按系列分组，支持搜索），也可以直接选「全部」
- 复制统一使用 `navigator.clipboard`，APK 用 `@capacitor/clipboard`，复制后震动并 toast
- 接口：`GET/POST /m/api/keys`、`PATCH /m/api/keys/{id}`、`POST /m/api/keys/{id}/reset-usage`；底层全部调用 `server.keysvc`

### 3.4 对话 `/chat`
- 原生聊天布局：消息气泡、底部输入栏随键盘上推（`visualViewport`）、发送/停止按钮共用一个位置
- 顶部模型胶囊 → Sheet 选模型（显示上下文长度、是否支持推理）；**思考强度**分段控件（只显示该模型支持的档位）
- **思维链**：`reasoning_content` 增量渲染在气泡上方的可折叠卡片里（「思考了 12 秒」），默认折叠；正文用 Markdown + 代码高亮（shiki 按需加载）
- 每条回复下方一行元信息：首字延迟、总耗时、Token、`usage.credit`（若有）
- 会话保存在 IndexedDB（只存本机）；可一键「复制为 curl」，方便复现
- 实现：`POST /m/api/chat`（流式）**复用 `server.routers.playground` 的逻辑**（同一个账号池、同一套计量；管理员限定）。前端用 `fetch` + `ReadableStream` 解析 SSE，`AbortController` 负责中断

---

## 4. 与上游的集成契约

| 能力 | 走哪条路 | 复用的模块 |
|---|---|---|
| 网关状态、在途、账号池 | HTTP `WB2API_BASE/status` | `wb2api.get_status`、`merge_pool_status` |
| 账号列表、启停、权重、代理 | 读写 `AUTH_DIR/workbuddy*.json` 和上游 admin 路由 | `wb2api.list_auth_accounts`、`set_account_disabled`、`set_manual_disabled`、`set_account_weight` |
| 登录、刷新 token、注册、trial | 直连 workbuddy.ai | `tencent.start_login/poll_login/refresh_token/submit_region/claim_trial` |
| 模型目录 | 上游 `/v1/models` + 腾讯模型接口 | `modelcatalog`、`wb2api.get_models` |
| 下游调用 `/v1/*` | 原样挂载网关路由 | `gateway`、`anthropic`、`responses`、`keysvc` |
| 多上游分组 | `upstreamsvc` | 首版只支持默认分组，P3 再加分组切换 |

**适配器边界**：`mobile/server/adapters/core.py` 是唯一 import `server.*` 的地方，BFF 路由只依赖这个适配器。以后核心模块重构或改名，只需要改这一个文件。

---

## 5. 目录结构

```
mobile/
├── start.py                  # 独立入口：解析 env → 校验 → uvicorn.run(app)
├── README.md
├── .env.example              # MOBILE_MODE / MOBILE_PORT=8790 / MOBILE_ALLOWED_ORIGINS …
├── server/
│   ├── app.py                # create_app(mode)：挂 BFF、静态资源、（standalone）网关
│   ├── deps.py               # 鉴权依赖：Cookie 或 Bearer wbt_
│   ├── adapters/core.py      # ★ 唯一触碰 server.* 的地方
│   ├── routers/
│   │   ├── overview.py  live.py  accounts.py  keys.py  chat.py  auth.py  meta.py
│   ├── schemas.py            # Pydantic DTO（卡片形状），由此导出 OpenAPI → 前端类型
│   └── tests/                # pytest：DTO 契约 + 两种模式的挂载 + 不可越界检查
├── web/
│   ├── index.html  vite.config.ts  capacitor.config.ts  package.json
│   └── src/
│       ├── app/              # 路由、外壳、胶囊底栏
│       ├── features/{overview,accounts,keys,chat,settings}/
│       ├── ui/               # Sheet、Pill、StatTile、SwipeRow、Toast、Skeleton
│       ├── lib/{api.ts,sse.ts,haptics.ts,clipboard.ts,storage.ts}
│       ├── theme/tokens.css  # M3 令牌，含 light / dark / AMOLED
│       └── i18n/
└── android/                  # npx cap add android 生成（gitignore 构建产物）
```

**解耦铁律**（写进 CI）：
1. `mobile/` 只能通过 `adapters/core.py` import `server.*`
2. `server/` 和 `web/` **禁止** import `mobile/`
3. `mobile/web` 不引用 `web/` 的任何源码（i18n json 由构建脚本拷贝）

---

## 6. 工程规范

- **API 契约**：FastAPI 自动生成 OpenAPI，用 `openapi-typescript` 生成 `src/lib/api-types.ts`；CI 检查生成结果没有漂移
- **性能预算**：Lighthouse Mobile ≥ 95；首屏 JS ≤ 120 KB gzip；TTI ≤ 2 秒（4G 模拟）；对话首字渲染只增加 ≤ 50 ms 本地开销
- **触屏规范**：触控目标 ≥ 44×44 pt；单手热区（主要操作放下半屏）；`prefers-reduced-motion` 时关闭动效；按 safe-area 适配刘海和手势条
- **状态诚实**（沿用仓库已有原则）：每个卡片都要区分「加载中 / 失败 / 空 / 部分失败」，绝不把旧数字当成实时数据展示
- **安全**：明文 Key 只展示一次；一键启停之外的破坏性操作（删除账号、重置用量）必须二次确认；APK 默认只接受 HTTPS 服务器地址
- **测试**：后端 pytest（契约测试 + standalone/companion 两种模式的挂载测试 + 越界 import 检查）；前端 Vitest；Playwright 移动端视口（iPhone 15、Pixel 8）截图回归
- **CI/CD**（`.github/workflows/mobile.yml`）：
  1. `lint → test → vite build`
  2. Docker 多阶段构建：node 构建 dist → python:3.12-slim 运行 `mobile/start.py`，镜像 `ghcr.io/zr987459/workbuddy-mobile`
  3. 打 tag `mobile-v*` 时：`npx cap sync android` → Gradle `assembleRelease` → 用 Secrets 里的 keystore 签名 → 上传 APK 到 Release

---

## 7. 里程碑

| 阶段 | 内容 | 估时 |
|---|---|---|
| M0 | 骨架：`start.py`、`create_app`、适配器、鉴权、外壳与胶囊底栏、PWA；确认 SQLite WAL | 1.5 天 |
| M1 | 状态页 + `/m/api/live` SSE | 1 天 |
| M2 | 账号卡片流 + 滑动启停 + Global 一键授权 | 2 天 |
| M3 | 密钥：生成、一次性展示、模型 Chip 授权 | 1 天 |
| M4 | 对话：流式、思维链、中断、IndexedDB | 1.5 天 |
| M5 | Docker 镜像 + Capacitor APK 的 Actions 流水线 | 1 天 |
| M6 | 打磨：暗色/AMOLED、i18n、Playwright 回归、Lighthouse 达标 | 1 天 |

**与 Global Edition 路线的关系**：移动端从第一天就是 Global-first，**不实现**积分、签到、任务、红包。它依赖 ROADMAP 的 P0-1（更新源指向 fork）；不依赖 P1–P4，可以并行推进。
