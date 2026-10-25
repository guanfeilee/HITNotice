# HITnotice 2026-10-21 生产故障收尾与验收报告

验收时间：2026-10-25（Asia/Shanghai）

## 1. Final Status

**PARTIAL**

应用代码缺陷、邮件恢复、生产部署、测试和三端 Git 基线同步均已完成。唯一未恢复项是外部数据源“今日哈工大”仍无法从生产 ECS 建立 TCP 连接；系统已按设计以 `degraded` 状态继续处理其余 25 个数据源，不再阻断 Digest。

## 2. Previous Task Recovery

### 上次已经完成

- 定位 2026-10-21 故障链路：Cron 正常触发，Crawler 仅 `today` 数据源失败，其余 25 个数据源正常写入；旧 Digest 因要求全部 26 个数据源新鲜而在 delivery claim 前退出。
- 在提交 `e06609935ccb89703afdd03513909c6c83836014` 中实现单数据源故障隔离，完成测试、推送 GitHub `main` 并部署 Tasks 不可变 release。
- 对 2026-10-21 20:00 weekday digest 进行固定窗口、计划哈希锁定和幂等键校验后的精确恢复。

### 上次未完成

- 未提交完整最终报告。
- 未在任务结束后核验 45 封恢复邮件的最终 provider event。
- 本地 Mac 与 `/root/HITNotice` checkout 仍停留在旧 commit，且各自存在未提交工作。

### 本次完成

- 复核本地、GitHub、ECS checkout 与实际运行 release。
- 确认 45 个恢复投递在 Resend 的最终事件均为 `delivered`。
- 验证 10 月 22、23 日后续 Cron、Crawler、Digest 和 Health 流程正常执行。
- 重跑完整离线、集成和生产只读验收。
- 将本地及 ECS 旧未提交工作分别封存为命名 stash，并以 fast-forward 对齐 GitHub `main`。

## 3. Root Cause

### 今日哈工大 fetch failed

- 目标：`https://today.hit.edu.cn/category/10`
- DNS 正常解析到 IPv4 `202.118.254.117` 和 IPv6 地址。
- ECS 到目标站点的 TCP 80/443 均超时；HTTPS 在 TLS 握手前即失败，因此无 HTTP 状态码、重定向或 HTML 可供解析。
- 2026-10-20 同一 crawler、URL 和解析器仍成功抓取 20 条；10 月 21 至 23 日连续失败。
- 2026-10-25 再次从 ECS 及外部抓取均超时。
- 现有请求已包含浏览器 User-Agent、Accept、Accept-Language、Referer、15 秒上限超时和 redirect follow；没有证据表明选择器或发布日期解析是本次故障原因。

结论：当前可证实的根因是外部站点/到站点网络路径不可达，而不是 DNS、TLS 证书、HTTP 重定向或解析器异常。因 TCP 连接无法建立，页面结构是否随后发生变化暂时无法重新验证。

### 故障传播

旧版本 Crawler 已能记录单源失败并继续其余来源，但 Digest 的 `assertFreshCrawl` 要求全部 26 个数据源新鲜。`today` 单独失败因此导致 20:00 Digest 在创建 run/delivery claim 前退出。

### 实际影响

- 25 个正常来源的抓取和数据库写入成功。
- 原 20:00 Digest 未创建 run、未创建 delivery，Resend 无摘要提交。
- Health Report 准确报告失败。
- 修复后单源失败只使系统进入 `degraded`；选择正常来源且有内容的订阅继续发送，完全依赖不可用来源的订阅保持阻断。

## 4. Code Changes

修复提交：`e06609935ccb89703afdd03513909c6c83836014`（`Isolate degraded crawler sources in digests`）

修改文件：

- `lib/tasks/daily.ts`
- `lib/digest/service.ts`
- `lib/digest/types.ts`
- `lib/digest/runs.ts`
- `lib/db/digest-runs.ts`
- `lib/email/template.ts`
- `lib/health/report.ts`
- `scripts/test-crawler-reliability.ts`
- `scripts/test-daily-workflow.ts`
- `scripts/test-health-report.ts`

关键逻辑：

- 26 个来源中 1–6 个独立失败时标记 `degraded`；7 个及以上或零成功来源仍 fail-closed。
- Digest 只使用本周期已成功抓取的数据源构建内容。
- 仅选择不可用来源、或过滤后无可证明完整内容的订阅保持阻断。
- 数据库写入失败、delivery claim 异常、pending/failed 未决投递、suppression 快照异常和 Resend 不确定状态仍 fail-closed。
- 降级邮件显式提示不可用来源；Health 区分 `healthy`、`degraded` 和 `failed`。

### 测试结果

- TypeScript typecheck：PASS
- ESLint：PASS（0 error，5 个既有 warning）
- Next.js production build：PASS
- 主测试套件：PASS
- Launcher reliability：17 tests PASS
- Service isolation：PASS
- Web proxy integration：PASS
- PostgreSQL 17 隔离集成：18 groups PASS
- Daily workflow：17 groups PASS，`realSendRequests=0`
- Crawler reliability：16 tests PASS
- F01/F03 投递安全：12 groups PASS，`realSendRequests=0`

覆盖了全部来源正常、单源失败、多源低于阈值失败、系统性失败、数据库写入失败、Resend 拒绝/超时、suppression 不确定、部分发送中断和重复周期执行。

## 5. Git Synchronization

