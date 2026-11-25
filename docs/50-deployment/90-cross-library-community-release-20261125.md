# 跨库知识包与图谱社区交付（2026-11-25）

本轮在主题草稿v0.12.3上线后继续推进剩余功能，交付[PR311](https://github.com/vxture/vxture-karda/pull/311)与[PR313](https://github.com/vxture/vxture-karda/pull/313)。

## 1. 交付证据

| 批次 | 主干 / 验证 | 范围 |
| --- | --- | --- |
| PR311 | 0793b76，主干CI45544973741通过；PR CI45544571904全部1037项通过/零跳过 | OBO知识包显式kb_ids最多20库，同快照权限/attachment交集及合计预算，同名实体保留各库身份 |
| PR313 | 6c03b8b，主干CI45546063171通过；PR CI45545741776全部1039项通过/零跳过 | 结构社区导航、确定性局部模块度优化、社区聚焦及原业务边/方向保留 |

跨库真实PostgreSQL回归覆盖两个可用库、隐藏/其他空间库排除、同名实体分离、撤销attachment后立即收窄；不允许跨库事实边或用户输入权限。
社区用当前授权图的简单无向拓扑，最多20轮/500节点/1000边，不把社区当本体分类/规则结论。
算法回归覆盖弱桥双密集团、顺序稳定、隐藏端点、自环/重复边、孤点及完整预算；浏览器合成流程验过模式切换、聚焦/返回、桥接业务边保留与390px。
设计见[170 §25–26](../30-design/170-semantic-persistence-adapter.md)。

## 2. 发布

主干683b9c0仅在上述代码后追加v0.12.3证据文档，应用代码与6c03b8b一致。
CI45546463062与秘密扫描45546463075均成功后固定 `683b9c086d96de2239e70bbb9cbfcfab0882015f` 发布v0.12.4；应用无需DDL，保持54表。
[部署45546957842](https://github.com/vxture/vxture-karda/actions/runs/45546957842)经既有production审核于2026-11-25 04:34:57 UTC（北京时间12:34:57）成功。
正式health/ready在北京时间12:35均200，返回v0.12.4/683b9c08/production、db/redis/storageConfig均ok。
未附会话/Bearer的knowledge-package/topics/history GET及带正式Origin的source-search POST均401，仅unauthenticated错误。
探针使用固定不存在UUID，不读取客户资产；不替代已登录生产、多库真实Agent或业务验收。
正常应用回滚目标v0.12.3固定提交 `3ae8bd79bde041c3a77c42149ccd699de465ef15`，保留增量表及既有审核。

## 3. 剩余项

固定17项仍7完成/10未完成，K3b因社区/历史结构对照进入建设，计为6进行中/4待办。
跨库范围只覆盖同空间user库，tenant/platform/预设库和真实Agent/OBO联调仍待合同/证据。
K3b真实规模/交互/访问性，模型主题摘要、实际SOP与外部事件同步/业务审计，以及K0/K4/K6人审、真实Ontos、试点和业务切换均保持开放。
本轮没有改变真实客户权限、平台配置、Runos service登记或价格，也不将授权当作验收通过。
