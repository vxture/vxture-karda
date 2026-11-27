# Karda 领域数据模型（Domain Data Model）(210-data-model)

> 版本：v0.1
> 状态：Draft — 供评审后落 DDL
> 上游文档：100-kb-model（对象模型/元数据/状态机/索引化规则）、10-product-definition §4（P-T-U 与发布阶梯）、
> 110-processing（加工态）、120-retrieval-tools（召回过滤维度）
> 定位：把 100-kb-model 的对象模型落为可执行的表结构；是 `deploy/database/ddl/00_baseline.sql` 中
> karda 领域段的权威依据
> 编号带：2xx = 对外契约与细化（schema），见 `docs/00-meta/10-docs-convention.md` §3

---

## 1. 边界与约束

**本文只管 karda 自有领域数据。**三个契约 schema（`vx_provision` / `local_authz` / `local_usage`）是工厂
基线，本文不触碰、不镜像、不扩展。

必须遵守的既有铁律（治理规范 §7 + `data_platform_100` §3.2）：

- **DDL 是唯一结构权威**，手写；Prisma 只是 client 生成源，须与 DDL lockstep（`lint:data-design` 硬门）；
- 命名：uuid 主键 `gen_random_uuid()`；`TIMESTAMPTZ` 的 `created_at`/`updated_at`；
  状态列 `VARCHAR(32)` + `CHECK`（**绝不用 PG ENUM**）；索引/约束前缀 `idx_`/`uidx_`/`fk_`/`chk_`；
- **锚点列不可变**：`id`、各 `*_id` 引用键、`created_at` 永不进可写白名单；
- 新增可写列**必须**同步 `98_column_locks.sql`，否则服务角色写入 `permission denied`；
- 平台标识（`workspace_id` / `sub`）只作为 **[ref] 引用键**存放，由平台签发，**不在此处建权威**。

**schema 名：`karda_kb`。**契约 schema 名是保留字，领域 schema 由产品自定（`product_240` §2.9 blank
zone）。取 `karda_kb` 而非裸 `kb`，是为将来若长出第二个领域段（如治理域 `karda_gov`）时前缀一致、
不与其它产品在同库共存时撞名。

## 2. 表清单（10 张）

| 表 | 承载 100-kb-model 的 | 说明 |
|---|---|---|
| `knowledge_base` | §2.1 库对象 + §7 配置面 | 唯一库类型；权限/发布/关联的单一锚点 |
| `folder` | §3 层级 | 可选、**单层**、零权限语义 |
| `processing_template` | §2.3 加工模板 | v1 六个预置，org 只调参不自建 |
| `content_template` | §2.3 内容模板 | 平台预置 + org 自定义（无 user 级） |
| `content_template_field` | §2.3 字段声明 | 字段名/值类型/必填/**检索角色**/Ontos 映射 |
| `kb_metadata_field` | §4.3 业务段 | 库级自定义字段声明 + **filterable 白名单** |
| `document` | §2.2 文件型内容 | 上传 / Arda 同步 / API 写入 |
| `entry` | §2.2 条目型内容 | 遵循 ContentTemplate，字段级可编辑 |
| `chunk` | §2.1 / §6 | Document 的派生召回单元 |
| `binding` | 220-connector-framework §3 | 库 ←订阅→ 外部源；连接器无关 |

### 2.1 `binding`（外接源订阅）

`id` / `kb_id` FK ON DELETE CASCADE / `connector_code` VARCHAR(64) / `external_source_id` VARCHAR(255) /
`mode` CHECK `backfill / incremental` / `state` CHECK `active / paused / revoked` /
`cursor` VARCHAR(512) / `last_synced_at` / `created_by` **[ref]** / `created_at` / `updated_at`。
UNIQUE (`kb_id`, `connector_code`, `external_source_id`)；`idx_binding_state` (`state`, `connector_code`)。

