# ROADMAP · Global Edition（精简积分系统）

> 原则：**先加开关，再搬代码，最后才删**。每个阶段都可以单独合并、单独回滚；`WB_EDITION=full` 的行为逐字不变。
> 设计详见 `docs/ARCH-GLOBAL-EDITION.md`。

## P0 · Fork 卫生与基线（0.5 天）
**目标**：确保后续每次改动可验证，fork 不会被官方更新覆盖。
- [ ] P0-1 `WB_MANAGER_REPO` 指向 `zr987459/workbuddy-manager`（`.env.example`、`docker-compose.yml`、`deploy/install.sh` 写入默认值）；UpdatePanel 显示当前更新源
- [ ] P0-2 建 `upstream-sync` 分支，记录同步流程（`git fetch ithtelab && merge --no-ff`）
- [ ] P0-3 跑通基线：`pytest server/tests -q`、`web` 下 `npm run lint && npm run build && node --test lib/*.test.mjs`，记录耗时和失败数
- [ ] P0-4 用一个 Global 账号做一次真实调用，确认：末帧是否带 `usage.credit`；`fetch_credits` 对 Global 返回什么（trial 余额 / code≠0）。结论写进 ARCH 文档 §3.4
**验收**：基线测试数字已记录；Global 的 `usage.credit` 是否存在已明确。

## P1 · 后端 Edition 开关（1–1.5 天）
**目标**：`WB_EDITION=global` 时，后端不再调度、不再外呼、不再暴露 A/B/红包接口。
- [ ] P1-1 新增 `server/features.py`：`edition()`、`enabled()`、`require()`，支持 `WB_FEATURE_*` 单项覆盖
- [ ] P1-2 `GET /api/system/features` 返回 `{edition, features, default_realm}`（登录用户可读）
- [ ] P1-3 `main.py`：`taskrun` 和 `dailyplan` 的调度器只在 growth 开启时启动（`renew` 和 `pgsync` 不受影响）
- [ ] P1-4 `main.py`：`redpackets.router` 和 `claim_router` 按 redpackets 开关决定是否注册
- [ ] P1-5 `routers/accounts.py`：给 checkin、credits、credits-snapshot、refresh-credits、checkin-all、checkin-logs、task-logs、task-run、task-claim-schedule、claim-compensation、daily-plan 加 `Depends(require(...))`
- [ ] P1-6 `routers/stats.py` `/credits` 加 balance 门控
- [ ] P1-7 `services/tencent.py`：`checkin`、`claim_compensation`、`compensation_status`、`fetch_credits` 入口加兜底判断（关闭时直接返回「已禁用」，不发请求）
- [ ] P1-8 `services/wb2api.py` 的 `/status` 汇总里，关闭时不再算 `checkin_supported`
- [ ] P1-9 `.env.example` 加 `WB_EDITION` 说明
- [ ] P1-10 新测试 `server/tests/test_edition_global.py`：
  - 被门控的接口返回 404 `feature_disabled`
  - lifespan 后 `taskrun._claim_task is None`、dailyplan 未启动
  - mock httpx：global 模式下 billing、checkin 外呼 0 次
  - **热路径契约**：`/v1/chat/completions`、`/v1/messages`、`/v1/responses` 的鉴权、选号、计量和 full 模式完全一致
  - 静态检查：热路径文件不 import `features`
**验收**：两种 edition 下全量 pytest 都通过；`full` 模式下没有任何测试需要改。

## P2 · 前端按特性渲染（1.5–2 天）
**目标**：Global 模式的界面上看不到积分、签到、任务、红包、倒计时，也不发对应请求。
- [ ] P2-1 `web/lib/features.tsx`：`FeatureProvider` 和 `useFeature()`，启动时拉 `/api/system/features`，失败时按 full 处理（避免误隐藏）
- [ ] P2-2 导航过滤：`section-nav.ts`（tasks、redPackets）、`ManagementBar.tsx`、`command-palette.ts`
- [ ] P2-3 路由守卫：`/tasks`、`/red-packets`、`/claim` 关闭时显示 EmptyState「此部署未启用该功能」
- [ ] P2-4 Dashboard：balance 关闭时不调 `loadGroupCredits`，隐藏到期倒计时和积分流水卡片；保留请求量、token、扣费
- [ ] P2-5 账号页：隐藏余额列、`CreditCountdown`、签到按钮、批量签到、补偿；`AccountTaskDialog` 不挂载
- [ ] P2-6 设置页：上游 schedule 分组只保留「活跃上报」和「保活」
- [ ] P2-7 Realm：global 模式默认 `realm='global'`，隐藏 `RealmToggle`；添加账号直接走 Global 扫码、地区注册和 trial
- [ ] P2-8 Keys 页：按 P0-4 的结论决定是否隐藏积分额度
- [ ] P2-9 i18n：新增文案写进 5 个 locale，跑 `dev/i18n-verify.mjs`
- [ ] P2-10 Playwright 截图和网络断言：global 模式下没有 `/refresh-credits`、`/checkin*`、`/task-*` 请求（参考 `dev/verify_state_honesty.mjs`）
**验收**：截图对比 full 与 global 两种模式，网络断言通过，`npm run build` 无警告。

## P3 · 模块化搬迁（2–3 天，可选，建议在 P1/P2 稳定运行一周后）
**目标**：国内版特性变成可插拔的独立包，核心文件变小，同步冲突集中在少数文件。
- [ ] P3-1 `server/ext/cn_growth/`：搬入 `credits.py`、`taskrun.py`、`dailyplan.py`、`tasklog.py`，以及从 `accounts.py` 拆出的 `router.py`（全部 A/B 接口）
- [ ] P3-2 `server/ext/redpacket/`：搬入 `redpacket.py` 和 `routers/redpackets.py`
- [ ] P3-3 `tencent.py` 拆分：`tencent_billing.py`（checkin、compensation、fetch_credits、`_package_*`）搬进 ext；登录、刷新、模型、探测、注册、trial 留在核心
- [ ] P3-4 扩展注册协议 `ext/__init__.py`：`register(app, lifespan)`，`main.py` 按开关 import（关闭时**连 import 都不做**）
- [ ] P3-5 前端：`web/features/cn/` 放 tasks、red-packets、claim、CreditCountdown、AccountTaskDialog，用 `next/dynamic` 按开关懒加载
- [ ] P3-6 旧路径保留 re-export shim 一个版本周期，降低上游同步冲突
- [ ] P3-7 测试分组：`server/tests/ext_cn/`，打上 `pytest -m cn` 标记
**验收**：global 模式进程内 `sys.modules` 里没有 `ext.cn_growth`；`accounts.py` 体积减少约 40%。

## P4 · 纯净构建与发布（1 天，可选）
- [ ] P4-1 Dockerfile 增加 `ARG EDITION=full`；`EDITION=global` 时构建期删掉 `server/ext/cn_growth`、`server/ext/redpacket`、`web/features/cn`
- [ ] P4-2 `release.yml` 用 matrix 同时出 `:latest`（full）和 `:global` 两个镜像
- [ ] P4-3 README 增加「Global Edition」章节：能力边界、切换方式、数据兼容说明
- [ ] P4-4 Windows launcher 增加 edition 选项（`windows/launcher/src/EnvConfig.cs`）

## 不做（明确排除）
- 不改 Go 上游 workbuddy2api 的调度器和冷却（上游本来就过滤 global 的签到）
- 不删数据库表和列，不写降级迁移
- 不碰网关转发、选号、鉴权、计量的任何一行
