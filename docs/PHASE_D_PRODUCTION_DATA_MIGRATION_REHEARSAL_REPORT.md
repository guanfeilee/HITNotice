# HITnotice Phase D Production Data Migration Rehearsal Report

日期：2026-09-05。结论：**READY FOR PHASE E — Controlled Production Cutover**。

本次真实生产数据演练已完成。该结论表示可以进入受控切换阶段的准备与审批，**本次没有执行生产切换**。正式 `hitnotice` 七表仍全部为 0 行；生产继续使用 Supabase。

## Stop-condition Adjustment

依据用户最新授权，已知、发生于密码重置之前的 Data API/ECS health 间歇性失败不再单独阻塞 Phase D。继续条件改为独立验证原生 PostgreSQL/TLS/只读访问、七表可读、pending/running 为 0、正式目标库为空、业务 cron 暂停，并且没有密码重置特有的新故障证据。本次全部满足。

Data API：**DEGRADED — pre-existing**。ECS health：**FAILING / INTERMITTENT**。这是已知的 ECS → Supabase HTTPS connectivity issue，不标记为 password reset regression。

## Password Reset Authorization Result

重置前的生产原生数据库依赖核验结果：**NOT FOUND in the inspected scope**。此前检查了 1,266 个相关 ECS 文件、systemd/EnvironmentFile、cron、运行中 Node 环境、shell/PG 配置及 Vercel 当前生产变量；没有发现使用旧 Supabase PostgreSQL 密码的生产配置。已有 localhost PostgreSQL 基础设施与 Supabase 原生连接依赖分开判断。

密码由用户完成重置；未独立记录提交时间，本次没有再次重置。保存脚本原有“不足 20 位与输入不一致共用错误”的问题已修正；通过隐藏输入保存后已验证能认证。

Credential file：`/root/.config/hitnotice/supabase-production-db.json`。文件 root-owned **0600**，目录 **0700**。报告和代码不含密码、连接 URL、API key、完整邮箱或 token。官方 CA 位于 `/root/.config/hitnotice/supabase-ca.crt`；TLS 证书链和 hostname 验证开启，未关闭验证。

**Password Reset Regression Assessment: No reset-specific production regression identified.** 这代表目前未发现直接证据，不代表对所有不可见组件的绝对保证。

## Data API Before / After and Native PostgreSQL Status

| 路径 | 重置前 | 重置后/演练结束 |
|---|---|---|
| ECS → Supabase Data API HEAD | FAIL / URLError | 间歇性：一次 IPv4 curl HTTP 200，结束检查 FAIL / URLError |
| 已签名 ECS internal health GET | 约 10 秒后断开 | 结束检查仍约 10 秒后断开 |
| 网站首页 GET | HTTP 200 | HTTP 200 |
| ECS API / nginx | active | active，PID 未变化 |
| ECS → Session pooler :5432 | 当时缺少凭据 | **PASS，30/30 独立连接成功，TLS/只读 SQL PASS** |

30 次测试从 2026-09-05T11:12:43.196Z 到 2026-09-05T11:13:20.976Z；每次新建连接、只读事务 SELECT 1，每五次补充 notices count。失败数 **0**，连接及轻量事务耗时中位 **1109.91 ms**、最大 **1483.35 ms**。

Pooler 未保留最初的 startup read-only GUC，因此最终采用显式 `BEGIN … READ ONLY` 并验证 `transaction_read_only=on`。源库全部为 SELECT/SHOW、事务控制和只读 pg_dump；未进行业务写入。

两条路径必须分开理解：

- Data API：ECS → HTTPS / Cloudflare / PostgREST，仍有间歇性失败。
- Snapshot：ECS → PostgreSQL Session Pooler :5432 → PostgreSQL，本次稳定且成功完成一致快照。

因此 Data API 当前异常不影响本次 PostgreSQL snapshot rehearsal 的技术有效性。不能据此声称所有跨境网络问题已解决；正式切换到 localhost 后，核心 repository 操作才会离开这条跨境数据库路径。

## Production Safety

结束时 API PID **1353837**、nginx PID **1355144** 均 active；PostgreSQL PID **1428267**，仅监听 **127.0.0.1:5432**。Phase C 保护清单 **213** 项与 root crontab 哈希未变化。导出前未发现运行中的 crawler/digest/retry/health producer。crawler/digest/health cron 继续暂停。

未修改 `/root/HITNotice`、生产 .env、`/etc/hitnotice/ecs-api.env`、Vercel、ECS API release、nginx；未设置生产 DATABASE_URL；未部署 Phase A/B、恢复 cron、切后端、覆盖 delta preservation 或 merge/push main。未运行正式 crawler/digest、retry/delta send、health notification、邮件、微信草稿或 webhook replay。除用户完成的密码重置外，本工作未修改 Supabase 生产配置，也未写生产业务数据。

