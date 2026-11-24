# 170 - 语义持久化与发布适配设计（K1b 准备）

日期：2026-11-24。状态：**设计准备，未落 DDL、未接生产读取**。
上游：[160 持续知识架构](160-continuous-knowledge-architecture.md)；
当前门槛：[K0b 真实资料评测](../70-workplan/110-public-evaluation-20261124.md)。
本文细化下一批实现，不改变 K0b 人工复核、独立业务材料及迁移评审门槛。

## 1. 既有表与新投影的映射

| 内部图谱契约 | 既有事实源 | 适配要求 |
| --- | --- | --- |
| GraphEntity | entity.id/kb_id/kind/name | 固定本体版本的类型映射，不把任意旧 kind 自动当本体类型；同名跨库不合并 |
| GraphAssertion | assertion.content_state/verification_state/superseded_by/valid_until | verificationExpiresAt 单独读取 expires_at；不能等后台把 verified 改成 stale 才阻断过期知识 |
| validFrom | 暂无同义既有列 | as_of 是来源的观察时点，不能直接映射为业务生效时间；无明确有效期时传 null，后续按 DDL 设计增量扩展 |
| GraphEvidence | evidence → span → document | 限 stance=supports；库归属逐跳一致；documentVersion 使用 span.document_version 并与现行 document.active_chunk_version 核对 |
| SourceVersion | document 的活动版本、内容状态及 canonical text | current 由权威活动版本判定；撤回/删除不能用历史发布副本覆盖；textLength 必须来自相同版本的规范原文，不能用摘录或 chunk 长度代替 |
| SemanticRelation | 现有 assertion_mention 只有 mentions/role，尚无完整业务关系 | 新关系表独立保存 source/target/type/schemaRef；不能把同一断言提到两个实体就推断业务边 |
| AuthorizedReadScope | 现有已认证调用身份、关联与可见集、当前租户/角色状态 | 只接受服务端求值；请求中的 kb_ids 只能收窄；权限失效路径须接权威版本，不能仅依赖 300s 缓存 |
| 发布版本 | 当前没有语义发布头 | 本体固定版本、输入快照、人工裁决与候选需形成一致发布边界 |

## 2. 拟增量表和约束

以下为 K1b 的评审对象，不是已执行迁移；最终字段及表数以 210/DDL/Prisma 锁步变更为准。

1. **semantic_schema_version**：不可变版本化定义，namespace/schema_id/version 唯一，definition_hash 与 JSONB 定义绑定。公共定义与租户定义的作用域分别登记，不从一个租户读取另一个租户定义。
2. **semantic_compile_run**：kb_id、schema_version_id、config_fingerprint、input_manifest_hash、来源版本清单、状态与错误；唯一任务键含库、输入和语义配置。断言抽取与向量任务分离，人工裁决 ID 不由重编译重建。
3. **semantic_release**：不可变编译发布记录，含库、本体、run、输入 hash、创建者和创建时点；只引用已校验的候选，不在发布后原地改写内容。
4. **semantic_release_head**：每库当前 release_id 与单调 generation；通过 compare-and-set 切换，失败重试重新读取当前头，不能后到的旧任务覆盖新发布。
5. **semantic_relation**：稳定业务边 ID、库、release、schema、类型、两端 Entity；复合外键或事务校验禁止跨库引用；关系的实例归 Karda。
6. **semantic_relation_assertion**：业务边与支持断言的关联；复合唯一键防重复，所有断言同库且在线读取时重新求有效证据集合；不复制一份脱离原文状态的「永久可信证据」。
7. **semantic_event_receipt**：同一来源事件 ID + 内容指纹 + 处理版本/结果，保证重试幂等；同 ID 异内容拒绝，过期事件留审计但不能推进 head。复用现有事件设施须先核对事件域和授权，不复用平台凭据或事件权威。

依赖影响初期从 relation_assertion → evidence → span 的索引联查得到；如量测证明需物化，加派生依赖索引并明确重建和失效，不将它升级成来源真值。
锚点 id/*_id/created_at 不可改写；新表/列的服务角色授权随增量、列白名单同步 98；不改继承的迁移执行顺序。

## 3. 发布与读取事务

- 编译读取明确来源版本；候选生成期间可以并行，发布前重新核对来源活动版本、本体版本及人工裁决。发生变化即终止此次发布/重排，不覆盖人审结果。
- 一个发布事务写入 release、关系及关联，再按 generation CAS 切 head；任一步失败回滚。不向消费者暴露半份发布。
- 撤回/删除进入权威来源状态；图谱读取在同一数据库一致性快照内校验来源、断言及授权，再遍历业务边。后台索引未更新时也拒绝失效内容。
- 下一次受保护读取必须使用授权撤销后的版本。并发语义以权威状态的读取快照为线性化点，不能用「请求开始时就授权」掩盖长期缓存。
- 确定性推导的前提与规则版本失效必须传到推导边；第一版只发布 asserted，inferred 的证明适配另做独立验收。
- adapter 未准备好或找不到同版本 canonical text 时返回不可用/部分结果说明，不降级成允许全部，也不拿当前原文解释旧偏移。
- 本体或源材料中的指令不影响执行权限；编译模型仅产候选，不能直接调用发布、角色或外部工具。

## 4. 必须跑在隔离数据库的测试

冻结 K0b 资料与迁移评审后，增量脚本需在新库及模拟旧 41 表库各执行两次。
同时验证：同事件重投/异内容、旧事件晚到、并发 CAS、发布中途崩溃、人工裁决与编译竞争、
撤回后立即读取、角色撤销后下一次读取、多实例读头、降级和完整重建。
以上由真实 PostgreSQL 事务验证，内存替身测试不能代替。
生产 DDL 应用、客户数据迁移和正式角色变更仍不在本准备批范围。
