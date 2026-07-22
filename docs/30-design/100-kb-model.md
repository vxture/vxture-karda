# Karda 知识库对象模型与生命周期(KB Model)(100-kb-model)

> 版本:v0.1
> 状态:Draft — 待拍板项 4 项(见 §11)
> 上游文档:10-product-definition v0.3、product_110(含用户维度增补 v2)、product_210 v1.0
> 定位:Karda 文档族第一份纵深设计,定义知识库的对象模型、层级结构、元数据规范、生命周期状态机与库级配置面;为加工管线(110-processing)、检索管线与工具面(120-retrieval-tools)提供对象基础
> 设计方法:五个核心问题均按行业收敛模式裁定,行业依据随各节标注(Dify / RAGFlow / FastGPT / Guru / SharePoint)

---

## 1. 设计原则(行业收敛结论)

| # | 原则 | 行业依据 |
|---|---|---|
| 1 | **单一库类型,配置分化**:不设 FAQ 库/术语库等独立类型;分化由库级加工模板 + 条目级内容模板承载 | Dify(单库 + 分段模式)、RAGFlow(单库 + chunk method 模板)、FastGPT(单数据集 + 训练模式);行业无任何主流产品走多库类型路线 |
| 2 | **浅层级,权限单锚点**:库→文件夹(可选)→文档/条目,权限与发布阶梯只作用于库级 | Guru(Collection→Folder→Card,权限仅 Collection 级);浅层级强迫知识保持可检索粒度 |
| 3 | **元数据三段式**:系统 / 治理 / 业务,业务字段 filterable 白名单制 | Dify(内置 + 自定义字段、三种值类型、元数据过滤检索);Guru(验证人/周期/信任标识 = 治理段原型) |
| 4 | **双状态机正交**:内容主状态机与治理状态机互不干扰;治理状态以质量档位接入检索 | Guru(验证体系独立运转;Agent 按验证状态选检索质量档位;验证默认放松为选配;同步内容豁免) |
| 5 | **属主调优闭环**:库级配置面 + 召回测试为标配 | Dify / FastGPT / RAGFlow 三家标配召回测试 |

---

## 2. 对象模型

### 2.1 对象总图

```
KnowledgeBase(唯一库类型)
  ├── 归属与授权:owner(P/T/U/product 预置)、发布状态、origin_ref —— 承接 10-product-definition §4,本文不重复
  ├── 配置面(§7):加工模板 / 索引配置 / 检索默认参数 / 治理策略 / 内容模板绑定
  ├── Folder(可选,纯组织,零权限语义,单层)
  └── ┬── Document(文件型内容:上传 / Arda DataSource 同步)
      │     └── Chunk(分块,派生)── VectorIndex / FulltextIndex / GraphInstance(预留)
      └── Entry(条目型内容:结构化知识单元,遵循 ContentTemplate)
            └── 索引化:模板字段 → 检索文本 + filterable 元数据(§6.3)

ProcessingTemplate(加工模板,库级,平台预置 + org 可调参)
ContentTemplate(内容模板,条目级,平台预置 + org 自定义)
```

### 2.2 两类内容单元:Document 与 Entry

单一库类型下,库内容纳两类内容单元,可混存:

| | Document(文件型) | Entry(条目型) |
|---|---|---|
| 本质 | 外来文件的托管与理解(pdf/docx/html/md…) | 原生结构化知识单元(FAQ 对、术语、SOP 步骤卡…) |
| 结构来源 | 加工模板解析推断 | ContentTemplate 显式声明 |
| 编辑 | 不可改内容,只可改元数据(真值在源文件/源系统) | 字段级可编辑(库内即真值) |
| 行业对应 | Dify/RAGFlow 文档 | Guru Card / SharePoint Content Type 条目 |
| 索引路径 | 解析→分块→向量/全文 | 字段拼装检索文本→向量/全文 + 字段进 filterable 元数据 |

FAQ / 术语库需求的标准解法(已拍板):**加工模板选 Q&A 式(文件批量导入拆条)+ ContentTemplate 定字段(原生录入)**,零新库类型。

### 2.3 双模板机制

**ProcessingTemplate(加工模板)**——库级,决定 Document 的解析与分块行为(对标 RAGFlow chunk method):

- v1 预置清单:`general`(通用,默认)/ `qa`(问答拆分)/ `table`(表格行式)/ `manual`(手册/层级保留)/ `paper`(论文)/ `legal`(法规条款式,服务 P 级法规包);
- 模板 = 解析策略 + 分块策略 + 默认索引建议的预设包;org 可基于预置模板**调参**(分块长度、分隔符、重叠等),v1 不开放 org 自建模板(降低支持面,待需求验证);
- 库级默认 + **文档级覆盖**:单文档导入时可指定不同模板(行业通行,Dify/RAGFlow 均支持)。

**ContentTemplate(内容模板)**——条目级,声明 Entry 的字段结构(对标 Guru 卡片模板 / SharePoint Content Type):