本次基础设施变更仅限隔离 rehearsal/synthetic 数据库、它们的数据库权限与 localhost HBA 规则，以及私有演练文件；只 reload 了 PostgreSQL 配置以应用这些本地连接规则。

## Snapshot and Archive Security

| 项目 | 本次实际值 |
|---|---|
| Snapshot timestamp (UTC) | 2026-09-05 11:17:07.628361+00 |
| 对应北京时间 | 2026-09-05 19:17:07.628361 +08:00 |
| 源 PostgreSQL | 17.6 |
| 工具 | pg_dump (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg22.04+2) |
| Source endpoint | aws-1-ap-northeast-2.pooler.supabase.com |
| 格式 | custom, data-only |
| 大小 | 479291 bytes |
| SHA-256 | 2a5ebcd27cf95b5ee6e68908464d8307b825a46b8e4266e28a1fbce8487fdeda |
| pg_dump 耗时 | 13.319 s |
| 源完整核验耗时 | 5.036 s |

目录：`/var/backups/hitnotice/migration-rehearsal/run-2026-09-05T11-17-06-631Z-0ziBKg/`，**0700**。源归档：`supabase-production.dump`；checksum：`supabase-production.dump.sha256`，均 **0600**。

一个保持打开的 REPEATABLE READ READ ONLY 事务导出 snapshot ID；该事务内计算源列定义、行数、状态、完整哈希和关键约束统计；pg_dump 使用同一 `--snapshot`，完成后回滚源事务。导出前 pending=0、running=0。源仍有网站正常写入口，本次不宣称全局 freeze。

TOC 检查：恰好七个 allowlist TABLE DATA entry。没有 auth/storage/realtime/vault、平台 role、ACL、RLS、extension 或平台 schema。Schema 来自 Phase B，不从 Supabase 复制平台配置。

归档由 pg_dump 从源直接流入 ECS；没有单独的本地开发机传输阶段，网络传输包含于 dump 耗时。临时 .pgpass 位于受保护目录，权限 0600，已删除。真实 dump、业务行和凭据未进入本地开发机、Git、聊天或公共存储。

## Rehearsal Database and Restore

目标：`hitnotice_migration_rehearsal`，owner `hitnotice_owner`。创建前确认同名库不存在，没有覆盖旧库。Schema 使用 Phase B commit `13d46e7cea1d2c1ff128696666cd299f2f2524bd` 的固定 baseline，SHA-256 校验通过。

恢复以 `hitnotice_owner` 执行，单事务、遇错停止；所有约束和触发器保持启用。恢复耗时 **139 ms**，首轮完整校验 **2967 ms**。

Runtime 仅获得该真实 rehearsal 库的 CONNECT / schema USAGE / SELECT；设置了该库专属的默认只读事务。写权限检查为 false。仅允许 localhost SCRAM 连接；生产服务未配置该库，没有 scheduler 指向该库。

## Row Counts and Full-table Deterministic SHA-256

| Table | Source snapshot | Rehearsal | SHA-256 prefix | Result |
|---|---:|---:|---|---|
| notices | 1155 | 1155 | dd05fe6756333d11 | MATCH |
| subscriptions | 76 | 76 | c5a0452a4b4a5bcc | MATCH |
| subscription_sources | 391 | 391 | dc29342206b88214 | MATCH |
| email_deliveries | 1746 | 1746 | 0d3ab166ac856b09 | MATCH |
| digest_runs | 29 | 29 | 0b220577a74f9c26 | MATCH |
| crawl_runs | 2137 | 2137 | f1394fe253075ce1 | MATCH |
| resend_webhook_events | 0 | 0 | e3b0c44298fc1c14 | MATCH |

内部比较完整 256-bit 哈希，报告仅列前 16 位。使用 canonical baseline 固定列顺序，UUID 主键排序；每列编码为 `[SQL-is-null, value]`，因此 SQL NULL、JSON null、空对象和文本均可区分。timestamptz 显式 UTC 六位微秒，UUID 标准小写，text 不 trim，JSONB 由 PostgreSQL canonical 序列化保留数值/字符串/对象/数组类型。每行 UTF-8 字节串以前置 8 字节长度分帧后送入 SHA-256。源和目标使用相同编码。

Synthetic 测试之后重新核验七表，仍 **全部 MATCH**；最终完整校验耗时 **2746 ms**。

## Status Distribution Comparison

| 表 / 字段 | Snapshot 与 rehearsal 完全一致的分布 |
|---|---|
| subscriptions.status | active 73；unsubscribed 3 |
| subscriptions.frequency | weekday_digest 69；weekly_digest 7 |
| email_deliveries.status | accepted 1,536；sent 210；pending/delivered/suppressed/bounced/complained/failed/skipped 全部 0 |
| digest_runs.status | success 29；running/partial_success/failed 全部 0 |
| crawl_runs.status | success 1,978；failed 159 |

