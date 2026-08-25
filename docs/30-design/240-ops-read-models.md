# Karda 运营读模型数据设计（Ops Read Models）(240-ops-read-models)

> 版本：v0.1
> 状态：**已落 DDL**（owner 2026-08-25 批准 §7 全部判断）——基线 + `incr/0004` + `98` + Prisma 四件已同批落地
> 验证：新旧两条路径均在一次性 postgres:18 容器里**实跑过**，终态权限逐列一致；并发与列锁的断言见 §11
> 上游文档：210-data-model（领域表与铁律，本文承其约束）、110-processing（五阶段与失败分类）、
> 120-retrieval-tools（召回与引用）、230-runos-channel（供给通道之一）、70-workplan Batch 9
> 定位：为门户四域中仍走 demo overlay 的部分提供**可读的事实来源**；是 `deploy/database/ddl/incr/0004_*.sql`
> 的权威依据
> 编号带：2xx = 对外契约与细化（schema），见 `docs/00-meta/10-docs-convention.md` §3

---

## 1. 立项依据

门户四个功能域里**三个不查库**：`/api/channels`、`/api/pipeline`（含 tasks / rebuild）此前全部读 demo
常量，`/api/evaluation` 的评测半边同样。2026-08-25 验证治理已下 overlay（`kb/governance/corpus-read.ts`），
它是唯一一个**零 DDL** 就能落地的——`verification_state` 两列从基线就在。剩下的都缺表。

Prisma 22 张表里**没有任务表、没有账本表、没有评测表**。所以页面上每一条任务、每一次调用、每一个评测集
都是常量。overlay 标记是诚实的（`demoOps` / `sources` 随生产发出），但**外壳越完整，把 demo 读成真的代价
越大**——这是本文的立项理由，不是"补齐功能"。

## 2. 边界与约束

**本文只管运营事实（ops facts），不碰知识对象**——库/文档/条目/分块的结构权威是 `210-data-model`。

承 210 §1 的全部铁律，不重述；只强调三条对本文特别要命的：

- **DDL 是唯一结构权威**，Prisma 仅为 client 生成源，`lint:data-design` 硬门锁步；
- **锚点列不可变**：`id`、各 `*_id` 引用键、`created_at` 永不进可写白名单；
- 新增可写列**必须**同步 `98_column_locks.sql`，否则服务角色写入 `permission denied`。

**schema 仍是 `karda_kb`，不新开。** 这些是 karda 自有领域的运营事实，与库/文档同属一个领域段；再开一个
`karda_ops` 只会让跨表聚合（按 kb 分组的失败率、按 kb 分组的引用热度）多一层 schema 限定而不换来任何隔离。

**供给账本明确不进 `local_usage`。** 它形状上像用量，但 `local_usage` 是 **C3 平台计量的契约缓冲区**（工厂
基线 schema，210 §1 已定"不触碰、不镜像、不扩展"）。两者目的不同：`local_usage.raw` 是要**上报给平台计费**
的条目，命中平台计量注册表键位、flush 后即可丢；供给账本是**给我们自己看**的运营事实，要按消费方、按能力、
按资产切片，且平台不关心。把产品运营数据塞进契约 schema，等于让工厂基线随产品需求生长——那是下一次
模板同步时最先炸的地方。

## 3. 表清单

| 表 | 供给 | 本轮 |
|---|---|---|
| `processing_task` | 加工管道：在制/挂起/失败、吞吐、队列深度、任务列表 | **建** |
| `processing_task_stage` | 加工管道：五阶段进度点、阶段 P95 | **建** |
| `supply_call` | 供给通道：调用量、时延、错误率、按消费方/能力切片 | **建** |
| `supply_call_asset` | 知识资产：引用热度、TOP 消费方（按资产归因） | **建** |
| `eval_set` / `eval_question` / `eval_run` / `eval_run_result` | 验证评测的评测半边 | **不建，见 §8** |

## 4. 表定义

### 4.1 `processing_task`（加工任务）

`id` UUID PK / `document_id` FK→`document` ON DELETE CASCADE / `kb_id` FK→`knowledge_base` /
`tier` VARCHAR(32) CHECK `interactive|sync|bulk` / `state` VARCHAR(32) CHECK
`queued|running|suspended|failed|done` / `current_stage` VARCHAR(32) CHECK
`fetch|parse|chunk|embed|commit` / `failure_class` VARCHAR(32) NULL CHECK
`transient|permanent|quota` / `failure_reason` TEXT NULL / `attempt` INT NOT NULL DEFAULT 1 /
`created_in_product` VARCHAR(32) **[ref]** / `created_by` VARCHAR(128) **[ref]** /
`queued_at` / `started_at` NULL / `finished_at` NULL / `created_at` / `updated_at`。

