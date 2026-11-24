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

## 60. 本地验证

新增评测校验 11 项与现行图投影 21 项，共 32 项通过；app TypeScript 通过。
全量 app 测试含覆盖率：929 项，918 通过、0 失败、11 跳过；跳过项需隔离服务，不作为已验收。
文档编号、41 表 DDL/Prisma 锁步、i18n seam、工具登记及 Atlas 契约检查通过。
本地未执行 PostgreSQL 发布/回放事务验收；K1b 数据库实现和迁移保持待办。