状态集合按 canonical 实际 schema 核验，未添加不存在的 digest_runs duplicate 状态。结束时源 pending 和 running 仍为 0。

## Schema, Referential Integrity and Unique Invariants

**PASS**：7 tables / 82 columns / 29 indexes / 36 CHECK / 3 enabled triggers / 1 invoker function；另有 7 PK、2 FK、2 unique constraints。列定义、默认值、nullability、所有索引/约束、函数与触发器定义、table owner 均与空正式库中已核验 canonical baseline 的完整 catalog 相同；所有约束 validated。

两类 subscription 外键孤儿均为 **0**。notices.hash、subscriptions.email、非空 unsubscribe_token、subscription_sources(subscription_id,source_id)、delivery idempotency_key、delivery 四字段窗口、非空 resend_email_id、digest run 四字段窗口、webhook svix_id 的重复组均为 **0**。必须非空的 hash/idempotency_key 违规数为 **0**。

## Timestamp, JSONB and Critical History

**PASS**：subscriptions 全 8 字段、email_deliveries 全 23 字段、digest_runs 全 17 字段，以及其他表全部字段均纳入完整哈希。subscription/delivery/run IDs、完整邮箱、unsubscribe tokens、idempotency keys、resend IDs、period windows、status、attempt count、metadata、error/response/webhook JSONB 和所有历史 timestamp 原样保留，实际值未输出。

UTC 表示变化未改变 instant；JSONB key 顺序不作为差异，SQL NULL 与 JSON null / {} 不混淆。COPY 为 INSERT 操作，未触发 BEFORE UPDATE 的 set_updated_at；历史 updated_at 与源完全一致，3 个触发器始终启用。源 delivery/run 窗口中超过毫秒精度的 endpoint 行数均为 **0**，本次未发现 JS Date 精度造成窗口身份丢失。

## Phase B Repository Read-only Compatibility

**PASS**。ECS 独立源码目录的 lib/database/package.json/tsconfig 共 **64 个文件**逐文件 SHA-256 与指定 Phase B commit 一致，mismatch=0。运行库使用 Phase C 已核验的最小依赖，未部署生产应用。

覆盖 getActiveDigestSubscriptions、getSubscriptionSources、getNoticesForSources、getDigestWindowForSubscription、getLatestPermanentDeliveryBlock、getScheduledDigestRun、health aggregate 和 getAdminNotices。核验 **73 个活跃订阅、73 次 notice 集合查询、29 条历史 scheduled run、28 个 admin filter 场景**，包括 limit 200、字段形状、source filter 和排序。

参考结果来自哈希已验证快照的独立内存筛选/计数及既有纯业务函数，不是另一次可能漂移的 live Data API 查询。完整 ID/email/token 对比在内存完成，不输出具体值。窗口、delivery acceptance 与 source registry 在 A→B 的对应文件没有变化。runtime BEGIN/ROLLBACK、默认只读和 SELECT-only 权限通过；脚本外部 fetch 次数 **0**。

## Digest Dry-run Compatibility

通过 read functions 和纯分组计算；未执行发送 CLI、claim、run 创建或写状态。采用 snapshot 当天北京时间 20:00 作为计算 period end，当前为周六，因此这些是受控的两类 digest 计算，不是触发正常周末调度。

| Type | Users | Would receive | Notice items | Groups | Skipped | Blocked | Failed |
|---|---:|---:|---:|---:|---:|---:|---:|
| weekday_digest | 66 | 0 | 0 | 352 | 66 | 0 | 0 |
| weekly_digest | 7 | 5 | 196 | 30 | 2 | 0 | 0 |

Notice items 是跨订阅累计条目，可包含同一通知对多个订阅的重复；Groups 包含无更新的订阅来源组。Would receive 是纯计算候选数，实际发送 **0**。

## Health and Admin Compatibility

报告仅 generate。当前快照时点：26 个源均 stale，整体 failed；这是暂停 crawler 后的真实业务判定，repository 兼容性仍 PASS。当天两个 digest 均 not_scheduled。另在最新历史 run 结束后 30 分钟的情景中，23 个源 healthy、3 个 failed、55 条新通知，weekday digest success。结果与快照参考计数和纯业务判定一致。

全部历史 delivery 的 accepted 口径计数 1,746，其中 sent 210；此处 accepted 指含已 accepted/sent 状态的业务指标，不等于 provider confirmed delivered，且 webhook tracking 仍按 canonical 设计关闭。Admin 内容未输出。

## Transaction / Claim Rehearsal

仅在另一个初始为空的 `hitnotice_phased_synthetic` 库使用 `example.invalid` 合成记录：

