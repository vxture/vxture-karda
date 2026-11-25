# 主题知识草稿交付与发布（2026-11-25）

本轮继续owner授权的剩余功能建设及正式上线，交付[PR310](https://github.com/vxture/vxture-karda/pull/310)。
固定应用提交 `3ae8bd79bde041c3a77c42149ccd699de465ef15`，最终PR CI45542337991实际执行1036项全部通过、零跳过，秘密扫描45542338008通过。
实际新库/41表旧库重复升级至54表、SOP新旧主题草稿去重/冲突/失效隐藏/只读拒绝/不可改写均经真实PostgreSQL执行。

## 1. 功能与限制

- 治理页 `/assets/:kbId/topics`，API `GET/POST /api/kb/:id/topics`，入口在来源维护页。
- 按当前正式关系主题抽取式汇编事实、实体和逐字原文，保留版本、UTF-16和物理页，不调用模型、不产生新断言。
- 保存不可变草稿，请求ID及主题输入指纹双重幂等，同ID不同输入拒绝。仅按输入变化生成新版本，不覆盖旧稿。
- 平台/角色/所有者、正式来源/裁决/attachment在同一repeatable-read事务读取；历史正文不直接回显，匹配时取当前权威响应，失配时只显示失效状态。
- 截断或partial知识包不汇编，单稿≤240KiB、展示20份/合计2MiB，预算不足明确拒绝；无模型摘要、自动审核或发布。
- `0019_topic_dossier` 与baseline/Prisma/98锁步为54表，服务角色只SELECT/INSERT，应用不自动迁移。

设计依据[170 §24](../30-design/170-semantic-persistence-adapter.md)、[210 §13](../30-design/210-data-model.md)。
Playwright合成HTTP检查空态/汇编/复用、原文页码、HTML文本转义、390px、失效正文隐藏及403清空。
本地1036项为1017通过/19集成跳过，正式集成证据以远端零跳过为准；非已登录生产或真实业务验收。

## 2. 生产步骤

固定主干CI45542575859及秘密扫描45542575866均成功。
[db-init45542856873](https://github.com/vxture/vxture-karda/actions/runs/45542856873) 经既有production审核成功，日志确认应用0019，54张声明表全部存在，db-init done。
v0.12.3固定该提交，[部署45543274150](https://github.com/vxture/vxture-karda/actions/runs/45543274150)经既有production审核成功，于2026-11-25 04:07:26 UTC（北京时间12:07:26）完成。
北京时间12:07直接读取正式域名：health=200/ok、ready=200/ready，均返回v0.12.3/3ae8bd79/production，db/redis/storageConfig均ok。
未附会话/Bearer的主题GET及带正式Origin的主题POST均401，仅unauthenticated错误，使用固定不存在UUID不读客户资产。
公开探针不替代已登录生产业务或实际Agent验收。
回滚应用目标为v0.12.2的 `7cca363fa0cf860e22bfd5b906a76aaef3db9d93`；保留增量表，使用正常rollback及审核。

## 3. 清单

固定17项仍7完成/10未完成。K2b/K5新增独立主题页汇编、不可变草稿与按主题版本失效子项。
模型主题摘要、跨库/预设库、真实Agent/SOP与外部事件/业务验收继续保持未完成；不得把草稿回存当人审/业务切换通过。

本轮只读复核外部依赖：可访问的 `vxture/vxture-ontos` main仍是初始提交a432c86，仅README（企业本体知识引擎），没有可消费的发布Schema/规则合同，不能据此关闭K4真实联调；不推断其他未提供交付源的状态。
平台授权事件[#731](https://github.com/vxture-platform/vxture-platform/issues/731)仍OPEN。
Atlas[#147](https://github.com/vxture-foundation/vxture-atlas/issues/147)仍OPEN，内容是其他消费产品的embedding/rerank公开样本503；只作供给线索，不当作本次Karda调用或账单证据。