- 模板定义:字段名、值类型(string/number/datetime/enum/richtext)、必填性、**检索角色**(每字段声明:入检索文本 / 入 filterable 元数据 / 仅存储);
- 供给分级同资产模型:平台预置模板(FAQ、术语、SOP 卡等,随 P 级机制分发)/ org 自定义模板 / 不设 user 级模板(个人直接用预置,降复杂度);
- 字段可选映射 **Ontos 语义类型**(如"产品名"字段 → Ontos 实体类型),为 v2 图谱抽取铺路,v1 仅存映射不消费;
- 模板演进纪律:加字段向后兼容;删/改字段升版本,存量条目标注旧版本、惰性迁移(不强制批量刷)。

---

## 3. 层级结构与权限锚点

- 层级:**KnowledgeBase → Folder(可选,单层)→ Document/Entry**;
- Folder **零权限语义**:权限、发布阶梯、关联清单全部只作用于库级(Guru 先例:权限仅 Collection 级);Folder 仅供属主组织整理,并作为检索的一个 filterable 维度(folder_id 入系统元数据);
- 不支持嵌套 Folder(v1):浅层级强迫知识保持可检索粒度;深组织需求 = 拆库(库是权限/发布/关联的单元,拆库即获得独立治理能力,引导正确用法);
- 库内不设"子库";库间不设引用/软链(v1,避免可见性传递歧义)。

---

## 4. 元数据规范(三段式)

### 4.1 系统段(system,只读,平台维护)

`id / owner(type+key) / kb_id / folder_id / source(upload|arda_sync|api) / source_ref(血缘) / created_in_product / created_by / created_at / updated_at / content_state(§5.1) / template_ref(加工或内容模板及版本)`

### 4.2 治理段(governance,治理角色维护)

`verification_state(§5.2) / verifier(个人或角色) / verify_interval / verified_at / expires_at / sensitivity(密级标签,预留枚举)`

### 4.3 业务段(business,属主维护)

- 库级声明自定义字段(字段名小写下划线;值类型 string/number/datetime/enum);
- **filterable 白名单制**:字段默认仅存储;显式声明 filterable 才建过滤索引——多租户下控制过滤字段的索引成本(区别于 Dify 全量可过滤的单租户做法);每库 filterable 字段数设上限(v1 建议 ≤16,含系统段常用维度);
- Entry 的模板字段按模板内"检索角色"声明自动归位,不重复配置。

---

## 5. 生命周期:双正交状态机

### 5.1 内容主状态机(content_state,系统驱动为主)

```
draft(仅 Entry 有) ──提交──→ processing ──成功──→ indexed ──属主/管理员──→ archived
                        │ 失败                        │属主删除
                        ▼                             ▼
                     failed(可重试,保留错误详情)      deleted(索引级联清除,血缘保留审计期)
```

- `processing` 含解析/分块/向量化子进度(工程细节归 110-processing);
- `failed` 为显式驻留态:文档停在失败态可见可重试,不静默丢弃(行业通病,显式化);
- `archived`:退出召回但保留内容与索引元数据,可恢复;`deleted`:索引级联清除,source_ref 血缘保留至审计期满;
- Document 无 draft(文件到达即进 processing);Entry 有 draft(编辑中不入索引)。

### 5.2 治理状态机(verification_state,人驱动,正交)

```
unverified(默认) ──验证人确认──→ verified ──interval 到期──→ stale(过期待复核)
                                     ↑──复核/隐式续验──────────┘
```

- **库级选配,默认不启用**(Guru 2026 演进:强制验证是过度治理):未启用治理策略的库,全部内容恒为 `unverified` 且不产生任何治理负担;
- **隐式续验**(Guru 机制):验证人编辑内容即视为复核,重置周期;
- **Arda 同步内容默认豁免**:真值在源侧,不强加本地验证义务(库级可显式开启覆盖);
- 治理状态**不影响**内容主状态与可召回性本身——它以质量档位方式交给消费方(§5.3)。

### 5.3 治理状态接入检索:质量档位(行业最佳,直接采纳 Guru 模式)

检索入参新增 `verification_filter`,三档:

| 档位 | 范围 | 适用 |
|---|---|---|
| `verified_only` | 仅 verified | 受监管/高风险场景 |
| `verified_and_untracked`(**默认**) | verified + unverified(未启用治理的内容) ,排除 stale | 平衡质量与覆盖 |
| `all` | 全部含 stale(结果标注治理状态) | 最广覆盖 |

- 默认档语义:**启用了治理却过期的内容(stale)默认不召回**——启用治理即承诺维护;未启用治理的内容正常参与——不惩罚轻量使用者;
- 档位为检索入参,agent/技能可按场景指定;结果条目一律携带 verification 元数据供消费方展示信任标识;
- 本入参进入 `karda.search` / `karda.ask` 工具 schema——登记为对 120-retrieval-tools(工具面)的输入。

---

## 6. 索引化规则(对象→索引的映射约定)