- 订阅创建、替换 source、失败完整回滚、显式事务回滚通过；8 路并发订阅保持单一身份和完整来源集合。
- crawler insert/update/unchanged 通过，first_seen_at 的微秒保持。
- 10 路 delivery claim 仅 1 次成功；failed retry、accepted 后拒绝重复 claim、迟到 failure 不覆盖 accepted 均通过。
- 10 路 scheduled run claim 仅 1 次成功；5 路并发 unsubscribe 结果幂等。
- 外部 fetch 次数 0；无 Resend 调用。

成功后核对本次 provenance、owner、无残留连接和合成邮箱范围，删除该 synthetic 库及其唯一 HBA 行。测试数据已清理，无真实用户记录参与 claim。真实 rehearsal 前后全表哈希仍一致。

## Performance Against Real Data

每类预热一次，然后 20 次轻量只读调用；单位 ms。结果用于当前数据量 sanity check，不是压力测试或 SLA。

| Query class | Median | Max |
|---|---:|---:|
| activeSubscriptions | 1.119 | 2.537 |
| subscriptionSources | 0.767 | 1.206 |
| digestNotices | 0.999 | 9.801 |
| healthAggregates | 6.988 | 12.972 |
| adminNotices | 1.553 | 1.707 |
| latestDelivery | 0.912 | 1.377 |
| latestRun | 0.877 | 3.92 |

应用 pool max=5。结束时 ECS 可用内存约 1,003 MiB、磁盘可用约 29 GiB、无 swap；本次未安装额外生产应用依赖。

## Rehearsal Backup / Restore and Retention

最终完整 custom backup：
`/var/backups/hitnotice/migration-rehearsal/run-2026-09-05T11-17-06-631Z-0ziBKg/hitnotice-migration-rehearsal.dump`

大小 **526778 bytes**，生成耗时 **163 ms**。SHA-256：
`a88249961df8a55446aaec204094933e8ae5f0047020f39b2a32d07371921c1d`

checksum 文件同目录；pg_restore --list PASS，七个 TABLE DATA entry。源 data-only 归档已经实际恢复并全量核验；最终完整 backup 在本次完成 checksum/TOC 检查，未额外创建第二个真实数据库重复恢复。

保留 `hitnotice_migration_rehearsal` 和受控 artifacts 供 Phase E 前检查。该库不是 production，runtime 只读、无 scheduler、公网不可访问。临时 pgpass 已移除；所有 artifact 文件 0600、目录 0700。未来清理前应保留所需演练证据并确认 Phase E 需求。

## Migration Timing

- 源完整哈希/约束检查：5.036 s。
- pg_dump（包含跨网传输）：13.319 s；没有独立传输阶段。
- Data-only restore：0.139 s。
- 首轮目标完整校验：2.967 s。
- Synthetic 后完整校验：2.746 s。
- 最终 rehearsal backup：0.163 s。

这些是本次已测步骤，未把方案准备/代码审阅时间计为迁移 downtime，也不承诺正式停机窗口。

## Formal Target Database

**hitnotice: business rows = 0**。七张表逐表均为 0，结束保护清单复核通过。真实数据仅恢复到明确命名的 rehearsal 库。

## Production Source Drift

结束源检查 2026-09-05T11:27:53.109Z 七表行数与 snapshot 相同，pending=0/running=0。未观察到行数漂移；未据此断言所有行内容或后续时点永不变化。Supabase 仍是 live source。本次 snapshot 不代表最终 cutover 数据，Phase E 必须 freeze all writers → new final dump。

## Phase E Cutover Checklist and Rollback Draft

详见 [Phase E controlled cutover checklist](PHASE_E_CONTROLLED_CUTOVER_CHECKLIST.md)。正式切换仍需单独授权，不由本报告自动执行。

## Remaining Risks and Recommendation

Production still Supabase；Phase B 和 canonical Vercel 未部署；final writer freeze、final production dump 和 real cutover 均未执行。跨境 Data API 已知退化仍在。Post-cutover writes 之后的回滚复杂，必须 freeze → export PostgreSQL delta → reconcile → merge back，不能直接切回陈旧源库。OSS offsite backup 仍 pending；delta WIP 仍明确排除。

**READY FOR PHASE E — Controlled Production Cutover**：native PG 稳定、真实 dump/restore 成功、七表数量和完整哈希一致、关键历史完整、repository/synthetic checks 通过、正式目标仍为空。Phase E 的现场 writer freeze、备份/回滚和部署检查仍必须完成。

证据：[汇总验证结果](phase-d-evidence/rehearsal-results.json)、[结束 Data API/health 状态](phase-d-evidence/health-final.json)。历史阻塞及重置过程记录于此前报告，均不替代本次成功演练结果。
