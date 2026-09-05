# HITnotice Phase C ECS PostgreSQL Installation Report

执行时间：2026-09-05（北京时间）。结论：**READY FOR PHASE D — Production Data Migration Rehearsal**。仅表示可以进入受控的数据迁移演练，不表示可以直接切换生产。

## Production Safety

现有生产应用仍使用 Supabase。此次未部署 Phase A/B，也未修改应用数据库后端。安装前、安装后、PostgreSQL 重启后及最终清理后均核验：ECS API MainPID 为 **1353837**，nginx MainPID 为 **1355144**，均 active，未被本阶段重启。

对 `/root/HITNotice` 的 Git 跟踪/未忽略文件、两份应用环境文件和 root crontab 共 **213 项**建立内容校验，最终全部一致。应用环境仍有 Supabase 配置且没有 DATABASE_URL；活动 crawler/digest/health cron 为 0，cron 内容校验一致。

使用固定 Phase B commit `13d46e7cea1d2c1ff128696666cd299f2f2524bd` 的 schema 和权限 SQL；未从生产脏工作区读取 schema。远程隔离源码/审计目录为 `/root/hitnotice-phase-c-20260905`，不属于当前应用 release。Delta preservation commit `a2c1a2aa79e3b13642e71a7bf092fe228118d750` 未改变。

本地材料位于独立分支 `codex/ecs-postgresql-installation`、工作区 `/private/tmp/hitnotice-postgresql-installation-20260905`。正式空库外的所有测试仅使用 synthetic 数据，没有邮件或其他外部业务调用。

## PostgreSQL Installation