**形状里没有任何连接器特有的东西**——Arda 只是 `connector_code` 的一个取值。可写列仅
`mode`/`state`/`cursor`/`last_synced_at`/`updated_at`；`kb_id`/`connector_code`/`external_source_id`/
`created_by` 是订阅的身份与 OBO 出处，改动它们等于把一个既有同步悄悄指向另一个源或另一个属主，
而不是新建一个订阅。

**不建表的东西**（有意）：向量与全文索引不落 Postgres（索引存储另属，本表只留 `vector_ref` 指针）；
GraphInstance 为 v2 预留，v1 不建表；关联清单（用户 × 产品）属消费侧配置，随工具面设计另定
（`120-retrieval-tools` §5 已澄清它存 karda 但不参与安全判定）。

## 3. 表定义

### 3.1 `knowledge_base`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | UUID PK | |
| `workspace_id` | UUID NOT NULL | **[ref]** 治理锚定 WS：U 级 = home_ws，T 级 = 建设 WS |
| `owner_type` | VARCHAR(16) NOT NULL | CHECK `platform / tenant / user / product` |
| `owner_sub` | VARCHAR(128) | **[ref]** 仅 U 级非空（"库跟人走"的属主）；其余为 NULL |
| `name` / `description` | VARCHAR(255) / TEXT | |
| `publish_state` | VARCHAR(32) NOT NULL DEFAULT `private` | CHECK `private / ws_published / org_published` |
| `origin_kb_id` | UUID | P 级实例化落 T 级时的来源库（`origin_ref` 血缘） |
| `origin_snapshot_at` | TIMESTAMPTZ | 快照时点；断更语义靠它与来源库比对 |
| `processing_template_id` | UUID FK | 库级默认加工模板 |
| `processing_params` | JSONB NOT NULL DEFAULT `'{}'` | org 调参（分块长度/重叠/分隔符） |
| `embedding_model` | VARCHAR(128) | **库级锁定**的 Atlas 模型版本；变更 = 受控重建 |
| `fulltext_enabled` | BOOLEAN NOT NULL DEFAULT true | |
| `graph_enabled` | BOOLEAN NOT NULL DEFAULT false | v2 |
| `retrieval_defaults` | JSONB NOT NULL DEFAULT `'{}'` | top_k / 混合权重 / rerank / `verification_filter` 默认档 |
| `governance_enabled` | BOOLEAN NOT NULL DEFAULT false | §5.2 治理默认关 |
| `default_verifier` | VARCHAR(128) | |
| `default_verify_interval_days` | INTEGER | |
| `exempt_synced_content` | BOOLEAN NOT NULL DEFAULT true | Arda 同步内容默认豁免验证 |
| `deleted_at` | TIMESTAMPTZ | 软删；索引级联清除后血缘保留至审计期 |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

约束：`uidx_knowledge_base_ws_name` UNIQUE (`workspace_id`, `name`) WHERE `deleted_at IS NULL`；
`idx_knowledge_base_owner` (`owner_type`, `owner_sub`)。

**为什么 `publish_state` 存在库上而不在内容上**：100-kb-model §3 明定权限/发布/关联全部**只作用于库级**，
Folder 零权限语义。把发布态放到内容行会立刻制造出第二个授权面，与该设计直接冲突。

### 3.2 `folder`

`id` / `kb_id` FK / `name` / `created_at` / `updated_at`。
**无 `parent_id`**——单层是设计（§3：不支持嵌套，深组织需求引导拆库）。缺这一列即是约束本身，
比加一列再用 CHECK 限制深度更难被误用。

### 3.3 `processing_template`

`id` / `template_code` UNIQUE（`general`/`qa`/`table`/`manual`/`paper`/`legal`）/ `name` /
`version` INTEGER / `default_params` JSONB / `is_preset` BOOLEAN NOT NULL DEFAULT true / `created_at`。

v1 全部行都是平台预置（seed 供给），`is_preset` 是为 v2 开放 org 自建时不改表结构留的位。

### 3.4 `content_template` / `content_template_field`

