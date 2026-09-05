# Phase E — Controlled Production Cutover Checklist (DRAFT; NOT EXECUTED)

Phase D 的真实 snapshot/restore/integrity/repository 演练已通过。此清单是 Phase E 的输入，不是切换授权。正式生产仍使用 Supabase，空目标 `hitnotice` 不得在 Phase D 被填充。

## 固定版本和数据边界

- Canonical PostgreSQL code：`13d46e7cea1d2c1ff128696666cd299f2f2524bd`，或 Phase E 经批准并重新验证的后续 commit。Delta WIP 不包含在内。
- ECS：47.94.235.234；PostgreSQL 17.11，127.0.0.1:5432；正式数据库 `hitnotice`，owner/runtime 使用已审核角色。
- 本次源为 PostgreSQL 17.6；归档路径和校验值见 Phase D 最终报告。演练数据库仅用于核验，不能改名冒充生产。
- 原生 pooler 必须显式只读事务；不能假设 startup GUC 被 pooler 保留。最终导出仍启用严格 TLS 和同一 snapshot 对应的全表核验。
- 不使用 Phase D dump 作为最终数据。必须在实际冻结所有 writers 后重新 final dump。

## Writer freeze 清单

| Writer | 当前状态 / 证据边界 | Phase E 必须完成 |
|---|---|---|
| Vercel `/api/subscribe` | ACTIVE 生产入口；本次未提交真实 POST | 在公开边界维护/拒绝写入；核对实际 live deployment 和 route |
| Vercel `/api/unsubscribe` | ACTIVE 生产入口；本次未提交真实退订 | 同时冻结 token 链接入口，避免迁移期间源继续变化 |
| ECS `/internal/subscribe` | ACTIVE；当前 server 路由已读，签名保护 | 在服务边界冻结，并确认没有 in-flight POST |
| ECS `/internal/unsubscribe` | ACTIVE；当前 server 路由已读 | 与 Vercel 一并冻结，不能只停 cron |
| ECS crawler cron | PAUSED；保护清单/root crontab 未变化 | 复核系统/所有用户 cron、timer、进程；禁止手工启动 |
| Scheduled digest cron | PAUSED；保护清单未变化 | 确认没有后台 run/send，freeze 期间不得 claim 或发送 |
| Health notification cron | PAUSED | 只读检查可保留，通知发送暂停 |
| Retry / 手工 digest | MANUAL 潜在 writer；导出前未见活跃 producer | 限制操作入口，记录维护期间操作者和在途请求 |
| Test writer / 一次性维护脚本 | MANUAL 潜在 writer | 复核入口并停止；禁止向真实库跑 write tests |
| Legacy webhook route | Canonical 为 DISABLED；当前 Vercel legacy live 行为需现场复核 | 未确认前按潜在 ACTIVE writer 处理；禁用接收/处理，不 replay |
| Delta WIP | MANUAL / 不在 canonical 范围 | 继续排除，不部署、不恢复 scheduler、不发送 |

ACTIVE 表示仍存在生产写入入口，不表示本次观察到正在写入。未知/legacy 状态不能由新版源码或 HEAD 响应推断安全。以上是冻结清单，当前并未全局冻结。

## 进入维护窗口前

1. 获得 Phase E 独立执行授权、负责人、维护公告/窗口和回滚负责人；固定实际 Vercel/ECS 旧 release 及候选新 release。
2. 再次复核正式 `hitnotice` 七表为 0、原生 TLS/只读访问、cron 暂停、无活跃 producer。记录 pending/running；Phase D 两者为 0，不能复用旧值作为现场判断。
3. 已知 Data API degraded 仍需记录，不自动归因为密码重置；如发现新的认证或旧密码依赖证据则停止调查。
4. 确认磁盘、内存、连接预算、备份权限与恢复操作员访问。OSS 当前 PENDING；正式生产灾备应完成异地备份及恢复验证，或由负责人明确接受同 ECS 备份的故障域风险。
5. 核对所有公开、内部、CLI、webhook 写入口；确认维护方案覆盖 unsubscribe 和 in-flight 请求，不允许两套后端并行写入。

## Freeze → New final dump → Restore → Verify

1. 执行实际 writer freeze；记录时间、确认无 in-flight POST、无 producer、pending=0/running=0，或者对非零状态形成经确认的处置方案。不得盲目重置状态或 resend。
2. 在 freeze 后创建新的 root-only artifact 目录和只读一致 snapshot。七表 data-only pg_dump、版本/TOC/checksum 检查以及源全表哈希使用同一个 snapshot。保留完整旧源不变。
3. 在正式目标重新核对 baseline/schema、为空、身份正确后，才执行经批准的正式 restore。不得把 rehearsal 数据库当目标。保持历史 timestamp 和 trigger 语义不变。
4. 全七表 count/hash、status、FK/unique、timestamps、JSONB、关键历史及候选 release 只读检查全部通过。备份正式目标，核对 archive list/checksum。
5. 在新批准的 ECS release 中安全配置 runtime credential，并部署与之匹配的 Vercel canonical proxy。只在此阶段设置生产 DATABASE_URL；本次 Phase D 没有设置。
6. 完成只读健康、admin、订阅界面检查。任何正式 synthetic 写入/邮件验证必须先明确范围和发送策略；不得因为本清单自动向真实用户发信。
7. 有序开放一个 writer；核对无旧 Supabase writer 后，按批准顺序恢复业务 cron。Delta 继续排除。记录首次 PostgreSQL 生产写入时刻，这是回滚复杂度的分界点。

## Rollback draft

新 PostgreSQL 还没有接受生产写入时：保持 writer freeze，恢复经记录的旧 release/backend 配置，确认 Supabase 保持一致，再开放单一 writer。

新 PostgreSQL 已接受生产写入时：立即冻结两侧，保存目标快照/审计信息，按订阅/来源关系、delivery provider acceptance/幂等窗口、run metadata 和时间戳导出 PostgreSQL delta，处理冲突并验证后再合并回 Supabase。不能直接切回旧源、丢失新订阅/退订或重发已 accepted 邮件。此反向方案仍需 Phase E 负责人具体化和验证；Phase D 未对真实 Supabase 演练回写。

回滚决定、delta 合并及任何源写入均不由 Phase D 授权。保留旧 source、归档和版本证据直到回滚窗口结束。

## 时间依据

本次数据量下 pg_dump 13.319 s（包含网络流传输），data-only restore 0.139 s，源全量核验 5.036 s，目标首轮全量核验 2.967 s。正式维护窗口还包含 freeze、在途请求耗尽、最终校验、部署和观察，不能把上述相加直接作为承诺 downtime。