- 主机：47.94.235.234；Ubuntu 22.04.5 LTS，amd64，2 vCPU。
- 服务端、psql、pg_dump、pg_restore：**17.11**，包版本 `17.11-1.pgdg22.04+2`。
- 来源：[PostgreSQL 官方 Ubuntu/PGDG 安装说明](https://www.postgresql.org/download/linux/ubuntu/)，实际使用 HTTPS `jammy-pgdg/main`，独立 Signed-By 官方密钥。
- 安装 postgresql-17、postgresql-client-17 及必需依赖。libpq5 更新为 PGDG 配套客户端库；未进行系统整体升级或 Supabase self-hosting 安装。
- `postgresql.service`：enabled / active(exited)，作为聚合单元；`postgresql@17-main`：active(running)，开机由聚合单元及 cluster 的 `start.conf=auto` 启动。
- 已实际重启 **PostgreSQL cluster 本身**，重启后连接、schema、空库状态均通过；未 reboot ECS。系统登录时已有重启提示，真实整机重启验证留给维护窗口。

## Network Binding

最终 `ss` 核验的本地地址：

```text
LISTEN  127.0.0.1:5432
```

**127.0.0.1:5432 only**。未监听 0.0.0.0、IPv6 或公网 IP。`ss` 输出的远端通配字段不代表本地公网监听。

本机 UFW inactive；iptables 的 INPUT/FORWARD/OUTPUT 默认 ACCEPT，未新增任何 5432 放行规则。数据库隔离由严格 loopback 监听及 pg_hba 拒绝规则实现。

**Cloud security group not independently verified**。没有云控制面权限证据，未猜测或修改 Security Group。

## Authentication

`password_encryption = scram-sha-256`；通过布尔查询确认 runtime 密码确为 SCRAM verifier，未输出 verifier 或密码。pg_hba 已解析无错误：

- Unix socket：仅 postgres 系统用户使用 peer 管理连接。
- 其他本机 socket 用户：reject。
- runtime：仅对明确列名的 HITnotice/阶段测试数据库，来自 127.0.0.1/32，SCRAM-SHA-256。
- 其余 IPv4/IPv6 连接：reject。
- runtime 无 trust/md5 规则。

新随机凭据仅存于 `/etc/hitnotice/postgresql-runtime.json`，**root:root / 0600**。没有写入 shell history、Git、报告或生产应用环境。此文件用于保管未来凭据及本次隔离 smoke，不代表应用已接入。

## Roles

| Role | LOGIN | SUPERUSER / CREATEDB / CREATEROLE | INHERIT | 用途 |
|---|---|---|---|---|
| hitnotice_owner | NO | 全部 NO | NO | 数据库、schema、业务对象 owner；仅管理者 SET ROLE 执行 DDL |
| hitnotice_runtime | YES | 全部 NO | NO | 未来应用最小权限账号；非对象/数据库 owner |

权限来自 Phase B 固定的 `runtime-grants.sql`：

- notices、subscriptions、email_deliveries、digest_runs：SELECT / INSERT / UPDATE。
- subscription_sources：SELECT / INSERT / DELETE。
- crawl_runs：SELECT / INSERT。
- resend_webhook_events：仅 SELECT。
- public schema：USAGE，无 CREATE；没有 runtime 的 TRUNCATE 权限。

实际 runtime smoke 验证了允许的读写和事务，以及 DROP TABLE、ALTER TABLE、CREATE ROLE、CREATE DATABASE、TRUNCATE 均被拒绝。没有复制 anon、authenticated、service_role 等平台角色。

## Database

正式目标数据库：`hitnotice`；owner `hitnotice_owner`；编码 UTF8；LC_COLLATE / LC_CTYPE 均为系统支持的 `C.UTF-8`；数据库 timezone 为 UTC。

配置文件为 `/etc/postgresql/17/main/conf.d/phase-c.conf` 和 `/etc/postgresql/17/main/pg_hba.conf`。原应用配置文件未改动。

## Schema Verification

| 对象 | 核验数量 |
|---|---:|
| 业务表 | 7 |
| 字段 | 82 |
| 索引 | 29 |
| PK / FK / UNIQUE constraints | 7 / 2 / 2 |
| CHECK | 36 |
| enabled updated_at triggers | 3 |
| set_updated_at 函数 | 1 |

逐项核验了：notices.hash NOT NULL + unconditional UNIQUE；subscriptions.email UNIQUE；unsubscribe_token 部分唯一；subscription_sources 双列唯一；delivery 四列窗口唯一、idempotency_key 唯一、resend_email_id 部分唯一；digest_runs 四列非 partial 唯一。两条 subscription FK 均为 ON DELETE CASCADE。

三个 BEFORE UPDATE ROW trigger 都正常启用；set_updated_at 是 invoker-security 函数。7 张表均归 hitnotice_owner。具体定义保存在 `phase-c-evidence/infrastructure-results.json`。

扩展仅默认 plpgsql。PostgreSQL 17 原生 gen_random_uuid 已足够，无需 pgcrypto；没有安装 uuid-ossp、supabase_vault 或其他 Supabase 平台扩展。

## Business Data State

**Production target database business rows: 0**。

| 表 | 最终行数 |
|---|---:|
| notices | 0 |
| subscriptions | 0 |
| subscription_sources | 0 |
| email_deliveries | 0 |
| digest_runs | 0 |
| crawl_runs | 0 |
| resend_webhook_events | 0 |

正式空库没有用于 destructive restore 或测试 fixture。`hitnotice_phasec_test`、`hitnotice_restore_test`、`hitnotice_restore_verify` 已全部删除。最终仅保留正式空库 hitnotice；runtime 活动/空闲连接总数为 0。

## Backup

- 目录：`/var/backups/hitnotice`，0700；dump 与 checksum 文件 0600。
- 脚本：`/usr/local/sbin/hitnotice-pg-backup`，root-owned / 0750。
- 管理连接：root 调用 runuser postgres，以 Unix peer 认证，无密码嵌入脚本。
- `set -euo pipefail`、flock 防重叠、custom-format pg_dump、临时文件、archive list 验证、成功后原子 rename、SHA-256、非空/文件大小检查、失败非零退出。
- 本地 retention：7 天；仅成功完成新备份后清理符合命名规则的过期 archive，始终保留本次最新成功备份。
- 已生成空库备份 `hitnotice-20260905-061650.dump`（文件名为 UTC），**54,880 bytes**；archive list 和独立 checksum 再校验均 PASS。
- 独立 systemd service/timer：`hitnotice-pg-backup.service` / `.timer`，timer 已启用。每日 **03:30 Asia/Shanghai**，最多随机延后 120 秒，Persistent=true。首次手动触发 Result=success、ExecMainStatus=0。
- PostgreSQL 日志沿用官方包 logrotate：weekly、rotate 10、compress/delaycompress；没有修改应用日志规则。

## Restore Rehearsal

`hitnotice_restore_test → pg_dump -Fc → 全新 hitnotice_restore_verify → integrity validation` 已完整通过。

Fixture 行数：notices 3、subscriptions 3、subscription_sources 6、email_deliveries 9、digest_runs 2、crawl_runs 2、resend_webhook_events 1。覆盖 weekday/weekly、active/unsubscribed、全部 9 种 delivery status、running/success、JSONB 对象/NULL、微秒边界及外键关系。

校验不仅是 restore exit 0：逐表排序后的全部行字段哈希一致；columns/defaults/nullability、constraints、index definitions、trigger definitions/enabled、function definition、table ownership 的 catalog 一致。因此 UUID、时间戳、JSONB、状态、token、provider ID、idempotency_key 和 metadata 的值均原样保留，报告没有输出这些字段内容。

Synthetic archive **56,873 bytes**，SHA-256 `c4238071ab8c92cedf7349eb52e3bdea7a8e15fbb4cca31fb29c25973cf74dd3`。第一次尝试提前删除 public schema 导致 restore 失败；修正为保留新数据库标准 public schema 后，从清空 fixture 开始完整重跑并通过。旧尝试仅影响临时 verify 库，未涉及正式空库。

Synthetic 审计 archive 留存在 root-only 审计目录并明确命名；测试数据库均已删除。真实 Supabase dump/restore 从未执行。

## Offsite Backup

**PENDING — requires OSS bucket/credential**。

未发现 ossutil/aliyun CLI 或已确认专用于 HITnotice backup 的配置；没有创建云资源、猜 bucket 或上传数据。下一阶段须确认专用 private bucket/region/prefix、最小权限凭据或实例角色、加密、生命周期、上传完整性校验，以及从 OSS 恢复测试。详见 [Phase D runbook 草案](PHASE_D_MIGRATION_RUNBOOK_DRAFT.md)。本机备份仍与 ECS 共用故障域，不能当作异地灾备。

## Resource Configuration

| 参数 | 值 |
|---|---|
| max_connections | 30 |
| shared_buffers | 128MB |
| work_mem | 4MB |
| maintenance_work_mem | 64MB |
| effective_cache_size | 512MB |
| max_wal_size / min_wal_size | 1GB / 80MB |
| fsync / synchronous_commit / full_page_writes | on / on / on |

未关闭持久性保障。建议仍遵循 Phase B 每进程 pool max=5、四类进程约 20 个应用连接的预算，预留约 10 个管理连接。

日志保留启动/关闭/认证失败/fatal/error；不启用 SQL statement 或 duration-statement 日志；bind 参数记录长度均设 0，log_error_verbosity=terse 抑制包含失败行的 DETAIL，log_min_error_statement=panic，避免失败 SQL 带出邮件或 token。后续慢查询监测应先评审数据脱敏，不能直接打开 verbose SQL logging。

**Swap 决策：本阶段未新增。** 最终内存约 374 MiB used、1.0 GiB available；smoke 期间最低可用约 955 MiB，无 OOM，当前空库阶段没有必须增加 swap 的压力。1.6 GiB 的共同部署仍有未来 OOM 风险；真实负载/切换前复评是否在维护窗口增加 1 GiB、低 swappiness 的应急 swap，不能将 swap 当常规容量。

磁盘最终约 40 GiB 总量、8.7 GiB 使用、29 GiB 可用（24%）；PGDATA 清理后约 63 MiB（演练期间约 79 MiB）；正式空库 8,148,659 bytes，fixture 库约 8,443,571 bytes。当前空间对已观测规模充足，仍应设置 >70% warning、>85% critical，关注 WAL、临时文件和备份增长。

## Connectivity Test

runtime 通过本机 TCP/SCRAM 独立建立 **100 次连接，0 failures**，每次 SELECT 1。

| 项目 | min | mean | max |
|---|---:|---:|---:|
| 建连 ms | 8.62 | 10.59 | 26.11 |
| 查询 ms | 0.72 | 1.05 | 6.07 |

这只是 ECS 当时的短时本机结果，不是生产 SLA。

## Pool Test

使用固定 Phase B 的真实 `pg` Pool 和 repositories：100 sequential queries、20 concurrent queries、事务 acquire/release；并发峰值 **5**；pool.end 后 runtime 连接为 **0**，CLI 正常退出。

权限读写、订阅回滚/替换/幂等退订、notices insert/unchanged、并发 delivery claim、accepted 后 late failure 保护均 PASS。没有执行正式 crawler/digest/retry/health CLI，也没有调用 Resend。

完整 npm ci 因远程下载长时间等待被主动停止（不是成功安装，也不是 OOM）；未完成的目录已清理。最终 smoke 使用固定 Phase B 本地 npm ci 已验证的 pg 8.23.0 及其 13 个纯 JS 依赖副本，并将现有匹配版本 tsx 4.23.0 / esbuild 0.28.1 / Linux binary **只读复制**到隔离目录。未写入生产 node_modules。这是必要依赖的隔离运行验证，不冒称在 ECS 完成整套前端 build。

## Resource Sanity Under Test

smoke 期间 14 次采样：最低 available **955.14 MiB**、swap 使用 **0**、最大一分钟负载 **0.11**、postgres 进程最多 **11**（后台进程加最多 5 个 pool connection）。无 OOM 记录、无 swap thrashing；测试后连接释放、测试库删除、安装进程已停止，最终负载约 0.03。

## Security

- 5432 没有公网监听；本机未加公网放行规则，云 Security Group 未独立核验。
- runtime 非 superuser/owner，无 DDL/CREATEDB/CREATEROLE；无 Supabase 平台角色。
- 新凭据 root-only，没有 production DATABASE_URL 切换。
- 本阶段应用 release/PID、应用配置和业务 cron 保持原状。

## Remaining Risks

生产数据仍在 Supabase，应用仍指向 Supabase；真实 source dump/restore 未做；Vercel Phase A canonical 未部署；Phase B app 未部署；cutover/rollback 未执行；OSS 异地备份待配置；delta 仍是 WIP。

此外，真实数据完整性、微秒窗口与 JS Date 身份转换、邮件 pending/accepted 对账、同机资源和磁盘故障恢复、整机 reboot 后验证仍需后续检查。系统现存 snapd/cloudmonitor unit lint 提示不属于 PostgreSQL unit，未擅自修复这些业务外组件。

## Phase D Recommendation

**READY FOR PHASE D — Production Data Migration Rehearsal**。

已具备独立空库、最小权限、备份/恢复验证、连接和资源基础。下一阶段只应先进行受控真实数据迁移演练；真正切换前必须完成异地恢复能力、真实数据完整性验证、writer freeze、邮件状态对账与可执行 rollback。此结论不授权现在 dump Supabase、切换应用或恢复业务 cron。

## 最终安全确认

- [x] 未修改 `/root/HITNotice`，未覆盖 delta preservation。
- [x] 未修改当前 ECS production release，未部署 Phase A/B。
- [x] 未修改 Vercel、Supabase；未 dump 生产 Supabase 或 restore 真实数据。
- [x] 未修改 production DATABASE_URL 或 `/etc/hitnotice/ecs-api.env` 后端。
- [x] 未修改业务 cron，未恢复 crawler/digest/health。
- [x] 未运行正式 crawler/digest、retry send、delta send、health notification。
- [x] 未发邮件、修改真实订阅/退订、创建微信草稿或 replay webhook。
- [x] 未 reboot ECS，未重启 API/nginx；仅重启 PostgreSQL。
- [x] PostgreSQL 仅监听 localhost；正式库 7 张表均为 0 行。
- [x] 未 merge/push main，未执行任何远程 Git push。

原始非敏感证据见 `docs/phase-c-evidence/`；执行脚本和固定 schema 副本见 `ops/phase-c/`。其中配置脚本是已执行的一次性基础设施材料，现有库上不要直接重跑。