`content_template`：`id` / `template_code` / `name` / `version` INTEGER NOT NULL DEFAULT 1 /
`scope` VARCHAR(16) CHECK `platform / org` / `workspace_id` UUID（org 级非空、platform 级为 NULL）/
`created_at` / `updated_at`。UNIQUE (`scope`, `workspace_id`, `template_code`, `version`)。

`content_template_field`：`id` / `template_id` FK ON DELETE CASCADE / `field_name` /
`value_type` CHECK `string / number / datetime / enum / richtext` / `enum_values` JSONB /
`required` BOOLEAN / **`retrieval_role`** CHECK `search_text / filterable / store_only` /
`ontos_type` VARCHAR(128)（v1 **存不消费**）/ `position` INTEGER / `created_at`。

**模板演进按 §2.3 纪律**：加字段向后兼容（同 `version`）；删/改字段**升 `version` 建新行**，存量条目
仍指向旧版本行、惰性迁移。这就是 `entry.template_version` 必须存在的原因——没有它，升版会静默改变
存量条目的解释方式。

### 3.5 `kb_metadata_field`（业务段声明）

`id` / `kb_id` FK ON DELETE CASCADE / `field_name`（小写下划线）/
`value_type` CHECK `string / number / datetime / enum` / `enum_values` JSONB /
`filterable` BOOLEAN NOT NULL DEFAULT false / `created_at`。
UNIQUE (`kb_id`, `field_name`)。

**filterable 上限（每库 16，含系统常用维度）在应用层强制，不在 DDL。**理由：库级计数约束在 SQL 里
只能靠触发器实现，而触发器是 DDL 权威之外的第二处业务逻辑，且这个上限是**产品策略**（100-kb-model
§11 待拍板 #2 明记可复议），策略值放进 DDL 会让每次调整都变成一次生产结构变更。约束点记在
`210` 与应用层校验两处，超限返回明确错误而非静默截断。

### 3.6 `document`

系统段：`id` / `kb_id` FK / `folder_id` FK NULL / `title` / `mime` / `size_bytes` BIGINT /
`source` CHECK **`upload / api / connector`** / `connector_code` VARCHAR(64)（`source=connector` 时必填）/
`source_ref` JSONB（`source_doc_id`/`uri`/`external_version`）/ **`storage_ref` VARCHAR(512)** /
`content_hash` VARCHAR(80) / `processing_template_id` UUID NULL（**文档级覆盖**）/
`created_in_product` VARCHAR(32) / `created_by` VARCHAR(128) **[ref]** / `created_at` / `updated_at`。

**`source` 是连接器无关的"摄取种类"，不是连接器名**（2026-07-23 方向调整）。原枚举写死
`arda_sync`，等于把一个连接器焊进 CHECK 约束——而产品方向是陆续开放外接知识库/文档库，
那样每接一个源都要动一次生产结构。现在连接器身份落在 `connector_code`（**数据，不是结构**），
新增连接器不需要 DDL 变更。`chk_document_connector_code` 保证两者一致：`connector` 必带 code，
`upload`/`api` 必不带。

**`storage_ref` 指向 karda 自有对象存储中的原始件**。110-processing §1 的"阶段产物留存"要求原始件
持久化（重分块不重解析、重索引不重下载）；更要紧的是**自闭环**：karda 持有自己的副本，不依赖
某个连接器持续可达才能服务或重建自己的内容。

内容主状态：`content_state` CHECK **`processing / indexed / failed / archived / deleted`**
（**无 `draft`**——文件到达即进 processing，§5.1）+ `failure_reason` TEXT + `failed_at` TIMESTAMPTZ。

治理段：`verification_state` CHECK `unverified / verified / stale` DEFAULT `unverified` /
`verifier` / `verified_at` / `expires_at` / `sensitivity` VARCHAR(32)。

业务段：`business_meta` JSONB NOT NULL DEFAULT `'{}'`。