- `uidx_task_doc_live` UNIQUE (`document_id`) **WHERE `state IN ('queued','running')`** —— 同一文档不得同时
  有两个在制任务。这不是读模型需要的，是**并发安全**：没有它，一次重复入队就会让两条管线同时替换同一个
  文档的分块集，而 110-processing 的原子替换假设只有一个写者。
- `idx_task_kb_state` (`kb_id`, `state`)；`idx_task_state_queued` (`state`, `queued_at`) 供队列深度与
  取任务；`idx_task_kb_finished` (`kb_id`, `finished_at`) 供 24h 库级失败率告警。
- **`kb_id` 是有意冗余**（可经 `document` 关联得到）。库级聚合是这张表最热的读法——失败率告警、按库的在制
  数、引用面板——每次都穿 `document` 关联只为拿一个不会变的外键，不值得。它同样是锚点列，不可变。
- `failure_class` 直接承 110-processing 的三分类，也是 `atlas` 那条 `retryable:false` 判据的落点：
  `quota` → 挂起不重试，`transient` → 退避重试，`permanent` → 驻留待人工。**分类写在行上而不是靠解析
  `failure_reason` 文本**——文本是给人看的，判据必须是列。
- `created_in_product` / `created_by` 与 `document` 上的同名列同源（#108 的行级溯源）。页面上"forge 沉淀"
  这类标记**由它派生，不另立布尔列**——多一个可写布尔就多一处可以和事实不一致的地方。

### 4.2 `processing_task_stage`（阶段流水）

`id` UUID PK / `task_id` FK→`processing_task` ON DELETE CASCADE / `stage` VARCHAR(32) CHECK 同上五值 /
`outcome` VARCHAR(32) CHECK `ok|failed|skipped|ai_assisted` / `started_at` / `ended_at` NULL /
`note` TEXT NULL / `created_at`。

- `uidx_task_stage` UNIQUE (`task_id`, `stage`)。一个任务的一个阶段只有一行；重试是新任务（`attempt`+1），
  不是在同一行上覆盖——覆盖会把上一次的耗时抹掉，而阶段 P95 正是要看历史。
- **不存 `duration_ms`**：由 `ended_at - started_at` 算。存派生值就要负责它和两端时间戳永远一致，而这种
  一致性没有任何东西会去检查。
- `ai_assisted` 是给管家萃取那一档留的（页面上的紫色点）。它是**阶段的结果**，不是另一种阶段——所以进
  `outcome` 而不是进 `stage` 的取值表。
- 五阶段进度点由 `(stage, outcome)` 直接渲染，不需要在任务行上再存一份 dots 数组。

### 4.3 `supply_call`（供给账本）

`id` UUID PK / `channel` VARCHAR(32) CHECK `direct|runos` / `capability` VARCHAR(64) /
`operation` VARCHAR(64) / `consumer_code` VARCHAR(64) NULL / `workspace_id` UUID **[ref]** /
`task_id_ref` VARCHAR(128) NULL / `outcome` VARCHAR(32) CHECK `ok|degraded|error` /
`error_code` VARCHAR(64) NULL / `latency_ms` INT / `created_at`。

- **追加即不可变**（append-only）：`REVOKE UPDATE, DELETE`，一列都不给、一行都删不掉。一条已发生的调用
  没有"后来变了"的语义，也没有"其实没发生过"的语义。DELETE 必须显式收回——`97_service_role.sql` 对整个
  schema 发的是 `SELECT/INSERT/DELETE`，不收就带着。
- `idx_supply_created` (`created_at` DESC) 供当日/近 7 日切片；`idx_supply_channel_created`
  (`channel`, `created_at` DESC)；`idx_supply_consumer_created` (`consumer_code`, `created_at` DESC) 供
  TOP 消费方。
- `channel` 只有两个取值，与 230-runos-channel 的两条通道一一对应；`capability` 存 `karda.kb-read` 这类
  能力码，`operation` 存 `search`/`ask`/`write_document` 这类具体动作。**两者分开**：能力是计费与授权的
  单位，动作是运营要看的粒度，合成一列以后想拆就得回填。
- `task_id_ref` 是**送给 Atlas 的那个 `taskId`**（karda#101 的跨产品工作单元键）。存它，一次 agent 任务在
  karda 这边消耗了什么、在 Atlas 那边消耗了什么，才能对得上账。**不叫 `task_id`**——那个名字在本 schema
  里已经属于 `processing_task`，同名不同义是最难查的一类错。
- `consumer_code` 可空：Console 里的人工调用没有 agent 身份。

### 4.4 `supply_call_asset`（按资产归因）

`call_id` FK→`supply_call` ON DELETE CASCADE / `kb_id` FK→`knowledge_base` / `cited_count` INT NOT NULL /
PK (`call_id`, `kb_id`)。

