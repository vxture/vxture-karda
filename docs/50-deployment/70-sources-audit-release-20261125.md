# 原文检索与持续运营批量交付（2026-11-25）

沿用 owner 对持续完成剩余工作、批量合并并上线的授权，交付三组可独立审查的变化。

## 1. 合并证据

| 批次 | 主干 / CI | 实际范围 |
| --- | --- | --- |
| [PR306](https://github.com/vxture/vxture-karda/pull/306) | `2d9e64d827a7c167ceada7fea4ba6d61d9a41681` / 主干45538465966成功 | source_only规范原文BM25、版本/hash/坐标/物理页、网页与OBO同快照授权、既有搜索计量 |
| [PR307](https://github.com/vxture/vxture-karda/pull/307) | `b437ba81019e94d18fdbf260e76acc9a904504a4` / 主干45539279808成功 | 发布/编译/本体/规范行/裁决/事件回执一致性，历史分页重放与结构差异 |
| [PR308](https://github.com/vxture/vxture-karda/pull/308) | `7cca363fa0cf860e22bfd5b906a76aaef3db9d93` / 主干45539806154 | 第二场景SOP新旧版本真实PostgreSQL生命周期回归 |

PR306最终CI45537605451执行1031项、PR307最终CI45539000095执行1033项、PR308最终CI45539531251执行1034项，均全部通过、零失败/跳过。
来源检索原件与不可变PDF版本、权限/attachment/原件撤回即时生效、历史损坏/回执不符检测及SOP二代发布均由真实数据库执行。
SOP是自写合成资料与显式测试裁决，不充当实际业务质量金标。设计和界面限制见[170 §21–23](../30-design/170-semantic-persistence-adapter.md)。

## 2. 界面与合同

- 原文页 `/assets/:kbId/sources`，API `POST /api/kb/:id/source-search`，工具 `karda.source_search`。
- 审计页 `/assets/:kbId/history`，API `GET /api/kb/:id/history`，从来源维护页进入。
- 原文检索不要求语义发布，不生成摘要；原件未验证或过期状态必须展示。权限先于评分/计数，原件hash与规范文本版本必须匹配。
- 原文检索每次提交计入既有karda.search，用量写入失败不交付结果；无新指标/价格/Atlas调用，不变更Runos service登记。
- 审计只向具备service.publish的当前user库所有者开放，历史结构不恢复当前权限、不返回旧正文；分页窗口与完整链核验分别显示。

Playwright合成HTTP实际检查原文查询/验证范围/物理页/状态/partial/top limit、历史对照/先后约束/分页、HTML原文转义、390px无主内容横向溢出及403/计量错误清除旧数据。
本地全量1033项中1015通过、18集成跳过；SOP测试本地仅类型检查，最终有效集成结果以远端1034项零跳过为准。
不是已登录生产用户、外部Agent或实际SOP验收。

## 3. 发布

生产版本v0.12.2固定 `7cca363fa0cf860e22bfd5b906a76aaef3db9d93`，主干CI45539806154及秘密扫描45539806140成功后才推送tag。
[部署45540152162](https://github.com/vxture/vxture-karda/actions/runs/45540152162) 经现有production审核成功，于2026-11-25 03:34:02 UTC（北京时间11:34:02）完成。
无需DDL，生产53表不变；应用回滚目标为v0.12.1固定提交 `9bfa2d3e1fc4efa3d84e0137d5dc43aa0330562f`，使用现有rollback流程及审核，不删除增量数据。

北京时间11:34直接读取正式域名：health=200/ok，ready=200/ready，均为v0.12.2/7cca363f/production；db/redis/storageConfig均ok。
未附会话/Bearer的GET history、GET knowledge-package及带正式Origin的POST source-search均401，仅unauthenticated错误。
使用固定不存在UUID，不读取客户资料。该探针确认部署与匿名边界，不替代已登录生产、真实Agent/Atlas账单或业务质量验收。

## 4. 剩余工作

固定17项仍7完成/10未完成，未通过拆小或授权替代验收来降低数量。本轮完成K2b原文模式和K5审计/第二场景子项。
K2b尚有主题页合成、跨库/平台预设库与真实Agent；K5尚有模型主题草稿/差量物化、实际SOP/Agent、外部事件同步及完整业务审计。
K0b人审/留出、K1b-P5权威外部适配、K2a真实Atlas账单/业务负载、K3b社区/版本/规模、K4真实Ontos与对照，以及K6试点/业务切换保持开放。
