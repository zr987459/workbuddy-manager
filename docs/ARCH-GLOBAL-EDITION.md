# 国际版（Global）精简架构方案

> 基线：`zr987459/workbuddy-manager@main`（fork 自 `ithtelab/workbuddy-manager`）
> 目标：给只用 workbuddy.ai 的部署一个**干净的 Global 模式**。积分、签到、成长任务、红包、到期倒计时这类国内版特性默认不出现、不调度、不发请求；
> 模型转发、选号轮换、API Key 鉴权、计量一行都不改。

---

## 0. 先搞清系统分层

```
下游客户端 ──► [Manager: FastAPI]  gateway.py / anthropic.py / responses.py
                 │  keysvc 鉴权 → IP 管控 → modelmap → proxyroutes → 转发 → 计量落库
                 ▼
             [workbuddy2api: Go 上游]  账号池 / 选号 / 冷却 / 上游调度器(签到·旅行·活跃·保活)
                 ▼
             腾讯：copilot.tencent.com(CN) / www.workbuddy.ai(Global)
```

- **选号轮换和冷却**（包括「积分耗尽冷却」`ErrHardCredit`）都在 Go 上游，Manager 改不到，也不应该改。
- Manager 已经有完整的 realm 层：`server/services/realm.py`、`supports_checkin()`、前端 `realm-context.tsx` / `RealmToggle`。
  所以这次**不是从零支持国际版**，而是把「国内版独有的业务」从「两版共用的核心」里**隔离出来**。

---

## 1. 现状：「积分」其实是四件事

grep `credit|积分|签到|红包|task|claim` 的结果按职责拆分如下。**只有 A、B 两块是精简对象。**

| 层 | 是什么 | Global 能不能用 | 处置 |
|---|---|---|---|
| **A. 账号余额与到期** | 直接调腾讯 billing 查余额、套餐、到期时间 | 只有一次性 trial，余额基本没有意义 | 剥离（可开关） |
| **B. 积分获取（成长体系）** | 签到、猫猫旅行、开学季、夜猫、成长中心任务、补偿领取、每日计划 | **没有**（上游调度器直接过滤 global 账号） | 剥离（可开关） |
| **C. 消耗计量** | 上游末帧返回的 `usage.credit`，记入日志、日/小时用量、Key 的积分额度 | 两版都有（待 P0 实测确认 Global 是否返回） | **保留在核心** |
| **D. 池健康** | Go 上游的积分耗尽冷却 `cooldown.credit_exhausted` | 两版都需要 | **保留，不动** |
| 红包 | 一次批量生成 N 个带额度的 Key，可公开抽取 | 与腾讯积分**无关**，是 Key 分发功能 | 独立开关，Global 默认关闭 |

### 1.1 后端文件清单

| 文件 | 规模 | 层 | 内容 |
|---|---|---|---|
| `server/services/credits.py` | 195 行 | A | 余额 TTL 缓存、余额快照 → 积分流水 |
| `server/services/tencent.py` | `checkin` `compensation_status` `claim_compensation` `fetch_credits` `_package_*` | A/B | **混合文件**：同一文件里还有登录、刷新 token、模型列表、探测、地区注册、`claim_trial`（这些是核心，必须保留） |
| `server/services/taskrun.py` | 669 行 | B | 调用上游 `task_runner.py`，有自带的定时领奖循环 `start_scheduler` |
| `server/services/dailyplan.py` | 225 行 | B | Manager 自己的定时器：签到、领奖、做任务 |
| `server/services/tasklog.py` | 584 行 | B | 解析上游日志，写入 `task_logs` |
| `server/redpacket.py` + `server/routers/redpackets.py` | 490 + 132 行 | 红包 | 管理端 `/api/red-packets/*`，加上**免登录公开**的 `/api/claim/*` |
| `server/routers/accounts.py` | 123 KB | A/B | 混在账号路由里的接口：`/accounts/{f}/checkin` `/accounts/{f}/credits` `/accounts/credits-snapshot` `/accounts/refresh-credits` `/accounts/checkin-all` `/checkin-logs*` `/task-logs*` `/task-run*` `/task-claim-schedule` `/accounts/claim-compensation` `/accounts/daily-plan*` |
| `server/routers/stats.py` | `GET /api/stats/credits` | A | 积分获取流水（属于 A/B）；其余 `credit` 统计属于 C |
| `server/services/wb2api.py` | `checkin_supported` 字段 | B | /status 汇总 |
| `server/main.py` | `taskrun.start_scheduler()` `dailyplan.start_scheduler()` | B | 生命周期启动的调度器 |
| `server/db.py` | `checkin_logs` `task_logs` `red_packets` `red_packet_shares`、settings 键 `credits_snapshot` | A/B/红包 | 表**保留不删**，只是不再写入 |
| **核心，不碰** | `routers/gateway.py`（`_usage_credit` `_record`）、`keysvc.py`（`quota_credit` 检查 L460、`touch`）、`anthropic.py` `responses.py` `playground.py` 的 usage 透传、`renew.py`（token 续期）、`realm.py` | C | — |

