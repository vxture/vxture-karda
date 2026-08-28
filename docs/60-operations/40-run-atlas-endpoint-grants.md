# 40-run-atlas-endpoint-grants - 给产品 karda 授四个 Atlas 端点

> **执行方**:运营侧(持 operator token 的人)。**不是** karda 的代码,也不是 Atlas。
> **追踪**:`vxture-platform/vxture-platform#55`(Atlas 已在该条上更正为产品轴)。
> 我方在 `vxture-platform#56` 补了执行面(每条不做会怎样、三个坑)——**执行仍以 `#55` 为准,不要两处分开追**。
> **karda 侧**:已就绪,零改动——代码发的就是下表这四个端点码(`kb/atlas/selection.ts`)。

一次性操作。做完之前 karda 的模型相关能力全部驻留;做完之后**不需要 karda 改任何代码**。

---

## 0. 次序:这一步排在上线之后,不是之前(owner 2026-08-28)

**授权是在平台管理面对一个已经注册的产品做的页面操作。** 所以次序只能是:

    发布上线 → 平台注册产品与工作区开通 → 在管理面授端点

把这份单子当成上线或开发的前提,会得到一个**闭不上的环**:要求平台给一个还没上线、
还没注册的产品授权。这份文档此前正是被这样引用的——工作计划里它长期挂着「阻塞」,
而它阻塞的其实只是**运行时的检索结果**,不是任何一步开发或发布。

由此得到本仓的一条纪律:**产品必须在未授权状态下正常构建、正常发布、正常运行**,
把缺的那一格具体地说出来,等平台补。这不是容忍缺陷,是承认这条依赖的真实方向。

实现上对应 `kb/processing/unavailable.ts`:「用不了」分四档,**依据是修复人不同**
——本档(端点未授权)找平台管理面,另外三档分别找运维(没配 Atlas)、平台(工作区
未开通)、库属主(模型锁指向 Atlas 没有的模型)。界面按档说清缺什么、谁在哪补;
补上之后驻留任务自动继续,已加工的部分不重做。

---

## 1. 为什么值得先做这一件

| 端点码 | 用途 | 没有它会怎样 |
|---|---|---|
| `embedding/default` | 向量化 | **一份文档都检索不到** —— 见下 |
| `rerank/default` | 精排 | 只有双路召回,无精排 |
| `chat/default` | 带引用问答 | `karda.ask` 答不出来(`no_context`) |
| `chat/extract` | 知识抽取 | 抽取每趟驻留,不写库 |

**第一条的后果比"没有向量召回"大得多,值得写清楚。** 加工管线是
`fetch → parse → chunk → embed → commit` 五档,`embed` 抛错就直接返回,**`commit`
根本不执行**;不 commit 就不写 `document.active_chunk_version`,而检索只服务版本等于
`active_chunk_version` 的块。

所以现状**不是"降级成关键词检索"**,是:**没有 `embedding/default`,karda 的语料为零。**

---

## 2. 前置

| 需要什么 | 从哪来 |
|---|---|
| operator token(`aud` = atlas,`realm=workforce`) | 平台 workforce realm 签发;运营侧持有 |
| Atlas 管理面可达 | tailnet(worker-02:3100) |
| 每个端点挂哪个模型 | **运营/产品决定**——见 §3 步骤 1 |

**karda 不提供任何输入。** 这是产品轴的用意:karda 只钉一个稳定名字,选型完全在授权侧。
(旧版本的这份单子曾要求"karda 的租户 uuid",那是走错轴的产物,已作废——见
`docs/30-design/260-external-interfaces.md` §11.1.1。)

---

## 3. 步骤

### 步骤 1 —— 确认/建立四个端点(`model.model_endpoints`)

每个端点带自己的 `fallback_model_code` 故障转移链。**挂哪个模型是这一步决定的**,
karda 不参与:

- `chat/default` 与 `chat/extract` **必须指向不同的模型配置**,理由见 §5;
- `embedding/default` 一旦被 karda 用过就**不要随意重指**,理由见 §5。

### 步骤 2 —— 给产品 `karda` 授这四个端点

```
POST /capability/product-endpoint-grants
Authorization: Bearer <operator token>

{ "productCode": "karda", "endpointCode": "chat/default",      "reason": "karda 问答" }
{ "productCode": "karda", "endpointCode": "embedding/default", "reason": "karda 向量化" }
{ "productCode": "karda", "endpointCode": "rerank/default",    "reason": "karda 精排" }
{ "productCode": "karda", "endpointCode": "chat/extract",      "reason": "karda 知识抽取" }
```

四条各发一次。**不需要租户 uuid**。

### 步骤 3 —— 唤醒驻留的活

授权到位后,已经驻留的任务不会自己动(它们在等下一次 tick):

```
POST {karda}/api/kb/processing/tick   {"resume": true}      # 加工:唤醒 embed 处驻留的文档
POST {karda}/api/kb/extraction/tick                          # 抽取:默认就恢复驻留的
```

两个端点都由 `INTERNAL_JOB_TOKEN` 保护,失败关闭。

---

## 4. 怎么知道成了

**不需要另做验证**,看这个指标停止增长即可:

```
model_request_rejections_total{code="ENDPOINT_NOT_ROUTABLE",product="karda"}
```

**注意一个坑(Atlas 点名的)**:这类 404 抛在第一条日志行之前,**既不进 `request_records`
也不进 `error_records`**——只在指标里。去日志表建监控会建出一个永远为零的看板,
而它和"一切正常"长得一模一样。

karda 侧可观察的现象,按顺序出现:

1. 加工管道页上驻留的任务从「挂起 · 能力未开通」转入运行 → 文档变 `indexed`;
2. `karda.search` 开始返回结果(在此之前它诚实地返回空);
3. `karda.ask` 开始给出带引用的答案;
4. 抽取任务从 `suspended/unavailable` 转 `done`,断言开始以 `draft` 落库
   (**注意**:`draft` 不进检索也不进 `browse`,要经裁决才提上去——这是设计,不是故障)。

---

## 5. 两条不要做的事

**不要让 `chat/extract` 和 `chat/default` 指向同一个模型配置。** 抽取是批量、长上下文、
可容忍慢;问答是交互式、要低延迟。同一个端点让**路由、计费、可观测三处都分不开**这两类
流量,将来想给抽取单独换个便宜模型就得改 karda 的代码——而 KD-018 把选型交给授权,
正是为了不必改代码。

**不要在 karda 已经索引过内容之后随意重指 `embedding/default`。** 向量空间身份随数据
落库(`chunk_embedding.model_code`,KD-107):换了模型,旧 chunk 会**退出向量召回**
(词法兜底,可见可控),直到重建为止。karda 绝不跨空间混排——这是刻意的,但重指前
应当知道代价。

---

## 6. 不在本单范围

- **opera 授权页的 `taskProfile` 输入框**(`vxture-platform#52`):那是租户轴的界面缺口,
  与本单**无关**——产品轴授权不经过它。
- **A2 深解析**:真正的挡板是**采购**(没有任何已注册模型带 `supportsVision`),
  不是授权。见 `260` §11.1.4。