- 一次检索会跨多个库召回，所以**归因不能挂在 `supply_call` 的单个 `kb_id` 上**——那样要么记漏、要么把一次
  调用记成属于其中任意一个库。
- 记的是 **cited（被引用）**，不是 recalled（被召回）。`heat7d` 在 210/概览里的定义就是引用次数；把召回也
  算进去会让一个从没被采信过的库看起来很热。`cited_count = 0` 的库**不写行**。
- `idx_supply_asset_kb` (`kb_id`)，配合 `supply_call.created_at` 做 7 日窗口聚合。

## 5. 与列锁的关系（可写列白名单）

列锁要**在两个地方各写一份**，这不是冗余，是 db-init 的执行序 `baseline → 97 → 98 → incr/*` 逼出来的：

| 路径 | 到 `98` 时四张表存在吗 | 谁发列锁 |
|---|---|---|
| 新库（baseline 建全） | 存在 | `98`（带存在性守卫） |
| 活库（表由 `incr/0004` 引入） | 不存在 | `incr/0004` |

所以 `98` 里的语句包在 `DO $$ ... IF to_regclass('karda_kb.processing_task') IS NOT NULL THEN ... END IF`
里——活库跑到它时安全跳过，新库正常施加；`incr/0004` 再无守卫地写一遍，两者幂等。

```sql
-- 98_column_locks.sql（新库路径，带守卫）／incr/0004（活库路径，同样内容无守卫）
REVOKE UPDATE ON karda_kb.processing_task FROM karda_svc;
GRANT UPDATE (tier, state, current_stage, failure_class, failure_reason,
              attempt, started_at, finished_at, updated_at)
  ON karda_kb.processing_task TO karda_svc;

REVOKE UPDATE ON karda_kb.processing_task_stage FROM karda_svc;
GRANT UPDATE (outcome, ended_at, note) ON karda_kb.processing_task_stage TO karda_svc;

-- 账本：UPDATE 与 DELETE 一并收回（97 对整 schema 发过 DELETE）
REVOKE UPDATE, DELETE ON karda_kb.supply_call FROM karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.supply_call_asset FROM karda_svc;
```

`tier` 可写是有意的：受控重建会把一个任务从 `interactive` 降到 `bulk` 以免挤占交互队列（110-processing
的队列纪律）。除此之外它不该变。

**只写一处的后果**（落地时实际踩到，见 §11）：只写 `incr/0004`，新库上两张任务表会一列 UPDATE 都没有、
状态机推不动；只写 `98`，活库跑到 `98` 时表还不存在，整个 db-init 直接失败。

## 6. 保留与体量

`supply_call` 是唯一会线性增长的表。按今天的量级（约 1.2k 次/日）一年约 44 万行，Postgres 上无需任何特殊
处理，**所以本轮不建汇总表**——建一张没人需要的日汇总，只会多一处可以和明细不一致的地方。

需要动的阈值先写在这里，免得将来靠感觉判断：单表超过 **5000 万行**（约当 10 万次/日跑 1.5 年），或按
7 日窗口的聚合查询 P95 超过 **200ms** 时，才引入按日汇总表 + 明细分区。保留期归 L0 治理配置（同 KD-202
的归属），在它落定前不自动清除。

`processing_task` 随文档处理次数增长，量级远小于调用，且随文档 CASCADE 删除，不单列策略。

## 7. 本文做出的判断（供评审推翻）

1. **供给账本进 `karda_kb` 而不是 `local_usage`**（§2）——形状像用量，目的不同，且后者是工厂基线。
2. **`kb_id` 在 `processing_task` 上冗余**（§4.1）——为库级聚合，代价是一列不可变外键。
3. **阶段独立成表而非任务行上的 JSONB**（§4.2）——阶段 P95 与进度点都要按阶段查，JSONB 里的东西查不了。
4. **引用归因独立成表**（§4.4）——一次调用跨多库，单 `kb_id` 记不下。
5. **不存派生值**（`duration_ms`、dots 数组、`agent_deposit` 布尔）——派生值的一致性没有任何东西会检查。
6. **评测四表本轮不建**（§8）。

## 8. 不建的东西（有意）

> **2026-08-25 更新（批次 14）：本节的四张表已建。** 运行器随同一批落地，本节"不建的理由"
> （"建四张表去等一个不存在的运行器,是投机性 schema"）随之失效。形状按本节原样落地，未改：
> `incr/0005_eval_runner.sql` + 基线 + `98_column_locks` + Prisma 四个 model。
> 下面的原文保留，因为它记录的是**当时为什么不建**——那条纪律仍然成立，只是这一次的条件满足了。

**评测集 / 评测运行四张表（`eval_set` / `eval_question` / `eval_run` / `eval_run_result`）本轮不建。**