- Document:加工模板产出 Chunk;Chunk 为召回单元,携带其 Document 的系统/治理/业务(filterable)元数据副本用于召回过滤;
- Entry:按 ContentTemplate 字段检索角色拼装检索文本(如 FAQ = question 加权 + answer),整条为召回单元;filterable 字段直接入过滤索引;
- 召回过滤维度(v1 固定集 + 白名单):kb_id(可见集白名单,权限硬过滤)/ folder_id / source / content_state=indexed(硬条件)/ verification_state(按档位)/ 业务 filterable 字段;
- GraphInstance 预留位:Entry 的 Ontos 映射字段与 Document 的图谱抽取共用实例存储(归属随待拍板 #1)。

---

## 7. 库级配置面(清单与默认值)

| 配置组 | 配置项 | v1 默认 |
|---|---|---|
| 加工 | ProcessingTemplate + 参数(分块长度/重叠/分隔符);文档级可覆盖 | general |
| 索引 | 向量(embedding 模型经 Atlas,库级锁定版本)/ 全文开关 / 图谱开关(v2) | 向量+全文开,图谱关 |
| 检索默认 | top_k / 混合权重 / rerank 开关 / verification_filter 默认档 | rerank 开;verified_and_untracked |
| 治理 | 启用开关 / 默认 verifier / 默认 interval / 同步内容豁免开关 | 治理关;豁免开 |
| 模板 | ContentTemplate 绑定清单(库允许哪些条目模板) | 不绑定(纯 Document 库) |
| 调优 | **召回测试**入口(模拟提问→展示召回与得分) | v1 Console 标配 |

---

## 8. 与既有模型的衔接(零冲突确认)

- 权限/发布/关联全部作用于库级 → 与发布阶梯(库级状态)、关联清单(关联对象=库)、SharingGrant(resource=库)完全对齐,层级设计未引入任何新授权面;
- P 级知识包 = 平台供给的 KnowledgeBase(通常 legal/manual 模板 + 可含平台 ContentTemplate);实例化落 T 级后配置面全开放给 WS 管理员;
- product 预置库同用本模型,仅消费路径不同(不进关联清单);
- 对 110-processing(加工管线)输出约束:模板参数集、failed 驻留态、增量更新以 Document 为单元;
- 对 120-retrieval-tools(检索/工具面)输出约束:verification_filter 入参、召回过滤维度固定集、Entry 检索文本拼装规则。

---

## 9. 行业对标速查

| 设计点 | 采纳来源 | 有意偏离及理由 |
|---|---|---|
| 单库类型 + 加工模板 | RAGFlow chunk method | — |
| 条目 + 内容模板 | Guru Card 模板 / SharePoint Content Type | 不设 user 级自定义模板(降复杂度) |
| 浅层级、权限单锚点 | Guru Collection 模式 | Folder 不嵌套(比 Guru 更严,引导拆库) |
| 元数据自定义 + 过滤检索 | Dify metadata | filterable 白名单制(Dify 全量可过滤,多租户成本不可接受) |
| 验证选配、隐式续验、同步豁免、质量档位 | Guru verification 体系 | 默认档排除 stale(Guru 默认更宽);发布审批不另建(阶梯已覆盖) |
| 召回测试 | Dify/FastGPT/RAGFlow 标配 | — |

---

## 10. 明确不做(v1)

org 自建加工模板;Folder 嵌套;库间引用/软链;user 级 ContentTemplate;条目协作编辑(多人同时编辑、评论——Guru 有,我们的内容生产哲学是接入而非编辑器,Entry 编辑为单属主轻量能力);治理状态的审批工作流(晋升阶梯已承担管理审视职能)。

---

## 11. 待拍板项

| # | 决策项 | 说明 | 倾向建议 | 状态 |
|---|---|---|---|---|
| 1 | Entry 编辑权与 U 级库发布的交互 | ws_published 后的 U 级库,Entry 是否仍仅属主可编辑 | 是——发布改变可见性不改变写入权(与 Document 一致);协作编辑需求引导至 T 级库 | ⏳ |
| 2 | filterable 字段上限值 | 每库 filterable 字段数(含系统维度) | 16;超限需求属滥用信号,引导拆库或收敛字段 | ⏳ |
| 3 | v1 预置 ContentTemplate 清单 | 首批平台条目模板 | FAQ / 术语 / SOP 卡三个;与首个 P 级知识包选型联动 | ⏳ |
| 4 | archived 保留策略 | 归档内容的存储计费与保留期 | 归档占存储计入配额(半价或全价随 L0 计费定);不设自动清除 | ⏳ |

---

## 12. 联动修订登记

- 10-product-definition v0.3 §4.1 对象模型细化指向本文档;§5 配置项与本文 §7 对齐;
- 110-processing(加工管线,第三轮)/ 120-retrieval-tools(检索管线与工具面,第二轮):本文 §8 输出约束为其输入;
- product_210 实现清单:`karda.search`/`karda.ask` schema 含 `verification_filter`;
- Ontos 接口契约:ContentTemplate 字段的语义类型映射(v1 存不消费,契约可后置)。
