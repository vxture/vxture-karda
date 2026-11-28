# 公共知识分发、客户使用及 Agent 接入指南

日期：2026-11-29。软件处于阶段验证，部署证据待追加。

## 运营发布

/operations → 获正式 workforce 身份与 Karda 内容角色 → 公共库 → 填写公共分发说明（领域/主题/地域/时间/责任/边界/使用条件/模板） → 来源及知识编辑 → 提交审核 → 非编辑人独立认可 → 发布。仅保存分发说明不会开放客户目录。既有版本缺目录说明需重新审核发布。员工权限/平台接入未就绪时保持拒绝，不创建本地 owner。

本库“公共分发说明与服务交付”显示启用数、近30天交付错误及结果数；反馈可列入修订待办，修订后形成新审核发布并记录处理决定。统计不包含客户私有正文。

## 客户启用和使用

/channels/public → 筛选目录并打开产品详情 → 工作区 owner/administrator 填写启用策略 → 选择跟随当前或固定已发布版本 → 明确允许角色、必要用户和调用方产品代码 → 填原因并保存。默认 caller 只有 karda；需要 Atlas 等产品时由管理员显式添加实际已接入产品代码。未启用成员可以发现目录说明，不能读取知识正文。

当前可用成员可搜索知识条目或精确原文、查看主题/知识包/G6图谱、读取证据。每个结果展示版本、来源 hash、字符范围和官方 URL；证据和原件重新核权。多模态原件按附件下载，不在浏览器内执行；公共视觉抽取暂无正式发布模式。导出会重新查询当前授权，不导出历史缓存。客户端已下载文件不能远程收回；后续服务器交付受撤回控制。

固定版本显示升级提示；更新时对照发布时间、适用时间和目录边界，必要时调整服务并调试。库撤回或来源变化后，固定版本也不能绕过当前校验。目录为空表示暂无审核可分发产品，不创建演示业务内容填充。

## 服务与 Agent

详情选取 source/facts/context 公共模板创建租户服务草稿 → /channels/services 调试 → 预览发布影响 → 明确确认并发布。可追加当前已挂载私有库及已启用公共库；服务配置不会授予来源权限。任务上下文复用 /channels/context，保留公共版本和证据定位。

外部 Agent 复用 karda.knowledge_service 既有 OBO 工具；aud=karda、scope=tool:karda 的当前 customer 代用户票据。只提供 serviceId/requestId/capability 和对应参数，不传 workforce 管理票据，不导出令牌，不创建假租户。服务调用每次校验租户权益、成员、caller白名单、挂载、公共绑定与发布来源。公共读结果位于 result.publicKnowledge；context 证据在 publicProvenance 中携带发布定位。

HTTP客户操作接口 /api/public-knowledge 仅接受当前 RP customer；不是匿名 API。原件 /api/public-knowledge/original 同样要求当前权限和 data.export。跨产品调用通过已有服务/OBO边界，不伪造浏览器cookie。搜索计量归调用工作区；草稿调试也是真实读取。

## 反馈与排障

反馈仅主动填写公共问题，勾选不包含私有/保密内容的确认后提交；系统不自动附加查询正文、服务回答或租户知识。可跟踪受理/修订/不采纳状态。public_scope_denied：核对启用、成员、caller；public_inactive：核对撤回与有效日期；public_source_changed：等待产品发布方复核；public_changed：刷新并重试；public_request_replay：新调用使用新的requestId，同一调用不重复执行。

## 逐项验收与证据

参见[215批次清单](../70-workplan/215-public-distribution-agent-service-plan-20261129.md)。数据库夹具验证与真实平台/OBO/内容验收分开；平台757/758未闭环不标已联通。部署、迁移和正式门禁完成后补充版本、提交和运行链接。