形状已想清楚：`eval_set` 是人工编写的问题集（KD-011 已裁：v1 不做合成 QA 生成），`eval_question` 带期望
证据，`eval_run` 一次运行对一个基线，`eval_run_result` 逐题记通过/缺口，页面上的召回命中率、引用准确率、
有据回答率都是它的聚合。

**不建的理由：没有运行器，也没有排期。** 建四张表去等一个不存在的运行器，是投机性 schema——和 210 §"不建
表的东西"里 GraphInstance 留到 v2 是同一条纪律。评测半边继续走 overlay 并由 `sources.evaluation: "demo"`
诚实标注，代价是一句脚注；先建表的代价是四张空表进了基线，还占着 `lint:data-design` 的锁步。

运行器排期时另开增量，本节的形状可直接用。

**其他有意不建的**：调用明细的日汇总表（§6）；任务的重试历史独立表——重试是新任务行（`attempt`+1），
历史天然在表里。

## 9. 落地顺序（一个增量，三个文件同时动）

`db-init` 是结构变更的唯一路径，也是链条上唯一接近不可逆的一步，所以四张表**作为一个增量落地**，不拆成
三次：

1. `deploy/database/ddl/00_baseline.sql` —— 追加四张表的 `CREATE TABLE IF NOT EXISTS`（新库直接建全）；
2. `deploy/database/ddl/incr/0004_ops_read_models.sql` —— 幂等增量（活库路径），承 `incr/README.md` 的
   基线安全纪律：**独立语句（`CREATE INDEX` 等）若引用新列，必须在基线里按列存在性加守卫**，否则活库跑
   基线时会失败；
3. `deploy/database/ddl/98_column_locks.sql` —— §5 的白名单；
4. `portals/app/prisma/schema.prisma` —— 四个 model，`@@schema("karda_kb")` + `@@map`，与 DDL 锁步。

`check-data-architecture.mjs` 比对的是**基线 DDL 的表集合 == Prisma model 集合**，所以第 1 步与第 4 步
必须同一个 PR，否则 quality-gate 直接红。

落地后按域接线：加工管道读模型 → 供给通道读模型 → 知识资产运营数字（搭 `supply_call_asset` 的车）。三者
各自把 payload 的 `demoOps` 换成 `sources` 逐组溯源标记——**不要让某一段在页面级开关下悄悄上线**，那正是
demo 数字被读成真的路径。

## 10. 联动登记

- `70-workplan` Batch 9 是本文的排期出处；
- `110-processing` 的失败三分类与五阶段是 §4.1/§4.2 的取值表来源，二者取值必须同改；
- `230-runos-channel` 的两条通道是 `supply_call.channel` 的取值表来源；
- karda#101（Atlas `taskId`）是 `supply_call.task_id_ref` 的来源，改名需同步；
- KD-202 的保留期归属同样适用于 `supply_call`（§6），落定后回填。

## 11. 实跑验证（2026-08-25）

DDL 从未执行过就是最贵的那种草稿，所以落地前在一次性 `postgres:18-alpine` 容器里把两条路径都跑了：

- **新库路径** `baseline → 97 → 98`：16 张 karda_kb 表，四张新表权限为
  `processing_task` / `processing_task_stage` = `SELECT,INSERT,DELETE` + 列级 UPDATE 白名单，
  `supply_call` / `supply_call_asset` = `SELECT,INSERT`（无 UPDATE、无 DELETE）。
- **活库路径** 改动前的基线 → 97 → 改动前的 98 → **新的 98** → `incr/0001..0004`：新 98 在四张表还不存在时
  安全跳过（存在性守卫生效），0004 把活库带到与新库**逐列一致**的终态；0004 重跑干净（13 条 skipping）。

行为断言（以 `karda_svc` 身份实测）：

| 断言 | 结果 |
|---|---|
| 同一文档两个在制任务 | `duplicate key ... uidx_processing_task_doc_live` —— 拒绝 |
| 已完成任务不阻塞新任务（partial 谓词的意义） | 通过 |
| 改锚点列 `kb_id` | `permission denied` |
| 改白名单列 `tier` / `failure_class` / `state` | 通过 |
| `UPDATE` / `DELETE` 供给账本 | 两者均 `permission denied` |
| `channel` 写入表外取值 | `chk_supply_call_channel` 拒绝 |

**过程中改掉一个真错**：最初只在 `incr/0004` 里写列锁、`98` 里只留指针注释（照 `kb_attachment` 的先例）。
那对活库对、对新库错——`97` 发的是 `SELECT/INSERT/DELETE`（不含 UPDATE），所以新库上两张任务表会**一列
UPDATE 都没有**、状态机推不动，两张账本反而**带着 DELETE**。两处都要有，`98` 那份用
`to_regclass(...) IS NOT NULL` 守卫，活库跑到时安全跳过。