| Environment | Commit SHA / Release | Working Tree | Status |
|---|---|---|---|
| Local Mac | `e066099` 加本报告提交 | clean | 与 GitHub `main` 同步；旧工作保存在 `pre-sync-2026-10-25-local-wip` stash |
| GitHub main | `e066099` 加本报告提交 | N/A | 修复已存在；Vercel commit status success；无 open PR |
| ECS Repository | `e066099` 加本报告提交 | clean | `/root/HITNotice` 已 fast-forward；旧工作保存在 `pre-sync-2026-10-25-ecs-wip` stash |
| Production Web | `f714f3c40ee9370ab42eacc7fb497b2f251dc407` | immutable | Web 未受本次 Tasks 修复影响，运行正常 |
| Production API | `5f10504bbe41964d5e48551ee961cc14d4fdf0da` | immutable | API 未受本次 Tasks 修复影响，签名健康检查正常 |
| Production Tasks | `e06609935ccb89703afdd03513909c6c83836014` | immutable，manifest 313/313 匹配 | 已包含最终运行逻辑修复 |

Web/API/Tasks 保留不同 release SHA 是既有组件化不可变部署策略；本次只修改 Tasks 运行路径，不需要重部署 Web/API。本报告提交不改变运行代码，因此 Tasks 保持 `e066099`。

## 6. Production Status

- Web：`https://hitnotice.cn` 返回 HTTP 200，TLS 校验正常。
- API：systemd active；签名 `/internal/health` 检查返回 200、数据库 `available`；未签名请求正确返回 401。
- Tasks：`daily-current` 指向 `e066099`，source manifest 313 个文件全部匹配。
- Cron：active，四条生产任务保持 19:45/19:50 crawler、20:00 digest、20:10 health。
- PostgreSQL 17：active，生产只读查询和 Tasks 三身份 preflight 均通过。
- Crawler：10 月 22、23 日单源失败被准确保留，其余来源继续处理。
- Digest：10 月 22 提交 47 封；10 月 23 提交 57 封 weekday + 7 封 weekly；均 `failed=0`。
- Resend：suppression API HTTP 200，2 个条目与 root 管理的本地 SHA-256 快照完全一致。
- Health：10 月 22、23 日均发送 `degraded` 报告且 provider 最终事件为 `delivered`；与 `today` 仍不可达的实际状态一致。
- Workflow：enabled，无 `PAUSED`，近期无新增 pending/failed delivery。

10 月 25 日为周日，Digest/Crawler 不在调度日；当天 Health dry-run 因 24 小时无 crawler 运行显示 overall `failed`，同时明确标记两个 Digest 为 `not_scheduled`。这不代表周末发生任务失败，但说明非调度日手工 Health 预览的总体措辞仍偏保守。

## 7. Historical Digest

窗口：2026-10-20 12:00:00Z 至 2026-10-21 12:00:00Z，对应北京时间 2026-10-21 20:00。

- 活跃 weekday 订阅：69
- 应提交邮件：45
- 原任务已提交：0
- 精确恢复新增提交：45
- 数据库 provider ID：45/45
- Resend 最终 `delivered`：45/45
- 正常无内容跳过：3
- 因 `today` 数据不可用而安全阻断：19
- suppression/永久投递保护阻断：2
- 未解决或状态不确定：0

数据库中 45 条记录仍为 `accepted`，而 Resend provider 查询已确认全部 45 条最终 `delivered`。报告明确保留两层状态，不把 HTTP 200 或 provider ID 本身等同于 delivered。

## 8. Remaining Issues

### 中等：今日哈工大外部可达性仍未恢复

影响：该来源持续缺失，相关订阅会被部分降级或阻断；其他来源和 Digest 已隔离。需要站点或网络路径恢复后重新核验 HTML 结构和解析器。

### 低：数据库未反映 Resend 最终 delivered 事件

45 条历史恢复记录数据库状态仍是 `accepted`，最终 `delivered` 由 provider 审计确认。当前 Health 明确显示 `webhookTracking=false`，不会伪造最终投递状态；后续如需要本地最终状态，应单独恢复经过签名验证的 webhook/对账流程。

### 低：周末手工 Health dry-run 总体状态偏保守

非调度日无 crawler 时 overall 为 `failed`，但 Digest 明确为 `not_scheduled`。实际工作日 20:10 Health 报告能正确显示 `degraded`。

### 低：依赖审计

安装阶段曾报告 15 个依赖漏洞（1 moderate、13 high、1 critical）。本次未使用自动 `npm audit fix`，避免扩大与事故无关的生产变更；应另开依赖升级任务评估。

## 9. Final Verification

- 本地和 GitHub 是否同步：**是**，旧本地工作已封存 stash。
- GitHub 和 ECS 仓库是否同步：**是**，ECS checkout 已 fast-forward，旧 ECS 工作已封存 stash。
- 生产运行版本是否包含最终修复：**是**，Tasks 为 `e066099` 且 manifest 完整。
- 上次遗留工作是否全部完成：**代码、部署、邮件恢复和验收已完成；外部 `today` 可达性仍由外部条件阻断。**
- 后续定时任务是否可正常执行：**是**；10 月 22、23 日真实生产记录已证明降级路径正常。
- 是否存在重复邮件风险：**未发现**；10 月 21 日 45 个收件人均有唯一 idempotency key，后续周期也无 pending/failed。
- 是否存在数据丢失风险：**其他 25 个来源未丢失；`today` 在不可达期间的数据无法抓取，恢复后需依靠其列表页可见历史进行补采。**