约束：UNIQUE (`kb_id`, `source`, `coalesce(connector_code,'')`, `content_hash`)
WHERE `content_state <> 'deleted'`——同库同源同内容去重，正是 110-processing §7 的 hash 幂等落到
存储层。**`connector_code` 必须 `coalesce`**：SQL 的 `NULL <> NULL` 会让每一次上传都与其它上传
互不冲突，恰好在最需要去重的摄取路径上静默失效。
`idx_document_kb_state` (`kb_id`, `content_state`)；
`idx_document_source_doc_id` (`connector_code`, `source_ref->>'source_doc_id'`) WHERE `source='connector'`
——任何连接器的墓碑删除都按它定位。

### 3.7 `entry`

与 `document` 共享治理段与业务段列；差异：

- `content_state` CHECK **`draft / processing / indexed / failed / archived / deleted`**（**有 `draft`**，
  编辑中不入索引）；
- `content_template_id` FK + `template_version` INTEGER（见 §3.4 的理由）；
- `fields` JSONB NOT NULL —— 条目字段值；filterable 字段在索引化时按模板的 `retrieval_role` 抽取；
- 无 `mime` / `size_bytes` / `content_hash` / `source_ref`（条目即真值，无外部源）。

### 3.8 `chunk`

`id` / `document_id` FK ON DELETE CASCADE / **`version` INTEGER NOT NULL** / `ordinal` INTEGER NOT NULL /
`text` TEXT NOT NULL / `token_count` INTEGER / `vector_ref` VARCHAR(128) / `created_at`。
UNIQUE (`document_id`, **`version`**, `ordinal`)。

**只有 Document 有 chunk**：Entry 整条即召回单元（§6），不分块。
`vector_ref` 是向量库中的指针，**向量本身不落 Postgres**——索引存储的选型属批次 6，本表只留接口。

**原子替换的版本机制（110-processing §6，2026-07-24 补）**：commit 是**文档级原子替换**——
新 chunk 集合以**新 `version`** 整体写入，与旧版本瞬时并存（这正是唯一键含 `version` 的原因，
否则同 `ordinal` 撞键）；写完后把 `document.active_chunk_version` 原子切到新版本，检索**只读活跃
版本**、永不见半更新态；旧版本的 chunk 异步清理。`document.active_chunk_version` 为 NULL 表示
该文档尚未成功提交过任何索引（新上传、加工中、或加工失败）——检索据此天然排除未就绪文档，无需
额外的 `content_state` 判断在召回热路径上。

## 4. 与列锁的关系（可写列白名单）

按治理规范 §7，逐表列出**可写列**；其余一律 REVOKE。锚点列（`id`、各 `*_id`、`created_at`）永不可写。

| 表 | 可写列 | 不可写的理由 |
|---|---|---|
| `knowledge_base` | 除 `id`/`workspace_id`/`owner_type`/`owner_sub`/`origin_*`/`created_at` 外的配置与状态列 | 归属与血缘一经建立即不可篡改 |
| `folder` | `name`, `updated_at` | |
| `document` | `title`, `folder_id`, `content_state`, `failure_reason`, `failed_at`, `verification_state`, `verifier`, `verified_at`, `expires_at`, `sensitivity`, `business_meta`, `processing_template_id`, `updated_at` | `kb_id`/`source`/`source_ref`/`content_hash` 是血缘与去重依据，改了即失去溯源 |
| `entry` | 同上治理/业务列 + `fields`, `content_template_id`, `template_version` | |
| `chunk` | **无**（派生数据，重建而非修改） | 分块是加工产物；内容变了走重建路径 |
| `processing_template` / `content_template` / `content_template_field` / `kb_metadata_field` | **无**（seed / 声明式，经 db-init 或管理面变更） | 运行时不改模板定义；改定义走升版本建新行 |

`chunk` 无可写列这一条是有意的：它把"chunk 可被就地改写"这条路从权限层堵死，强制内容变更必须
走 110-processing 的原子替换与受控重建路径，而不是让某处代码顺手改一行文本造成索引与源文不一致。

