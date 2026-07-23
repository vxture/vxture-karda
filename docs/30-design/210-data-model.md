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

`id` / `document_id` FK ON DELETE CASCADE / `ordinal` INTEGER NOT NULL / `text` TEXT NOT NULL /
`token_count` INTEGER / `vector_ref` VARCHAR(128) / `created_at`。
UNIQUE (`document_id`, `ordinal`)。

**只有 Document 有 chunk**：Entry 整条即召回单元（§6），不分块。
`vector_ref` 是向量库中的指针，**向量本身不落 Postgres**——索引存储的选型属批次 6，本表只留接口。

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
