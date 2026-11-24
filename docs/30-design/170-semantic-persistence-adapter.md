# 170 - 语义持久化与发布适配设计（K1b 准备）

日期：2026-11-24。状态：**设计准备及隔离发布协议实现，未落生产 DDL、未接生产读取**。
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

## 5. K1b-P1：隔离发布协议实现

`app/kb/semantic/publication.ts` 和 `publication-postgres.ts` 独立实现发布协议，
暂只接受固定前缀的随机测试 schema，不提供环境工厂、HTTP 接口或生产接线。
这一步不要求提前执行 K1b 迁移，也不替代 K0b 的人工复核和独立业务留出集。

- 受信任编译器生成命令，绑定库、事件、预期 generation、来源/人审/本体修订及候选载荷。
  规范 JSON 排序并 SHA256；拒绝非 JSON、访问器、循环、超深及超过 256 KiB 的命令。
  发起数据库等待前复制输入，调用者随后修改候选不能改变此次发布。
- 同库事务级 advisory lock 覆盖首次无 head 情况；读取 head 并比较 generation，
  最后仍用条件更新切头。同事件同指纹只回原回执，同 ID 异内容拒绝；旧任务不能覆盖新 head。
  重复事件的回执仅证明历史处理成功，不代表现行版本或当前读取权限。
- 来源、本体、人审与发布权限由构造时注入的权威读取器求值，必须在同一事务持有相应行锁至提交。
  测试读取器锁定一条隔离 revision 行；它不是产品来源、角色或 OBO 适配器。
- release、head 和 receipt 同事务写入；末步失败回滚全部。不同库分别保留事件命名空间。
  本阶段载荷只是协议快照，不代表通过实体/关系/证据校验；正式编译器必须先做语义校验，
  正式读取仍必须重新验证来源和授权，不能把发布快照当永久可信知识。

隔离测试在既有 CI 的 `karda_p3_test` 数据库内创建随机 schema，完成后只清理该 schema。
测试包含同事件并发、异内容重放、并发 CAS、迟到旧任务、三个修订变化、权限拒绝、
末步注入失败后的完整回滚、重建连接后的重试、不同库隔离及权威更新竞争。
权威竞争通过 PostgreSQL 的实际 Lock 等待状态确认，再提交变更并验证发布拒绝。
本地未配置隔离 PostgreSQL 时明确跳过数据库测试，不能把该跳过算作事务验证通过。

仍待 K1b 后续：生产 DDL/Prisma/210/98 锁步及不可变列授权、完整关系与证据持久化、
真实来源及 OBO 权威适配、同快照读取、失效传播和重建；新库/旧库双迁移演练仍按第 4 节执行。

## 6. K1b-P2：既有表只读适配（原生文本子集）

`read-postgres.ts` 将既有 entity/assertion/evidence/span/document 映射到安全投影，
使用服务角色连接、`REPEATABLE READ READ ONLY` 事务，不增加生产表或修改现有 API。
`readProductAccess` 增加可选事务连接；原调用默认行为不变，新适配在同一快照重用现有角色、
权限与 owner_anchor 校验，无角色、停用或缺少 product.enter/data.read 均拒绝。

范围刻意受限为**同工作空间的 user 所有库**：拥有者或 ws/org 已发布可见，
再与当前用户、工作空间和消费产品的 kb_attachment 相交；请求 kbIds 只能收窄。
尚不覆盖 tenant/platform 所有库、跨工作空间、预设库、Guest 专用读面。
查询先完成权限过滤，再读取实体、断言和原文；不复用旧 300 秒可见集缓存。

平台准入和已发布关系读取器是构造时必需的可信依赖，调用身份必须来自已验证会话/OBO。
目前测试注入准入结果与显式关系，**未接真实平台 OBO 或生产发布表**，也不能把任意候选当已发布知识。
外部准入必须每次权威求值；本地数据库快照不能对外部平台提供分布式原子性。
正式接线仍等待平台撤销契约、来源/关系发布持久化和 K0b 门槛，不能直接把缓存布尔值接入。

发布输入新增冻结的来源清单（库、文档、版本、原始字节 SHA256）。读取时逐项核对
span.document_version、document.active_chunk_version、现行 document.content_hash 及实际对象字节哈希。
仅支持现有原生文本解析路径，复用 `canonicalText/decodeSourceBytes` 的 UTF-16 半开偏移；
并核对 canonical.slice(start,end) 与保存 excerpt 完全相同。
textLength 来自整份同版本规范原文；不从 chunk/excerpt 推算，也不把 PDF 字节解码成文本。
as_of 仍不映射为 validFrom，expires_at 仍独立控制人审失效。

缺少原文、哈希/版本/摘录不符或格式不支持时排除该证据，结果 `sourceStatus=partial`；
该字段只描述已查询候选的原文解析情况，不代表整库知识完整率。
撤回/归档/处理中原文不参与读取，过期或失去最后支持的断言不会形成图谱边。
对象后端异常直接终止，不转成成功空图。候选实体/断言/证据行数各至多 5000，
单文件至多 8 MiB、一次读取累计 32 MiB/100 份，超出累计预算明确失败，避免默默截断证据。

数据库并发语义：本地角色查询建立一致性快照；此后提交的来源撤回或本地角色变更
不改写已开始的快照，但下一次读取必须立即观察到。原文通过冻结哈希绑定该快照；
对象已删除或改写时宁可缺失，不以新字节解释旧锚点。
隔离 PostgreSQL 测试使用现有 41 表及随机库/成员数据，并以 karda_svc 实际执行读取，
覆盖跨空间/私人库排除、取消挂载、来源撤回/版本变化、同版本换字节、摘录错误、
人审过期、类型映射缺失、本地角色撤销、平台拒绝注入、快照竞争与新实例一致性。
这验证产品表的局部适配，不是正式业务数据、真实 OBO、生产权限或 K1b 整批验收。
