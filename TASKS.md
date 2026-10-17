# TASKS · Global Edition

状态：`[ ]` 待办 `[~]` 进行中 `[x]` 完成。编号与 ROADMAP.md 对应。每个任务一个 PR，分支名用 `feat/global-<编号>`。

| 编号 | 任务 | 涉及文件 | 依赖 | 估时 | 状态 |
|---|---|---|---|---|---|
| P0-1 | 更新源指向 fork | `.env.example` `docker-compose.yml` `deploy/install.sh` `UpdatePanel.tsx` | — | 1h | [ ] |
| P0-2 | upstream-sync 分支与流程 | `docs/development.md` | — | 0.5h | [ ] |
| P0-3 | 前后端基线测试 | — | — | 1h | [ ] |
| P0-4 | Global 账号实测 `usage.credit` / trial 余额 | 真实账号 | — | 1h | [ ] |
| P1-1 | `features.py` | `server/features.py` | P0-3 | 2h | [ ] |
| P1-2 | `/api/system/features` | `server/routers/system.py` | P1-1 | 1h | [ ] |
| P1-3 | 调度器门控 | `server/main.py` | P1-1 | 1h | [ ] |
| P1-4 | 红包路由按开关注册 | `server/main.py` | P1-1 | 0.5h | [ ] |
| P1-5 | accounts A/B 接口门控 | `server/routers/accounts.py` | P1-1 | 2h | [ ] |
| P1-6 | stats `/credits` 门控 | `server/routers/stats.py` | P1-1 | 0.5h | [ ] |
| P1-7 | tencent 外呼兜底 | `server/services/tencent.py` | P1-1 | 1h | [ ] |
| P1-8 | wb2api `/status` 汇总 | `server/services/wb2api.py` | P1-1 | 0.5h | [ ] |
| P1-9 | `.env.example` 文档 | `.env.example` | P1-1 | 0.5h | [ ] |
| P1-10 | `test_edition_global.py` + 热路径契约 | `server/tests/` | P1-1~8 | 3h | [ ] |
| P2-1 | FeatureProvider | `web/lib/features.tsx` `web/app/layout.tsx` | P1-2 | 2h | [ ] |
| P2-2 | 导航和命令面板过滤 | `section-nav.ts` `ManagementBar.tsx` `command-palette.ts` | P2-1 | 2h | [ ] |
| P2-3 | 关闭页面的空状态 | `tasks/` `red-packets/` `claim/` | P2-1 | 1h | [ ] |
| P2-4 | Dashboard 去掉积分卡片和扇出请求 | `dashboard/page.tsx` `dashboard-credits.ts` | P2-1 | 3h | [ ] |
| P2-5 | 账号页去掉余额和签到 | `accounts/page.tsx` `CreditCountdown.tsx` `AccountTaskDialog.tsx` | P2-1 | 3h | [ ] |
| P2-6 | 设置 schedule 分组 | `settings/layout.tsx` | P2-1 | 1.5h | [ ] |
| P2-7 | 默认 Global realm | `realm-context.tsx` `RealmToggle.tsx` `AddAccountDialog.tsx` | P2-1 | 1.5h | [ ] |
| P2-8 | Key 积分额度显示 | `keys/page.tsx` | P0-4 | 1h | [ ] |
| P2-9 | i18n 5 语言 | `lib/i18n/locales/*.json` | P2-2~8 | 1h | [ ] |
| P2-10 | Playwright 截图和网络断言 | `dev/verify_global_edition.mjs` | P2-* | 2h | [ ] |
| P3-* | 模块化搬迁 | 见 ROADMAP | P2 稳定一周 | 2–3d | [ ] |
| P4-* | 纯净镜像和发布 | `Dockerfile` `release.yml` README | P3 | 1d | [ ] |

## 每个 PR 的完成定义
1. `WB_EDITION=full` 和 `WB_EDITION=global` 下 `pytest server/tests -q` 都通过
2. 热路径文件（gateway / anthropic / responses / keysvc / upstreamsvc / proxyroutes / modelmap）diff 为空
3. 不新增表，不删列
4. 涉及前端的 PR 附 full 和 global 两种模式的截图