## 5. 本文做出的判断（供评审推翻）

1. **schema 名 `karda_kb`** —— 见 §1。
2. **filterable 上限走应用层** —— 见 §3.5。
3. **`chunk` 零可写列** —— 见 §4。
4. **`folder` 不设 `parent_id`** —— 见 §3.2。
5. **配置面用 JSONB（`processing_params` / `retrieval_defaults`）而非逐项建列** —— 这两组是开放参数包，
   逐项建列会让每次加一个调优旋钮都变成生产结构变更；而它们不参与查询过滤，无需列级可索引性。
   反之 `governance_enabled` / `embedding_model` 等**建了独立列**，因为它们参与检索期判定与重建判定。

## 6. 待拍板项对本文的影响

`100-kb-model` §11 四项中，**只有 #2（filterable 上限 = 16）触及本文**，且按 §3.5 落在应用层，
故 DDL 不因它变化。其余三项（Entry 编辑权、预置 ContentTemplate 清单、archived 保留策略）分别属
行为、seed 数据与计费策略，均不改表结构。

## 7. 联动登记

- `deploy/database/ddl/00_baseline.sql`：karda 领域段按本文落地（新表进 baseline，因本仓 `db-init apply`
  每次幂等重跑 baseline，活库即可采纳；`incr/` 留给对**既有表**的列增量）；
- `deploy/database/ddl/97_service_role.sql`：需为 `karda_kb` 显式 GRANT（契约 schema 的 GRANT 不覆盖领域 schema）；
- `deploy/database/ddl/98_column_locks.sql`：按 §4 落白名单；
- `portals/app/prisma/schema.prisma`：须与 baseline lockstep，否则 `lint:data-design` 拦合并。


## 8. November22 stored_object ledger (P8.3c)

Additive increment0013 and matching baseline/Prisma add karda_kb.stored_object.
Immutable identity: id, workspace_id, kb_id, content_hash, object_key, size_bytes,
created_at. Mutable whitelist: state, retain_until, attempts, retry_at, updated_at.
Service role cannot DELETE ledger rows or rewrite identity/byte amounts. No FK
cascade deletes the ledger when a library is purged; retained bytes remain
accounted until physical deletion is confirmed. State is pending/ready/deleting/
deleted. object_key is unique; indexes cover workspace/state and retry/grace time.

The row is created before raw storage PUT, and size_bytes uses Buffer length.
Reservation IDs enter a generation-specific physical namespace, so a deleted
key is never reused by a later upload generation. Metadata commits verify the
ready ledger row, exact library/workspace/size and take the same storage lock as
cleanup. Full state/recovery contract is 300-capacity-enforcement. Only reviewed
db-init applies this structure; startup never creates/migrates tables. Production
needs0013 before candidate application rollout. Local declared table count is38.


## 9. November22 storage watermark outbox (P8.3d)

Increment0014, baseline and Prisma add karda_kb.storage_watermark (39 tables).
Immutable workspace_id anchors one latest absolute Karda snapshot. Mutable
whitelist is value/observed_at/pending/attempts/retry_at. Value is nonnegative;
observations use database time and at least the previous durable observation
plus1ms under the storage lock. Service DELETE/anchor rewrite are denied.
Reservations and confirmed physical deletions queue snapshots in the same
transaction. Failed reports retain pending work across process restarts.
Acknowledgement binds exact workspace/product/metric/value/observation. Gauge
never enters local_usage.raw counter consumption. Reviewed db-init only.

## 10. 语义编译与发布底座（0016）

