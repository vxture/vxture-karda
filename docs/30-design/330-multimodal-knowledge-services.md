# 多模态知识加工与证据服务

日期：2026-11-28。状态：批准范围M1–M6＋R1/R2已完成并上线v0.12.58。正本：[211计划](../70-workplan/211-multimodal-knowledge-service-center-20261128.md)。

## 1. 组件选型与范围

复用现有pypdf6.21.4/Poppler执行PDF页清单与逐页渲染；新增固定Pillow13.0.0（MIT-CMU，所有运行wheel SHA256列入requirements）处理PNG/JPEG的EXIF方向、解码、归一化与裁剪。前端采用受保护的派生PNG＋SVG区域叠加，不增加PDF.js，避免PDF与图片使用不同坐标底座。复用标准zipfile/XML进行有界OOXML图片关系与单元格适配，不执行宏或外链，不重建Office渲染套件。

原件最多8MiB、PDF/视觉对象最多300项、原始图片最多2000万像素；派生图最长边1600、PNG不超过4MiB。PDF按原页号单页渲染，每次最多一页OCR请求，沿用Atlas /v1/parse。只对显式启用OCR且无原生内容的对象识别；可选择统一归一化区域，OCR区域坐标映射回原整页派生图。图表/公式自动理解未接入，支持人工结构化编辑/导入及审阅。

Office支持DOCX/PPTX内嵌PNG/JPEG、Word/PowerPoint原生表格与XLSX工作表单元格及合并范围。来源定位使用部件路径、图片序号、表格行列或工作表地址；不伪造Word印刷页码。公式保留文字，不执行计算。非PNG/JPEG嵌图注明覆盖缺口；不支持格式不能标为全视觉覆盖。

## 2. 持久模型与生命周期

0048新增visual_run/visual_asset/visual_revision/visual_event四表，合计106表。baseline、Prisma、增量与列级授权锁步。run固定原件hash、原件活动文字版本、加工模式/页范围/区域与元数据清单；asset保存逐项定位、草稿、派生图引用、租约、尝试和当前认可指针；revision保存不可变修订、性质、来源方式和审阅；event记录CAS命令与结果，不写正文。

计划planned → 显式start → active → 后台逐项处理 → review → 逐项save/accept/reject → complete（完整或显式部分覆盖）。支持pause/resume/cancel、显式失败重试。已认可内容被编辑或拒绝立即撤销当前消费指针；restore复制为新认可版本，旧版本永不改写。来源版本/hash改变不能继续确认旧计划。

后台复用现有应用启动与平台准入模式：每轮最多10个active计划、每计划一项，数据库租约保护多进程。渲染和模型调用在数据库事务外；入库前重新检查当前权限、来源、计划状态与租约。取消/暂停停止后续领取并使迟到结果无权写入。已提交且超时、租约过期或取消的调用标unknown，需显式承认可能重复用量后重试，不承诺恰好一次计费。

## 3. 来源表示与正式知识

新视觉表示与旧文字快照分开存储，不改写原件历史UTF-16偏移。转录、表格、图表解释、示意图解释与公式分别有kind/nature/origin和bbox；人工保存强制origin=human，不能把导入内容伪装成原生或OCR结果。区域须在0–1内，表格行列/合并必须一致且不能重叠。

明确认可后可交接为新的text/plain资料，含视觉对象/认可版本/原件hash/定位/内容性质与限制说明；走现有资料容量约束、加工及知识生产审核流程。该派生资料不等于已发布事实，表格说明/图表解释不能自行批准知识。原始文件与历史文字坐标保持不变。

派生资料source_ref关联visualAssetId/visualVersionId/visualSourceDocument/visualSourceHash。原文检索、语义知识包、旧引用上下文/证据、旧检索文本解析与派生资料下载检查当前认可版本和父来源。撤回认可、来源变化或计划取消后不得返回旧派生知识。正式知识包附visualEvidence供图谱回到普通消费者视觉证据页。

## 4. 服务与安全边界

管理：GET/POST /api/kb/:id/visual；GET /visual/preview为属主审阅预览；GET /visual/export核验当前export权限后导出认可内容。后台计划与审阅要求当前Karda属主及写权限，OCR启动/执行额外要求ai.use。

消费：POST /api/visual-knowledge（RP）与OBO karda.visual_knowledge共享读取服务。kb_ids必须显式列出且全部通过当前空间/可见性/调用产品挂载授权。可按query/kind/document_id/page检索，asset_id＋version_id选择当前认可对象。查询仅基于已认可文字、表格与说明；没有图像向量检索或图片输入检索。

图像：GET /api/kb/:id/visual/image?assetId=...&versionId=...为登录受保护PNG；OBO工具传image=true返回有界PNG base64，可传region=[x1,y1,x2,y2]。默认只有资源引用，资源ID/URL不是访问凭证，取图再次检查当前角色、挂载、来源、认可版本与消费开关；无永久公开URL。JSON不超过2MiB，取图不超过4MiB、最长边1600。失败不返回旧图。

visual_knowledge无生成调用且不新增检索计量；OCR沿用Atlas实际用量/任务追溯。knowledge_service新增visual能力，复用既有版本/权限/trace；context配方新增visual分区，知识性质为visual_source，保留结构化视觉引用，不伪造文本来源偏移。context整包按完整单元/字节选择；图片在独立调用中按需获取，避免无限base64包。当前知识指纹纳入视觉运行/资产/认可版本变化。

## 5. 页面使用

管理入口/pipeline/multimodal，库内导航、真实作业中心均可进入。选择库和资料 → 原生或OCR模式、可选序号/区域 → 填原因创建计划 → 检查计划后start → 查看逐页状态 → 选择对象 → 原图/结构化草稿对照、区域高亮、合并格编辑、明确空白/限制 → 保存 → 勾选核对后认可/拒绝 → 确认全量或部分范围 → 按需交接生产。

消费入口/channels/visual，支持查询与直接证据链接、区域高亮和表格展现。服务中心可发布visual能力，任务上下文中心可选择visual分区并查看证据链接。失败或修改清空旧响应；没有演示统计。

JSON草稿导入需匹配当前assetId/sourceHash，并经过完整payload校验；常规编辑不要求内部ID。高级JSON仅为补充。导出前重新核验，导出的外部副本无法远程撤回，应在Agent使用前重新核验；不导出令牌和永久资源链接。

## 6. 对象保留与迁移回退

派生PNG经过现有ReservedObjectStore容量预留，元数据落库使用相同workspace storage锁并检查ready状态/字节。清理器纳入visual_asset.image_ref引用，历史/当前视觉对象保留期间不误删图片。无引用的中断产物仍由原安全回收机制处置。

新应用需先执行0048再部署；旧应用忽略新表，旧服务能力保持兼容。0047能力约束同步扩为visual兼容超集，以保证含visual调用的库再次全量重放迁移时不被旧增量缩窄。配方/审阅回退生成新版本；应用回退按既有发布流程，不删除新表或历史记录。

## 7. 验收与实际限制

阶段集中验收包括真实24页PDF清单/尾页渲染、方向和裁剪、Office图片部件/表格合并、Atlas请求/结果契约、真实数据库24项恢复与审阅回退、当前图片/派生知识撤权和来源变化、未知调用恢复与取消迟到保护，以及旧服务/旧库升级兼容。

真实Atlas成功识别及账单、真实外部Agent、登录后生产页面点击和业务语料质量分别留证；隔离适配器测试不冒充模型效果。没有自动图表/公式理解、音视频转写/帧服务、跨模态向量召回、Office完整视觉布局或任意超限文件支持。I1保持暂停，不开发Ontos。
