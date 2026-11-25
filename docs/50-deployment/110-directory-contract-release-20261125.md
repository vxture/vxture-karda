# 知识目录分页与DOCX快照契约交付（2026-11-25）

## 1. 已合并功能及修复

| 批次 | 证据 | 交付 |
| --- | --- | --- |
| [PR319](https://github.com/vxture/vxture-karda/pull/319) | 5ff088f，PR CI45558044817及主干CI45558551821/扫描通过 | RP/OBO目录分页、当前可用知识指纹、逐页权限/来源复核、知识页上/下页及当前页Markdown |
| [PR320](https://github.com/vxture/vxture-karda/pull/320) | f1cbf49，PR CI45558706784全部1046项通过/零跳过 | 0021修复DOCX v2快照CHECK；真实Python表格→Prisma提交→服务角色回读、旧快照保留和重复迁移验证 |

目录分页为显式cursor/page_cursor，指纹包含全部当前可用关系/实体标签/事实文本、人审有效字段、来源hash/锚点和预算筛选。每页重新鉴权及核验来源，旧指纹变化409；游标不授予权限，隐藏关系不参与预算或指纹。
保持原5000行、100来源等输入预算，属于输出分页；不等同数据库分页或无限扩容。页面只保留当前页，错误先清空，导出明确仅本页。
纯函数及真实数据库覆盖31个分散片区完整分页、事实变化和attachment撤销；Playwright合成HTTP验证上/下/末页、当前页导出链接、390px及409/403清空。

PR317的DOCX解析能力此前未匹配数据库格式CHECK，v2保存会被拒绝；旧测试仅分别验证PDF落库与DOCX解析。PR320补齐这个遗漏，保留0018历史并由0021升级约束；不将此前解析通过当作落库通过。
新库与原41表库完整迁移两次，比较CHECK定义，旧0018下的v1行仍在；新测试实际提交v2、回读正文和parser，未知parser与service DELETE仍拒绝。表数保持55。
[PR321](https://github.com/vxture/vxture-karda/pull/321)将指纹改为去重实体/事实/证据表，避免共享支持的关系×证据展开，并仅在分页时于数据库计算固定长度事实文本hash。5000关系共享5000证据本机约24ms回归通过，PR CI45560386165全部1047项通过、零跳过。
设计和边界见[170 §30–31](../30-design/170-semantic-persistence-adapter.md)。

## 2. 发布证据

主干CI45559051371和秘密扫描45559051412均通过，固定f1cbf49385ad59da0232629797907d08803ebd2c。
[db-init45559421934](https://github.com/vxture/vxture-karda/actions/runs/45559421934)经正常production审核于北京时间14:18:06成功，日志确认0021已应用、55声明表全部存在。
v0.12.8/run45559722876在部署前因指纹内存放大问题主动取消，标签不移动，未上线。修复后使用新标签；不以迁移成功替代应用上线。

主干CI45560881319及秘密扫描45560881362均通过后，固定3b3fb0da425cac1a76939316c5cd5c42319d1aac发布v0.12.9。
[部署45561196377](https://github.com/vxture/vxture-karda/actions/runs/45561196377)经原production审核于北京时间14:37:39成功。
正式health/ready返回v0.12.9/3b3fb0da/production及db/redis/storageConfig均ok；无会话的分页首请求、坏游标、分页Markdown、topics和history均401。
这些匿名探针不代替真实Agent或登录业务验收；正常应用回滚目标v0.12.7固定daa1a24408abda541e0a113e5933cd4b5a9a4e6c，保留0021约束和不可变数据。

## 3. 剩余范围

固定17项仍7完成/6进行中/4待办（10未完成），本轮完成目录翻页子项并修复DOCX保存缺口。
更大输入、真实目录/图谱负载、复杂Office/OCR、Atlas实际账单、Agent/Ontos/platform权威以及K0/K6独立业务验收仍开放。
I1继续按用户决定暂缓，不更改平台配置、正式客户权限或价格，不自动重处理客户资料。