按 owner「先完备功能、效果后续优化」调整，实施 K1b-P4 数据层及隔离迁移；不等待 K0b 金标，不视为业务质量通过。
设计详见 [170 §8](170-semantic-persistence-adapter.md#8-k1b-p4正式数据层与隔离迁移)。51 表声明包含 10 张语义表：

| 表 | 责任 / 唯一约束 |
| --- | --- |
| semantic_schema_version | kb/namespace/schema_id/version 唯一，冻结定义与哈希 |
| semantic_review | kb/subject_key/revision 唯一，追加人审与修订，不随编译重建 |
| semantic_compile_run | kb/task_key 唯一，冻结输入、配置、候选与结束状态 |
| semantic_release | kb/generation 唯一，固定编译及本体版本、指纹和完整载荷 |
| semantic_release_head | kb 主键，指向同库/同代次发布，事务 CAS 切换 |
| semantic_relation | kb/release/relation 主键，显式 asserted 关系与同库端点 |
| semantic_relation_assertion | 关系的同库支持断言，复合主键防重 |
| semantic_release_source | 同库文档、物理版本与字节哈希清单，文档影响索引 |
| semantic_release_review | 发布实际引用的同库裁决 ID，不复制或改写人审 |
| semantic_event_receipt | kb/event 主键，绑定指纹、发布与代次，支持幂等回放 |

全部 id/kb_id/created_at 和历史内容不可 UPDATE/DELETE；只有 head 的 generation/release_id/updated_at 可更新。
0016、baseline、Prisma 和 98 同步；新旧库重复应用在隔离测试执行。SQL 是 FK、CHECK、默认值及授权权威，Prisma 只生成客户端。
既有 entity/assertion/document 增加同库唯一索引用于复合外键；不修改原有行或枚举，不迁移客户内容。
FK 无级联删除，来源撤回沿用状态变化，永久清理需后续审计保留方案；旧应用仍能读取原表，结构回退保留新增表。

## 11. 关系编译任务（0017）

新增 semantic_compile_task，总表数52。保存用户创建的任务ID、同库作用域、创建者、不可变输入快照及哈希，
以及 queued/running/completed/needs_review/failed/suspended 状态、最多3次尝试、5分钟执行租约、候选run和诊断。
kb_id/run_id 复合外键保证完成结果同库；补充 semantic_compile_run(kb_id,id) 唯一索引。
运行时只可更新状态、尝试、租约、结果及更新时间，不能修改身份、输入或删除任务。
候选入库与任务completed同事务完成，旧租约不能提交；失败或冲突诊断不推进发布head。
baseline/0017/Prisma/98锁步，生产结构仍须db-init，不在应用请求中自动建表。

## 12. 固定版本的规范化来源（0018）

新增 `document_text_snapshot`，声明总表数53。以 document_id/document_version 为主键，记录原始 content_hash、mime、parser_version、canonical_text、text_hash、UTF-16 半开区间 locators 和 created_at。
服务角色只可 SELECT/INSERT，不可 UPDATE/DELETE；文档物理删除可由 FK 级联清理。分块提交在锁定文档并核验当前原始哈希后，与规范化快照及 active_chunk_version 同事务提交。
PDF 文本层固定 pypdf6.21.4-v1，DOCX 为有限的正文段落合同；拒绝扫描件、加密 PDF、复杂 DOCX 而不假装已解析。读取端必须再次核验同版本快照、原始字节哈希及文本哈希，不实时重跑解析器。
baseline/0018/Prisma/98 锁步；生产通过 db-init 增量执行，容器不自动迁移。

## 13. 不可变主题知识草稿（0019）

新增topic_dossier，声明54表。id为请求幂等键，kb_id限定同库，relation_type/input_hash唯一，payload/hash冻结当时汇编，created_by/created_at留存创建身份。
服务角色只可SELECT/INSERT，不可UPDATE/DELETE；当前版本由正式知识包重算指纹判定，不原地改历史，不自动发布或加入检索。
读取失效草稿仅返回身份/状态，旧payload不回显；来源、裁决及权限继续由同一权威快照核验。
baseline/0019/Prisma/98同步，正式DDL只走db-init；无客户内容/权限迁移。

## 14. 带引用模型主题摘要（0020）

新增topic_summary，声明55表。kb_id/dossier_id复合FK绑定同库不可变主题草稿，冻结输入hash、输出payload/hash、模型selector、创建者与时间；服务仅SELECT/INSERT，不可改写/删除。
审核沿用追加式semantic_review，subject_key为topic-summary/摘要ID，subject_hash绑定摘要payload_hash，revision作CAS，独立于关系裁决，不影响正式release。
摘要正文只在当前主题证据hash匹配时显示，旧来源或裁决失效后正文/审核理由隐藏；认可仅为该草稿的人工裁决，不自动发布或提升为事实。
baseline/0020/Prisma/98锁步，新旧库重复演练；生产通过db-init审核迁移。

2026-11-25 0021仅扩展document_text_snapshot的格式/解析器CHECK，允许docx-body-tables-v2并保留PDF/v1；baseline同名约束同步，55表及Prisma字段不变。见170§31。

2026-11-25 0022为document_text_snapshot增加XLSX/xlsx-literal-cells-v1格式CHECK，baseline同步；0021避免全增量重放时收窄已升级约束。没有字段/Prisma模型/权限变更，保持55表，见170§33。

2026-11-25 0023为document_text_snapshot增加PPTX/pptx-slide-text-v1格式CHECK；baseline同步，0022加保护避免全重放收窄新约束。模型字段/权限不变、55表，见170§37。

2026-11-25 0024扩展document_text_snapshot格式CHECK允许docx-referenced-stories-v3，保留旧DOCX v1/v2、PDF、XLSX和PPTX；0023增加向后重放保护，已有v3行全套重复迁移不收窄约束。无字段/Prisma/权限变更、55表，见170§43。

2026-11-26 0025扩展document_text_snapshot格式CHECK允许docx-cell-grid-v4，保留旧版本；0024增加前向保护避免重放收窄。仅约束扩展，无字段、Prisma模型或98权限变更，保持55表。见170§46。

2026-11-26 0026扩展document_text_snapshot解析器CHECK允许xlsx-cell-ranges-v2并保留v1和其他格式；0025增加向前重放保护。无字段/Prisma/98权限变化，55表保持，见170§47。

2026-11-26 0027扩展document_text_snapshot解析器CHECK允许pptx-cell-grid-v2、保留v1及其他格式；0026加向前重放保护。无字段/Prisma/98权限变化，55表保持，见170§48。

2026-11-26 0028扩展document_text_snapshot解析器CHECK允许pptx-authored-stories-v3并保留v1/v2及其他格式；0027加前向重放保护。无字段/Prisma/98权限变化，55表保持，见170§49。


2026-11-26 0029新增knowledge_rollout_event，共56表。workspace_id/revision复合主键及workspace_id/event_id唯一键，enabled、必填reason、changed_by、created_at保留追加式控制记录；服务只SELECT/INSERT，不可UPDATE/DELETE。按工作空间事务锁及CAS追加，缺省沿用现有启用基线；主体和空间由认证生成，见170§55。baseline/Prisma/98与增量锁步。


2026-11-26 0030扩展document_text_snapshot格式CHECK接受docx-numbered-stories-v5并保留DOCX v1–v4和其他格式；0028加前向保护避免完整重放收窄v5。无字段/Prisma/98权限变化，56表保持；新旧库重复应用保留编号快照，见170§59。


2026-11-26 0031新增document_ocr_draft（57表）：id、kb_id、document_id、content_hash、base_version、model_code、created_by、state、payload/payload_hash、error_code、committed_version、created_at。来源锚点与创建人不可更新，不授DELETE；98仅授权状态/输出/回执列。先持久运行声明、模型输出草稿、人工确认事务原子创建document_text_snapshot/无向量chunk并切换activeVersion，重复确认回同版本。来源快照CHECK接受atlas-ocr-v1，0030加向前保护；baseline/增量/Prisma/98锁步。见170§60。


2026-11-26 0032新增maintenance_task_event（58表），task_id/revision复合主键，workspace_id/event_id唯一，kb_id关联现有库。fingerprint/payload/created_by/created_at保存不可变命令及当次处置状态；98只SELECT/INSERT，无UPDATE/DELETE。事务当前授权/拥有权+CAS追加，不修改知识事实和审核状态。baseline/Prisma/旧41表升级夹具锁步，见170§61。


2026-11-27 0033新增compile_profile_version和compile_profile_activation（60表），同库schemaId/version唯一及配置id同库复合引用；定义/稳定hash和创建人时间不可变，启用按kb/revision追加、kb/event_id幂等。98只SELECT/INSERT，baseline/Prisma/旧41表夹具锁步。配置启用影响新任务，既有task与发布继续固定原语义；正式读取核验release/compile/schema表链，不跟随启用指针。见170§63。

2026-11-27 0034新增knowledge_subscription及knowledge_subscription_event（62表）。固定workspace/user/product/window/request_hash；只更新启用状态/序号/确认位置/最后revision和时间，修订观测事件追加且无正文。baseline/Prisma/98/旧库升级夹具锁步，见170§64。


2026-11-27 0035新增index_rebuild/index_rebuild_item/index_rebuild_event（65表）。计划固定创建人/库/参数/模型/请求hash与说明；item复合PK(run_id,document_id)，不可变来源版本/hash与baseline，状态/3次尝试/租约/候选/hash可更新；event复合PK(run_id,revision)、同run/event_id唯一，追加式不可修改。item不外键关联资料，删除资料后只能浏览历史元数据，不能继续切换。98按列最小授权，baseline/增量/Prisma/旧41表重放锁步，见170§65。


2026-11-27 0036新增pilot_case/pilot_observation/pilot_event（68表）。case固定问题/创建者/参数/说明/request_hash，状态/修订/结论/评审观测可按列更新；observation仅id/case/fingerprint/summary/created_at，无正文；event复合PK(case_id,revision)、同case/event_id唯一并复合引用观测，追加式保存人工说明/结论。98无观测/历史UPDATE/DELETE，baseline/增量/Prisma/旧41表夹具锁步，见170§66。


2026-11-27 0037新增knowledge_delivery_event（69表），为knowledge_subscription增加delivery_revision/sequence/attempt/status/worker、lease_id/until、retry_after。交付事件同subscription/revision主键和request_id唯一、仅SELECT/INSERT，无正文或租约令牌。数据库CHECK保护成对租约/重试时间/尝试上限及未决交付ack围栏；0034新表声明前向兼容，老表由0037幂等添加，baseline/Prisma/98/旧41表重放锁步，见170§67。


2026-11-27 0038新增library_sharing_event（70表），同kb/revision主键、kb/event_id唯一，追加式保存共享before/after、影响元数据、操作者/原因与请求fingerprint；98仅SELECT/INSERT无UPDATE/DELETE。现有publish_state仍唯一权威，未新增机构库ACL；baseline/增量/Prisma/旧41表升级锁步，见170§68。


## 知识源管理增量0039（2026-11-27）

四张表source_control_event/source_sync_run/source_sync_item/source_document_head持久保存来源控制、批次、不可变清单/租约状态和单来源文档最新版本/删除头，70→74表。source_control_event仅SELECT/INSERT，sync_item原始payload/hash及身份字段不可改，允许更新处理状态列；head保留tombstone顺序围栏。document_id为追溯引用，不强制FK，以保留版本链；库/绑定删除按声明级联。baseline/0039/98/Prisma及旧迁移夹具一致。事务/配额/撤销规则见170§69。


## 智能体知识服务0040（2026-11-27）

knowledge_service/version/event/call四表，74→78。版本和控制事件不可变，call不存query/答案/证据正文，只存元数据和现有用量key；配置和调用服务仅更新状态列，历史清理按外键级联。配置不是ACL，当前授权/发布CAS/租约外执行/最终当前状态检查详见170§70。
