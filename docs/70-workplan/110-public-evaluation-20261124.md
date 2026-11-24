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

## 90. 独立项目业务来源（后续采集成功）

中国政府采购网公开列表可访问，现已固定以下三份实际业务公告，取代“只有法规、没有任何项目材料”的状态。
这只补上公告层材料，不能写成已获得完整招标文件、附件或成套项目历史。

| 来源 | 项目编号 / 项目族 | 实际采集范围 |
| --- | --- | --- |
| [JUNO 存储设备更正公告](https://www.ccgp.gov.cn/cggg/zygg/gzgg/202611/t20261124_27747586.htm) | OITC-G260360399 / juno-storage-2026 | 2026-11-24 更正公告：获取文件、投标截止与开标安排变更；未取得 11-03 原公告及完整招标文件 |
| [天津大学惠民保更正公告](https://www.ccgp.gov.cn/cggg/zygg/gzgg/202611/t20261124_27747661.htm) | TDQT202600081 / tju-insurance-2026 | 2026-11-24 更正公告：理赔条款、业绩证明变更、提交确认函要求；页面引用的答疑及确认函附件未下载 |
| [卫星地面系统软件招标公告](https://www.ccgp.gov.cn/cggg/zygg/gkzb/202611/t20261124_27747559.htm) | CEITCL-BJ03-2609026 / satellite-software-2026 | 2026-11-24 公开招标公告的项目、资格、获取文件、提交期限、公告期限和政策章节；未购买/获取完整招标文件 |

数据位于 `scripts/knowledge/corpus/procurement-notices-20261124.json`，输入登记位于
`procurement-notice-inputs.json`。三份资料分别登记 URL、发布日期、项目编号/族、保存 HTML 的 SHA256、
业务 HTML 片段和片段 hash、规范正文 hash 以及 UTF-16 半开锚点，共 12 节。
`notice-corpus.ts` 可从仓库保留的业务 HTML 片段离线重建正文与锚点，测试逐份比对。
保存 HTML hash 对应本次 UTF-8 保存快照，不声称是服务器原始传输字节的 hash。

复现命令（先按 manifest 的 file 名保存网页 HTML，保持已登记快照内容不变）：

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/import-notices.ts scripts/knowledge/corpus/procurement-notice-inputs.json D:\saved-html-directory D:\new-notice-corpus.json
```

网页变化、标题/项目编号不符、章节缺失或未知 HTML 实体时明确失败，不猜测边界。
公告原文不执行为脚本或模型指令。专门联系方式章节、概要表、导航页脚未纳入规范正文；
业务章节内本来包含的地址、邮箱和提交方法保留，未暗改公告。

以上是抓取时点快照，未持续监测后续更正。新增真实来源尚无人工标签，未计入旧法规 60 题或虚构跨文档正确率。
下一子批按项目族划分开发/保留范围；同一项目原公告、补遗和附件必须同区，不能因 URL 不同就算独立。
K0b 的人工复核、完整复杂题及独立留出冻结仍未完成；17 项清单保持 5 完成/12 未完成。

## 100. 项目族隔离与开发基线

真实公告语料已合并 [PR279](https://github.com/vxture/vxture-karda/pull/279)，
主干 CI45389646673 和密钥扫描45389646560 通过；PR CI 为 960 项通过、零跳过。

`procurement-project-split.json` 将 JUNO、天津大学两项目族列为开发区，卫星软件项目族列为保留区。
状态固定为 proposed_unreviewed：这是待独立复核的分区提议，不是已冻结或盲测的留出集。
同项目的原公告、更正和附件必须同区；重复编号、漏分来源、跨区相同 URL/正文/保存快照均拒绝。
分区绑定项目元数据、语料和保留 HTML 的重建结果；重命名不能绕过隔离。

新增 12 道 Agent 开发草案：8 道单节、2 道多节、2 道未知问题，全部为 agent_draft。
多节沿用 multi_article 编码，只证明同一公告内多节证据，不能计入跨文档/多跳题数。
保留项目在建索引和导出审阅包之前移除，没有编写保留题或产生保留区分数。

复现入口：

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/run-project-baseline.ts
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/project-review.ts export D:\new-project-review
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/project-review.ts check D:\new-project-review\review.json
```

[开发报告](130-project-lexical-draft-report-20261124.json)：Top5 命中 12/12 个预期证据，
10/10 道有答案题证据完整；2 道未知题均仍返回候选。没有生成答案、拒答正确率或图增强收益测量。
实际审阅包位于工作区外 `knowledge-project-review-20261124`，12 项全部 pending，
未填写人工回执；humanIdentityVerified 和 acceptedGold 仍为 false。

K0b 仍需完整业务资料/附件、独立人工复核、跨文档复杂题、独立分区冻结以及规模/性能预算。
本批不改变 17 项清单的 5 完成/12 未完成，也不解除正式迁移与 K2 接线门槛。

本地验证：新增项目隔离测试 9 项通过，app TypeScript 通过；全量 969 项，955 通过、
14 项隔离数据库测试在未配置数据库的本地跳过、零失败。文档编号、数据锁步、i18n、工具登记和 Atlas 契约护栏通过。

## 110. 公告与原始附件的跨文档草案

项目族隔离批已合并 [PR280](https://github.com/vxture/vxture-karda/pull/280)，主干 CI45390912544、
密钥扫描45390912451 通过，969 项测试通过、零跳过。
后续已从天津大学更正公告的公开下载链接取得两份原始 DOCX，保存在
`scripts/knowledge/corpus/tju-qa-20261124.docx` 与 `tju-confirmation-20261124.docx`。
URL、原始二进制 hash、document.xml hash、父公告及项目身份登记在 `procurement-attachment-inputs.json`。
发布日期沿用父公告，不声称是附件内部签署时间；空白确认函不是供应商已签署回执。

`extract-docx.py` 使用 Python 标准库离线读取正文段落；不访问外部关系、不执行宏，限制压缩包、
XML 和输出规模，拒绝 DTD、修订、字段、表格、图形及页眉页脚等尚未支持的结构，避免静默丢失内容。
规范正文及 UTF-16 锚点可从保留段落重建，测试再从仓库中的原始 DOCX 重跑，核对全部段落和两个 hash。
附件必须跟随同项目、同日期的父公告分区；原始 hash 纳入版本描述及审阅指纹，换字节后旧回执不能沿用。

新版本 `procurement-project-materials-20261124.json` 为 5 份资料、18 个锚点，沿用三项目族的分区提议；
旧公告语料、旧题库和旧报告保留。新题库共 24 道开发草案，其中新增 12 道结构上跨文档的题目，
覆盖供应商建议与正式更正的区别、业绩材料、理赔条款、确认函义务、代理费和参与人数。
这 12 道都来自同一开发项目族，不能代表多项目复杂任务分布，也不能代替 ≥20 道复杂题及独立留出门槛。
原未知题在新版本中明确为完整保障责任和金额清单；已取得附件仍不提供该完整清单。

复现（需要 Python 3；既有默认命令继续使用旧公告版本）：

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/import-attachments.ts scripts/knowledge/corpus/procurement-attachment-inputs.json scripts/knowledge/corpus D:\new-attachments.json
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/run-project-baseline.ts --materials
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/project-review.ts export D:\new-materials-review --materials
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/project-review.ts check D:\new-materials-review\review.json --materials
```

[新报告](140-materials-lexical-draft-report-20261124.json)：Top5 命中 37/39 个预期证据，
20/22 道有答案题证据完整；2 道未知题仍返回候选。未调高 TopK 或改标签掩盖漏召回。
这只测量草案证据召回，不是生成结论正确率、拒答正确率或图增强提升。
实际新审阅包 `knowledge-materials-review-v2-20261124` 共 24 项 pending；旧包保留，未伪造人审。
完整磋商文件、外部理赔须知、独立人工复核、冻结留出与性能验收仍未取得，K0b 不关闭。

本地验证：全量 976 项，962 通过、14 项数据库测试待 CI 环境执行、零失败；TypeScript 与五项护栏通过。
新增 7 项 app 测试包含原始 DOCX 逐段复现、分区/父公告/审阅指纹失效，并实际执行 Python 提取器的 5 项安全测试。

## 120. 本地组件性能诊断

原始附件及跨文档草案已合并 [PR281](https://github.com/vxture/vxture-karda/pull/281)，PR CI45393899737
为 976 项通过、零跳过。性能子批新增 `scripts/knowledge/benchmark-local.ts` 与
[完整测量记录](150-local-component-performance-20261124.json)，补充可复现的负载及计时口径。

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/benchmark-local.ts D:\new-local-performance.json
```

| 负载 | 本次 P95 | 口径 |
| --- | --- | --- |
| 100 / 1000 / 5000 条合成关系 | 0.85 / 2.85 / 14.78 ms | 真实 projectNeighborhood；星形图，30% 为无权/撤回/旧版本支持，2 跳、最多 100 节点/1000 边 |
| 真实开发资料 12 个章节 | 1.23 ms | 24 个开发查询轮转；真实 BM25 分词、统计、评分、排序及 Top5 |
| 100 / 1000 份合成短文本 | 1.09 / 6.52 ms | 中英混合短模板，不能外推完整招标文件成本 |

每种负载预热 5 次、测量 30 次、并发 1，P95 使用 nearest-rank；保留逐次耗时及机器/Node 参数。
测试前构造夹具不计时；BM25 每次调用仍重算语料统计，没有添加跨身份缓存。
每个图样本检查预期节点/边数、截断标记，以及结果中没有无权、撤回和旧版本证据；校验自身不计入耗时。
保留脚本 LF 规范 hash、开发语料及题库指纹；保留项目不进入词法负载。
重新运行必须指定新输出，旧测量不会被脚本自动覆盖；操作系统调度及 JIT 会造成波动。

以上是单机暖进程的组件诊断，不含 DB/对象存储/网络、Atlas、浏览器布局与绘制，也不测并发或冷缓存。
检索接口 P95 <700 ms、图首屏 ≤2 秒仍是待联调确认的系统目标，不能据上述数字宣告通过。
本批固定了部分本地负载口径，K0b 的真实业务分布、系统规模/性能预算及人审留出仍未完成。

## 130. 原公告到更正公告的历史链

已从代理机构东方招标的公开项目查询结果获得 JUNO 原公告 URL，再实际访问并固定
[中国政府采购网原公告](https://www.ccgp.gov.cn/cggg/zygg/gkzb/202611/t20261103_27613123.htm)。
来源登记为 `procurement-history-notice-inputs.json`；保留业务 HTML、规范正文及 6 个 UTF-16 锚点，
使用既有导入器离线重建，不复制代理平台代码或将其项目列表当作公告原文。
原公告所链需求 DOCX 下载返回 403，未取得该附件；未尝试绕过访问限制，也没有取得完整付费招标文件。

新资料版本 `procurement-project-history-20261124.json` 共 6 份资料、24 个章节，
JUNO 原公告与更正严格处于同一开发项目族。新增 8 道 Agent 历史对照草案：时间/地点、获取期限与售价、
整包货物、联合体及分包限制、预算及进口许可、关联供应商限制、获取方式、公告期限与获取期限的区别。
原公告中进口许可的“否”跨两货物行合并，已对照保留 HTML 中 rowspan=2 核对，不将扁平文本顺序当表格关系。
“其余均不变”来自更正原文；判断仅限所持两次快照，不声称监测全部后续更正。

新版本共 32 道开发草案，其中结构上跨文档 20 道，分布在两个开发项目族；这不构成人审金标、
独立留出或跨文档结论正确性验收。[新词法报告](160-history-lexical-draft-report-20261124.json)的
Top5 为 53/58 个预期证据、25/30 道有答案题完整命中，2 道未知题仍有候选。
题目与语料规模均变化，不把前后报告差异解释为检索改进或退步。

用户已在本轮对话明确承担人工复核（回复“给我”），已提供原 24 题审阅包，尚无任何题的裁决。
为保护正在进行的复核，新增 `selectReviewAdditions`：只允许旧来源、旧题原样保留的增量，
拒绝旧题删除/改答案/改证据或旧来源变化；只导出新增题，不复用或迁移旧回执。
原 24 题与原指纹不变，另导出 8 题 `knowledge-history-additions-review-20261124`，全部 pending。
这两份审阅包各自独立绑定，不把旧包回执直接计入新版本完整 32 题的验收。

```powershell
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/run-project-baseline.ts --history
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/project-review.ts export D:\new-history-additions-review --history-additions
node portals/app/node_modules/tsx/dist/cli.mjs scripts/knowledge/project-review.ts check D:\new-history-additions-review\review.json --history-additions
```

`--history` 可导出完整新版本；`--materials` 仍对应原 24 题。新旧文件均保留；K0b 不关闭，
后续仍需用户实际复核、独立留出集冻结、完整业务资料和系统交互/性能验收。

## 140. 来源证据画布

历史链批已合并 [PR283](https://github.com/vxture/vxture-karda/pull/283)，主干 CI45397916009 与
密钥扫描45397915773 通过，979 项测试通过、零跳过。
后续新增[离线证据审阅原型](170-evidence-review-prototype-20261124.md)：项目/文档/章节画布、
题目与预期证据联动、Top5 漏召回标记、精确原文、筛选/搜索、键盘与窄屏。
保留项目在导出前移除；只展示原文归属和草案证据，不作为业务事实图或正式知识服务。
用户正在承担人工复核，尚未收到逐题裁决；原 24 题和新增 8 题审阅包均未覆盖或自动迁移。

## 150. 附件快照与编码一致性修复

附件导入器原先按原始字节检查 DTD/实体声明，UTF-16/32 字节中的零字节会使该检查漏匹配；
同时先读取哈希字节再按路径解包，路径在两次操作之间被替换时会造成哈希与正文属于不同快照。
本批仅修复离线 DOCX 解析边界：一次有界读取最多 2 MiB + 1 字节，超限拒绝；
哈希和 ZIP 解包都使用这一次读取的字节，不再按路径二次打开。

主文档 XML 明确限于严格 UTF-8（允许 UTF-8 BOM），拒绝零字节、解码错误和非 UTF-8 编码声明，
在解码后检查 DTD/实体，再解析。保留原 XML 字节计算哈希，不自动转码或修改归一化版本。
不支持的附件需显式扩展、验收解析契约，不能通过静默转码纳入证据。

8 项 Python 检查覆盖两份真实 DOCX、UTF-8 BOM、UTF-16/32 含/不含 BOM 及 DTD、
伪装编码声明、非法 UTF-8、读取后路径替换、原有不支持内容/页眉和大小限制；
编码与路径替换回归已实际在修复前代码上失败。既有 TypeScript 集成检查同时证明真实附件
正文、二进制/XML 哈希、规范文本、UTF-16 锚点和词法报告逐项不变。
现有语料、题目、指纹绑定回执及用户审阅页面不变；不关闭 K0b 或推进正式迁移。

## 60. 本地验证

新增评测校验 11 项与现行图投影 21 项，共 32 项通过；app TypeScript 通过。
全量 app 测试含覆盖率：929 项，918 通过、0 失败、11 跳过；跳过项需隔离服务，不作为已验收。
文档编号、41 表 DDL/Prisma 锁步、i18n seam、工具登记及 Atlas 契约检查通过。
本地未执行 PostgreSQL 发布/回放事务验收；K1b 数据库实现和迁移保持待办。