### 1.2 前端文件清单（Next.js）

| 文件 | 层 | 内容 |
|---|---|---|
| `web/app/(main)/tasks/page.tsx`（866 行） | B | 签到、任务、领奖、日志整页 |
| `web/components/common/tasks/TaskRunnerPanel.tsx` | B | 一键执行任务 |
| `web/components/common/accounts/AccountTaskDialog.tsx` | B | 单账号任务 |
| `web/app/(main)/red-packets/page.tsx`、`web/app/claim/page.tsx` | 红包 | 管理页和公开抽取页 |
| `web/components/common/accounts/CreditCountdown.tsx`、`web/lib/dashboard-credits.ts` | A | 到期倒计时 |
| `web/app/(main)/dashboard/page.tsx`（71 处 credit） | A + C | `loadGroupCredits`（按分组扇出 refresh-credits）、到期汇总、积分流水卡片 |
| `web/app/(main)/accounts/page.tsx`（70/65 处） | A/B | 余额列、签到按钮、批量签到、补偿 |
| `web/app/(main)/settings/layout.tsx` | B | 上游 `schedule` 的可视化编辑（签到/旅行/活跃/保活） |
| `web/app/(main)/keys/page.tsx` | C | 积分额度输入框（保留） |
| `web/app/(main)/models/page.tsx`、`playground/page.tsx`、`logs/page.tsx`、`stats/page.tsx` | C | 积分倍率、本次消耗、扣费列（保留） |
| 导航入口：`web/lib/section-nav.ts`（tasks、redPackets）、`ManagementBar.tsx`、`command-palette.ts` | — | 要统一按开关过滤 |
| `web/lib/api.ts` L245–386、L535–558、L596 | A/B/红包 | API 客户端 |

---

## 2. 两版的本质差异

| 维度 | 国内版 CN（codebuddy.cn） | 国际版 Global（workbuddy.ai） |
|---|---|---|
| 积分来源 | 签到、旅行、活动、成长任务**持续补充**，套餐有周期和到期时间 | **只有一次性 trial**，没有签到和成长体系 |
| 运营模式 | 「养号」：每天赚积分 → 消耗积分 | 「用号」：trial 用完就是耗尽，没有回血手段 |
| billing 路径 | 只有 `/v2/billing/meter/*` | 优先 `/billing/meter/*`，404 时回落（方向和 CN 相反） |
| 上游调度器 | checkin / travel / school / cat / activity / keepalive | 只有 activity 和 keepalive 生效 |
| 余额的决策价值 | 高：决定什么时候签到、哪个号该歇 | 低：耗尽后能做的只有冷却或换号，而这些上游池已经在做 |

**结论**：对 Global 来说，A 和 B 只有成本（多余的腾讯请求、风控面、UI 噪音、定时器），没有收益。C 和 D 才是真正有用的：花了多少、哪个号不能用了。

---

## 3. 设计取舍：Feature Flag 还是直接剥离

| 方案 | 优点 | 缺点 |
|---|---|---|
| 直接删代码（纯净 fork） | 代码最少 | ithtelab 上游很活跃（CHANGELOG 258 KB），每次同步都会在 `accounts.py`、`tencent.py`、dashboard 上冲突；150 多个测试文件要跟着改 |
| 只在前端隐藏 | 改得最快 | 后端调度器照常跑、接口照常可调，红包的公开端点也还暴露着 |
| **推荐：Edition 开关 + 模块边界，分两步** | 先加开关（改动小、易同步），再把国内版特性搬到独立包；核心零改动；可以随时切回 | 要维护一层薄的特性注册 |

