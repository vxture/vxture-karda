# C3 持久计量与排空

Karda 只记录已发生的业务事实。counter 先存入 local_usage.raw，平台是最终计量权威，Atlas 推理 token 仍由既有 Atlas 归属链路处理；不在本仓伪造 AI credits 或把测试数据发往生产。

## 业务与 outbox

PrismaContentStore 的文档和条目创建与 karda.ingest=1 同事务写入，租户工作空间从库引用读取；用量插入失败则内容创建一起回滚。现有工具补发同一 karda.ingest:row-id key 与事务记录一致，重放不重复计量。原始事实字段不可 UPDATE；幂等 key 相同但 workspace/metric/amount 不同必须拒绝，不能悄悄吞掉冲突。数值仅接受正安全整数。

## 报告与回执

后台通过可信 provision_anchor 换取 workspace-bound Bearer，用 intent=report 上报已发生事实。HTTP 200 且 consumed/remaining_total 为合法数值，gated/event_id（存在时）类型合法，才确认本地记录。200 空 body、畸形 JSON、409、401/403/404/5xx 都保留。gated=true 的有效报告回执仍属已记录事实，确认后使 C2 缓存失效；409 不是此模式下可丢弃记录的依据。

回执之后本地确认失败向上传播；下次使用原 idempotency key 重放，由平台幂等恢复。flushed_at 与确认一起保存。每行失败保存 attempts/next_attempt_at/last_error，错误摘要不包含平台正文或凭据。

## worker 与运维恢复

Node 启动后 2 秒首次排空，每 30 秒处理最多 50 条；单进程避免重叠，跨实例靠平台同 key 幂等保护。失败从 30 秒起指数退避，上限 1 小时；每条最多自动 10 次，达到上限保留未确认事实并输出运维错误信号，不删除、不宣称已上报。坏记录有 next_attempt_at，不会在每轮反复占满最老批次。

人工恢复前先核对平台目录指标、产品归属、租户 anchor 和真实报错原因。只对已确认可重试的原始记录，经受控运维连接将 attempts 重置、next_attempt_at 设为当前时间；保留原 idempotency key、workspace、metric、amount，不新建同一事件来绕幂等。既有 /api/usage/flush 只触发排空，不接受浏览器自报用量。

部署前经 db-init 应用 0011_usage_retry；baseline、Prisma、增量与 UPDATE 白名单同步。生产缺 DB/平台配置拒绝内存替代。没有新增浏览器权限刷新、活动心跳或客户端定时查询。

本地隔离真实 PostgreSQL 测试以 karda_svc 创建内容并校验 outbox；临时撤销隔离测试库 INSERT 权限验证两者一起回滚。所有数据库操作限定 loopback karda_p3_test，测试结束恢复权限并删除自建数据。真实生产 C3 证据待 P9，不以模拟回执代替上线验收。

## Delivered query results

Agent search/grounded ask await durable business-usage storage before returning success. A storage failure maps to sanitized usage_unavailable/503 through the shared direct/MCP dispatcher. No-context asks remain unmetered; the first-party diagnostic console keeps its existing business-counter exemption while Atlas still records all model use. Each actual tool invocation is a per-call event; delivery retries reuse the stored key. Model/token charging remains exclusively Atlas-owned.
