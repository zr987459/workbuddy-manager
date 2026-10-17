# ROADMAP · Global Edition（精简积分系统与国际版纯净网关）

> 原则：**先加开关，再搬代码，最后才删**。每个阶段都可以单独合并、单独回滚；`WB_EDITION=full` 的行为逐字不变。
> 架构演进由 Hark (Claude Opus 5.5) 与本地执行官联合把关。

## 总体决策
- **模式**：Edition 开关（`WB_EDITION=full|global`）+ 模块解耦，两步走；不做破坏性 fork 硬删。
- **理由**：上游 ithtelab 迭代频繁，`accounts.py`（124 KB）/`tencent.py`/dashboard 是冲突重灾区；开关方案只在边缘加门控，热路径 0 改动，随时可切回 full，且便于拉取上游新功能。
- **终态**：在构建期物理删除 `ext/cn_growth` 与 `ext/redpacket`，产出轻量「纯净国际版 Gateway」，但源码维持优雅的一套。

| 阶段 | 产出 | 估时 | 可单独合并 |
|---|---|---|---|
| P0 | fork 卫生 + 基线 + Global 实测 | 0.5d | ✅ 已完成 |
| P1 | 后端开关（调度/外呼/路由门控） | 1.5–2d | ✅ 待进行 |
| P2 | 前端按特性渲染（UI 纯净化） | 1.5–2d | ✅ 待进行 |
| P3 | 模块化搬迁（解耦为 ext 包） | 2–3d | 选做 |
| P4 | 纯净轻量镜像发布 | 1d | 选做 |

---

## P0 · Fork 卫生与基线（✅ 已完成）
**目标**：确保后续每次改动可验证，fork 不会被官方更新覆盖。
- [x] P0-1 仓库已成功 Fork 到 `zr987459/workbuddy-manager` 并克隆到本地。
- [x] P0-2 修复 405 Method Not Allowed：支持 `/v1/v1/messages`、`/v1/v1/chat/completions`、`/v1/v1/models` 别名兼容。
- [x] P0-3 修复移动网络连接超时：将账号出站连接超时从 5s 放宽至 15s。
- [x] P0-4 自动适配国际服模型：为无前缀的模型（如 `Deepseek-V4.1-Flash`）自动小写化并路由至 `global:` 前缀。
- [x] P0-5 真实调用验证：成功调通 `global:deepseek-v4.1-flash` 的 Anthropic Messages 协议与思维链抽取。

---

## P1 · 后端 Edition 开关
**目标**：`WB_EDITION=global` 时，后端不再调度、不再外呼、不再暴露 A/B/红包接口。
- [ ] P1-1 新增 `server/features.py`：`edition()`、`enabled()`、`require()`，支持 `WB_FEATURE_*` 单项覆盖。
- [ ] P1-2 `GET /api/system/features` 返回 `{edition, features, default_realm}`（供前端感知）。
- [ ] P1-3 `main.py`：`taskrun` 和 `dailyplan` 调度器只在 growth 开启时启动；`tasklog.start_collector()` 与红包 `backfill_codes` 按开关门控。
- [ ] P1-4 `main.py`：`redpackets.router` 和 `claim_router` 按 redpackets 开关决定是否注册。
- [ ] P1-5 加号流程 `routers/accounts.py`：global 模式跳过国内签到与多余日志记录；保留海外地区注册与 trial 激活。
- [ ] P1-6 `routers/accounts.py`：给 checkin、credits-snapshot、task-logs 等接口加门控守卫。
- [ ] P1-7 `services/tencent.py`：对 checkin、claim_compensation 等国内专属接口做免外呼兜底拦截。
- [ ] P1-8 `.env.example` 增加 `WB_EDITION=global` 配置项说明。

---

## P2 · 前端按特性渲染（UI 极简纯净）
**目标**：Global 模式下，控制台彻底隐去积分、签到、任务、红包、倒计时等繁琐卡片，只聚焦核心能力。
- [ ] P2-1 `web/lib/features.tsx`：提供 `FeatureProvider` 和 `useFeature()`，启动时拉取 features 配置。
- [ ] P2-2 导航过滤：在侧边栏/底栏移除 tasks（任务）与 redPackets（红包）入口。
- [ ] P2-3 路由守卫：访问 `/tasks`、`/red-packets`、`/claim` 时友好展示「当前部署为国际纯净模式」。
- [ ] P2-4 控制台 Dashboard：移除养号积分到期倒计时，保留清晰的请求量、Token 统计与健康状态。
- [ ] P2-5 账号页卡片极简：隐藏复杂的套餐包明细，展示清晰的「● 在线/离线」状态、UID、有效期及快捷操作。
- [ ] P2-6 设置页精简：上游调度设置仅保留海外生效的「活跃上报」与「保活」。
- [ ] P2-7 默认锁定国际服：global 模式默认 `realm='global'`，隐藏切换器，添加账号直接走海外通道。

---

## P3 · 模块化搬迁（解耦为独立扩展包）
**目标**：将国内版特色代码搬至独立扩展目录，核心文件极致精简。
- [ ] P3-1 抽取 `server/ext/cn_growth/`：搬入 `credits.py`、`taskrun.py`、`dailyplan.py`、`tasklog.py`。
- [ ] P3-2 抽取 `server/ext/redpacket/`：搬入 `redpacket.py` 和 `routers/redpackets.py`。
- [ ] P3-3 扩展注册协议：在 `ext/__init__.py` 中定义统一插件生命周期。

---

## P4 · 纯净构建与发布
- [ ] P4-1 提供针对海外极简用户的专用部署配置与脚本。
- [ ] P4-2 编写清晰通俗的使用文档与 GitHub Release 打标。
