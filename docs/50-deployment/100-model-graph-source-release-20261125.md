# 模型摘要、图谱交互与表格来源交付（2026-11-25）

## 1. 可合并功能批次

| 批次 | 主干 / 验证 | 交付 |
| --- | --- | --- |
| [PR315](https://github.com/vxture/vxture-karda/pull/315) | ae037fa；PR CI45550270146全部1043项通过/零跳过；主干CI45550574162及扫描通过 | Atlas带引用模型摘要、来源/权限双重核验、不可变回存、必填理由的独立人审/CAS及失效隐藏 |
| [PR316](https://github.com/vxture/vxture-karda/pull/316) | 08e5340；PR CI45551469013、主干CI45551741581及扫描通过 | 图谱键盘平移/缩放/复位、实体/关系连续焦点及自动居中、原生选择列表、Esc退出大画布 |
| [PR317](https://github.com/vxture/vxture-karda/pull/317) | daa1a24；PR CI45552643600全部1044项通过/零跳过；主干CI45552916335及扫描45552916496通过 | 普通矩形DOCX表格按正文/行/列顺序提取，空单元格保留，UTF-16及原件/正文hash，旧快照兼容 |

模型使用既有chat/extract，不新增模型路由或商业指标。每段仅允许本次提供的证据ID，引用合法仍须人核实文字；认可摘要也不自动发布为Agent事实。
并发同请求可能执行两个模型调用，稳定taskId不是Atlas免重复收费承诺；数据库只保存一个不可变结果。真实Atlas调用/账单及业务质量另验。
图谱用合成HTTP加载500节点/1000关系：10次重载P95/max1842ms，30次实体选择P95 351ms/max353ms；键盘首尾/选择/平移/缩放/复位、证据、Esc及390px通过。
这仅为本机Next开发环境，不是生产SLO或真实业务规模验收。DOCX v2拒绝合并/缺列/嵌套/内容控件及原有不支持内容，旧离线提取8项回归通过；扫描/OCR和复杂Office仍开放。
细节见[170 §27–29](../30-design/170-semantic-persistence-adapter.md)。

## 2. 生产证据

0020迁移固定ae037faf93759ee86ba2428f95b20ef130e60d6a，[db-init45550827446](https://github.com/vxture/vxture-karda/actions/runs/45550827446)经正常production审核成功，日志确认55声明表全部存在。

v0.12.5固定ae037faf93759ee86ba2428f95b20ef130e60d6a，[部署45551105307](https://github.com/vxture/vxture-karda/actions/runs/45551105307)于北京时间13:11:05成功。
正式health/ready确认版本及db/redis/storageConfig均ok；匿名topic GET及generate POST均401，未读取客户资料或实际调用模型。

v0.12.6固定08e53407c644ae7dea79de949fca0f83021b4c13，[部署45552039923](https://github.com/vxture/vxture-karda/actions/runs/45552039923)于北京时间13:18:53成功。
正式health/ready确认v0.12.6及依赖ok，匿名knowledge-package继续401。本版无新增DDL，保留55表。


v0.12.7固定daa1a24408abda541e0a113e5933cd4b5a9a4e6c，[部署45553159505](https://github.com/vxture/vxture-karda/actions/runs/45553159505)经原production审核于北京时间13:29:58成功。
正式health/ready确认v0.12.7/daa1a244/production且db/redis/storageConfig均ok；匿名package/topics/history GET、source-search POST及topics generate POST均401。
本次无新DDL，55表保留。正常应用回滚目标v0.12.6固定08e53407c644ae7dea79de949fca0f83021b4c13；更早兼容目标v0.12.4固定683b9c086d96de2239e70bbb9cbfcfab0882015f，均保留新增0020表，不以回滚删除审计数据。

## 3. 剩余项与边界

固定17项仍7完成/6进行中/4待办，即10未完成。本轮关闭功能子项，未伪造整个执行项的业务/外部验收。
K0b仍需真实人审和独立留出；P5/K2b仍需真实Agent/OBO和tenant/platform/预设库权威；K2a仍需复杂来源及真实Atlas端到端/账单；K3b仍需真实规模和可访问性验收。
K4a等真实Ontos发布版本及确定性规则；K4b依赖它及独立评测；K5外部规则/事件和真实第二场景、K6隔离试点/回滚/业务切换保持开放。
不变更平台配置、正式客户权限、价格或用户暂缓的I1；增量表在应用回滚时保留。

只读复核：2026-11-25 Ontos仓库仍仅README，未见发布schema/rule契约；平台731仍OPEN。该观察不宣称检查了未开放的其他来源，也不替代外部团队交付。
