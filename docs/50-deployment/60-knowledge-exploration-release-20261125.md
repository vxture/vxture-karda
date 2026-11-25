# 知识探索功能批量交付与发布（2026-11-25）

本轮沿用 owner 已授权的批量合并与上线范围，分成两个可独立审查的功能 PR，按既有审核流程合并后集中发布。

## 1. 已合并批次

| 批次 | 固定版本与验证 | 交付结果 |
| --- | --- | --- |
| [PR303](https://github.com/vxture/vxture-karda/pull/303) | 主干 `b96a76be4d448d0e9c5cf84d5d004f9647e8494f`，CI45530972997通过 | 实体/关系联合筛选、连通片区计数/聚焦、分组布局切换、关系主题浏览、已发布支持摘录检索及定位 |
| [PR304](https://github.com/vxture/vxture-karda/pull/304) | 主干 `9bfa2d3e1fc4efa3d84e0137d5dc43aa0330562f`，CI45532115482与秘密扫描45532115547通过 | 去掉目录前200关系/50种子抽样，完整可用快照内按确定性节点/边预算生成总览 |

设计与边界见[170 §19–20](../30-design/170-semantic-persistence-adapter.md)。两批继续使用正式知识包授权读取，未新增API、数据库、模型调用或计费项目。
“完整”指原有输入/来源预算内的可用快照；最多500节点/1000边，截断显式提示，不承诺无限全库加载。
连通分组是导航片区，不等于社区发现或本体推理。证据检索逐字区分大小写，仅覆盖已加载知识包内的支持摘录，不是全库原文检索。

## 2. 验证

PR304最终CI45531804106实际执行1026项，全部通过、零失败、零跳过。主干对应CI也通过。
真实PostgreSQL回归验证31片区/62节点、预算截断、单份支持证据去重，及来源撤回继续即时失效。
纯函数覆盖250个互不相连片区/500节点、500孤点布局、输入顺序稳定、隐藏节点不能桥接、隐藏关系不影响截断、UTF-16中文/emoji定位和结果上限。

Playwright合成HTTP流程通过：片区聚焦/返回、实体类型筛选、布局切换、主题展开、摘录搜索高亮、物理页1/3保留、来源HTML按文字显示、390px主内容无横向溢出及403清除旧结果。
本地全量1026项中1009通过、17项因没有本地隔离数据库跳过；最终集成结果以上述远端零跳过为准。
首次远端失败是新测试样本重复名称违反既有唯一约束，改为唯一名称后全量重跑通过；未放宽数据库约束或测试门槛。

## 3. 生产发布

生产 `v0.12.1` 固定应用提交 `9bfa2d3e1fc4efa3d84e0137d5dc43aa0330562f`。
部署 [45532514296](https://github.com/vxture/vxture-karda/actions/runs/45532514296) 经既有tag构建及production审核流程成功，2026-11-25 02:28:19 UTC（北京时间10:28:19）完成。
本次无需生产DDL，保留v0.12.0已验证的53表。上一版固定提交为 `c6ab332097826daa0f41750ebf7f4656cadcbd1e`；如需回滚应用，使用既有rollback.yml与审核，不回删增量表。

北京时间10:28直接读取正式域名，没有附会话或Bearer，结果如下；匿名拒绝探针使用固定不存在UUID，不读取客户资产。

| 生产探针 | 实际结果 |
| --- | --- |
| `https://karda.ruyin.work/api/health` | 200，status=ok，v0.12.1 / 9bfa2d3e / production |
| `https://karda.ruyin.work/api/ready` | 200，status=ready，同版本/SHA，db/redis/storageConfig均ok |
| `GET /api/kb/:id/knowledge-package?nodes=500&edges=1000&hops=2` | 401，仅unauthenticated |
| `GET /api/kb/:id/knowledge-package?format=markdown` | 401，仅unauthenticated |
| `GET /api/kb/:id/semantic?view=maintenance` | 401，仅unauthenticated |
| `GET /api/kb/:id/compile-tasks` | 401，仅unauthenticated |

以上确认部署与公开拒绝边界，已登录生产业务权限/大规模实测及真实Agent链路仍待各自验收。

## 4. 清单与后续

K3a按其命名范围的图谱工作台功能交付完成：独立画布、有界授权总览与片区聚合、局部展开、类型筛选、路径、证据及状态/键盘操作。
固定17项从6完成/11未完成更新为 **7完成、5进行中、5待办，共10项未完成**；见[执行清单](../70-workplan/120-rebuild-execution-checklist-20261124.md)。
K3主批次未关闭：K3b社区发现/版本对照、规模/访问性/真实业务与K6生产已登录验收继续开放。
K2b全库原文检索、模型主题合成、跨库与真实Agent联调，K5草稿/差量刷新/审计重放/第二场景，以及真实Ontos/平台契约等仍按原门槛推进。
owner人审与质量优化后移，不以本轮测试或增量上线代替业务质量/客户迁移验收。