### 3.1 Edition 模型

```python
# server/features.py  （新增，约 60 行）
WB_EDITION = os.getenv('WB_EDITION', 'full')   # full | global
# full   = 现行为，逐字不变（保证与上游同步、老用户升级零感知）
# global = 只服务 workbuddy.ai 的精简模式

FEATURES = {            # full   global
  'balance':    ...,    #  on     off   A：余额 / 到期 / 快照 / 流水
  'growth':     ...,    #  on     off   B：签到 / 任务 / 领奖 / 补偿 / 每日计划
  'redpackets': ...,    #  on     off   红包与公开 /claim
  'realm_cn':   ...,    #  on     off   隐藏 CN 版本切换，默认 realm=global
}
# 每项都能单独覆盖：WB_FEATURE_REDPACKETS=1
def enabled(name: str) -> bool: ...
def require(name):      # FastAPI 依赖：关闭时返回 404 {"code":"feature_disabled"}
```

### 3.2 三条硬约束（作为不变量写进测试）

1. **热路径零改动**：`gateway.py`、`anthropic.py`、`responses.py`、`keysvc.py`、`upstreamsvc.py`、`proxyroutes.py`、`modelmap.py` 不允许 import `features`。热路径不判断开关，也就不可能被开关弄坏。
2. **数据零迁移**：不删表、不删列。关闭只是不再写入；切回 `full` 时数据都还在。
3. **调度器跟着开关走**：`main.py` 生命周期里 `taskrun` 和 `dailyplan` 只在 `growth` 开启时启动。`renew`（token 续期）和 `pgsync` **永远启动**。

### 3.3 门控点（只有四类，都在边缘）

| 位置 | 做法 |
|---|---|
| 路由 | 红包路由按开关决定是否 `include_router`；`accounts.py` 里的 A/B 接口加 `dependencies=[Depends(require('growth'))]`（P1），P3 再整体拆成独立 router |
| 调度器 | `main.py` lifespan 里加判断 |
| 外呼 | `tencent.checkin / claim_compensation / fetch_credits` 入口处兜底判断（防止遗漏的调用点） |
| 前端 | 新增 `GET /api/system/features` 和 `FeatureProvider`：导航、命令面板、dashboard 卡片、账号页的余额列和签到按钮、设置里的 schedule 分组都由它过滤。直接访问 `/tasks` `/red-packets` 显示「此部署未启用」空状态，**不白屏** |

### 3.4 Global 模式下保留的「积分」

- 请求日志、用量统计、playground 里的 `usage.credit` **照常显示**。这是「花了多少」，属于计量，不属于积分系统。
- Key 的积分额度：P0 实测 Global 末帧是否返回 `usage.credit`。返回就保留；不返回则 Global 模式下隐藏该输入框，只用 token 额度。
- 积分耗尽冷却（Go 上游）不动，账号用光 trial 后照常冷却出池。
- 地区注册和 `claim_trial` 是 Global **开户**流程，属于核心，保留。

---

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| **应用内「检查更新」会拉 `ithtelab/workbuddy-manager` 的 release 覆盖本 fork**（`updater.py:610`、`deploy/update.py:64` 写死了 `MANAGER_REPO`） | P0 第一件事：`.env` / compose 里设 `WB_MANAGER_REPO=zr987459/workbuddy-manager`；或者 fork 内改默认值，并在 UpdatePanel 显示来源仓库 |
| 同步上游时冲突 | P1 和 P2 只**新增**文件，加少量一行门控；P3 搬迁前先打 tag；保留一个 `upstream-sync` 分支专门用来合并 |
| 遗漏调用点，导致 Global 模式仍向腾讯发签到请求 | 在 `tencent.py` 外呼入口兜底判断，再加一个测试 mock httpx，断言 global 模式下 0 次 billing / checkin 请求 |
| 前端仍然发出 refresh-credits 扇出 | dashboard 的 `loadGroupCredits` 在 balance 关闭时直接返回空；e2e 断言网络请求中没有 `/refresh-credits` |
| 红包公开端点被扫 | Global 默认关闭：路由不注册，URL 返回 404 |
