# K0b 公开来源评测准备与待审清单

日期：2026-11-24。状态：**真实原文已固定，题目和答案待人工复核，K0b 整批未验收**。
继 [K0a 合成基线](100-k0-audit-and-contracts-20261124.md)之后，本轮新增真实来源、离线校验和开发集报告。

## 10. 来源、版本与定位

原文来自[中国政府网：中华人民共和国政府采购法实施条例](https://www.gov.cn/zhengce/content/2015-02/27/content_9504.htm)。
这是 2015-02-27 发布文本的历史快照，最后一条写明 2015-03-01 施行。**本次没有核实后续修订或当前适用状态，不能将其表述为 2026 年最新法律。**

仓库资产：

- 原文及 79 个条款锚点：scripts/knowledge/corpus/procurement-regulations-2015.json。
- 60 道题及答案草案：scripts/knowledge/corpus/procurement-draft-cases.json；reviewStatus=agent_draft。
- 采集与重建：scripts/knowledge/import-regulations.ts；使用正文 strong 条款标记，不用全文「第×条」切割，避免把条款内对上位法的引用误切成新条。
- 题目草案来源：scripts/knowledge/build-draft-cases.ts；由本次 agent 根据原文编写，未伪装成人工标注或复制上游 Wiki 测试数据。
- 校验和评分：app/kb/semantic/evaluation.ts；验证 canonical SHA256、来源/版本/锚点绑定、题目重复、证据存在性及分区证据不重叠。

canonical 原文使用明确的 UTF-16 半开偏移；每个锚点可由 text.slice(start,end) 直接定位。
HTML 快照 hash 随来源登记；canonical hash 及元数据/锚点的 corpusFingerprint 绑定题目集，防止改原文/版本/映射后继续沿用旧标签。

## 20. 数据构成和保留集

60 道草案：35 单条款、20 多条款、5 资料不足。
开发集 45 道、保留集 15 道；支持条款在两个分区不重叠。默认评分器只跑开发集，没有打开保留集评分的命令选项。

这是**同一份法规内的分区保留**，不是独立业务资料留出集。多条款题也不自动等于跨文档推理。
当前仍缺：真实项目招标文件及补遗、人工复核的结论和逐条证据、跨资料复杂题与独立留出、旧/新项目版本及权限撤销数据。
因此不以「凑足 60/20」宣布 K0b 通过。

人工复核时应逐题检查 question、expectedAnswer 和 evidence 对应原文；确认适用范围与例外、修改误标，
登记实际复核者、时间和冻结的数据指纹。冻结后的保留题不用于调参；增加独立项目材料后重新按资料族拆分。
当前评分器只处理 draft，不能通过改一个参数把草案升级成 gold。

## 30. 结果和局限

报告：[公开原文词法开发集草案报告](110-public-lexical-draft-report-20261124.json)。

- 42 道开发集可回答题：41 道预期支持条款全部进入 Top 5。
- 共 53 个预期支持条款，命中 52 个，证据 Recall@5 为 98.11%。
- p38（联合体资格资料与资质等级）：召回第22条但漏了第17条；原样保留，不为提高数字改写问题。
- 3 道资料不足题均产生候选片段；这只表明词法重叠，不能据此说系统生成了错误答案，也不能当作正确拒答。

没有运行 Atlas 生成、图增强或人审评分；未测最终答案准确率、图谱收益、延迟与成本。
本次结果是可复跑的检索诊断，不是产品商业质量声明。

## 40. 复跑

仓库根目录：

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/run-public-baseline.ts
```

如需从网页重建来源，先保存正文响应到 HTML 文件，再运行：

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/import-regulations.ts saved.html scripts/knowledge/corpus/procurement-regulations-2015.json
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/build-draft-cases.ts
```

新版网页或条款映射变化后，重新核查 provenance 和人工标签；不能静默用重新生成的数据覆盖已经冻结的 gold。
没有网络也能验证当前仓库快照并重跑开发集；输入正文不会被执行为网页或模型指令。

## 50. 对下一批的作用

K0b 从「无真实来源」推进到「已具备可追溯真实来源和待审题库」。
[K1b 适配设计](../30-design/170-semantic-persistence-adapter.md)现已准备；真实金标准、迁移评审和隔离数据库验收门槛保持不变。
本轮同时补上 K1a 的治理到期检查：verificationExpiresAt 与业务 validUntil 分开，verified 标签未及时转 stale 也不能继续出图。
无数据库迁移、生产接线或客户权限变更。

## 70. K0b 复核工具包（2026-11-24 后续批）

已实现开发集复核导出与回执结构检查；不修改题库 reviewStatus、不产生 gold、不评分保留题。
一次导出包含 45 道开发题、逐题指纹、答案草案、来源 URL/版本、UTF-16 锚点和精确原文段落；
review.json 全部初始化为 pending，review.md 供逐项阅读。保留集的题目、答案与证据段落不导出。

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/export-review.ts D:\review-new-directory
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/check-review.ts D:\review-new-directory\review.json
```

导出目录必须全新，防止覆盖已填写的复核结果。回执 accept/revise/reject 必须填写 reviewer、
ISO UTC reviewedAt 及理由；pending 不得带已复核身份。原文、题目、答案、证据或分区改变后，
旧回执因 corpus/dataset/case 指纹不匹配而失效。拒绝重复、缺失、陌生或保留题回执。
revise 需生成新数据版本后重新复核，不由工具偷偷修改题库；reject 也不静默减少评分分母。

填写的 reviewer 只是**待核验归属的回执**，不是已认证的人类身份。
即便所有开发题填 accept，结构检查仍固定 acceptedGold=false、humanIdentityVerified=false，
不宣告 K0b 通过。保留集独立评测、业务资料族划分和人工验收仍需独立证据。
本轮实际生成 45 项 pending，未代填任何人工结论。

多来源评分入口同时修正：文档局部条款 ID 允许同名，检索和命中一律绑定 sourceId+sectionId；
避免从另一份资料的“第一条”错误计入支持证据。报告升级 reportVersion=2，新增 evidenceIdentity。
已重跑开发基线，仍为 52/53 条证据、41/42 题完整，15 道保留题未评分；这不是新质量收益。

本轮仅完成 K0b 内可合并的复核工具及评测修正；独立项目资料、人工复核、跨文档留出和
性能预算仍未完成。[17 项清单](120-rebuild-execution-checklist-20261124.md)数量保持 5 完成/12 未完成。

## 80. 资料生成保护与合并记录

复核工具和多来源计分修正已合并 [PR277](https://github.com/vxture/vxture-karda/pull/277)，
代码 CI45385082309：951 项测试全部通过、零跳过。已导出的 45 项全部为 pending，未填写人工结果。

后续资料保护批将 `import-regulations.ts`、`build-draft-cases.ts` 的写入统一为独占创建：
目标不存在时新建；目标内容逐字节相同时不重写；目标不同、残缺、目录或符号链接时拒绝。
没有强制覆盖选项；需要修订时显式另存新路径、审核差异后再按 PR 更新版本和标签绑定。
导入命令的两个参数不变，重复运行可以复现相同文件，但不能覆盖一份已被修改或冻结的资料。
现有固定草案生成命令只允许相同内容复现，修改题库须显式编辑并经 PR 复核。

此保护针对生成输出，不是文件权限、外部攻击防护或密码学人审证明。进程中途失败可能留下
残缺新文件；下一次不会自动重写它，需先检查后用新路径重建，避免把手工修改误当残缺自动修复。

独立业务资料采集仍未完成。本轮访问中国政府采购中心公开主页并根据页面的公告查询接口
尝试获取招标/更正公告，两次响应均为“公告列表查询失败”；没有固定实际项目公告，也不把搜索结果
或接口错误当原文。采集入口为 <https://www.zycg.gov.cn/>；后续应补可访问的项目原公告、补遗和独立项目族。
本次外部采集失败不影响离线复核工具和原有法规快照的复现，但 K0b 仍不勾选。

## 60. 本地验证

新增评测校验 11 项与现行图投影 21 项，共 32 项通过；app TypeScript 通过。
全量 app 测试含覆盖率：929 项，918 通过、0 失败、11 跳过；跳过项需隔离服务，不作为已验收。
文档编号、41 表 DDL/Prisma 锁步、i18n seam、工具登记及 Atlas 契约检查通过。
本地未执行 PostgreSQL 发布/回放事务验收；K1b 数据库实现和迁移保持待办。
