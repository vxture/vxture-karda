# 260 对外接口登记册

> 状态:v0.1(2026-08-26 建立)
> 定位:karda **一切对外调用面**的单一登记册——接口、调用方式、实现状态。
> 上游权威:`120-retrieval-tools`(检索求值链)、`200-arda-channel`、
> `230-runos-channel`、`140-assertion-model`、平台 `product_210`(工具协议)。

---

## 1. 为什么单独立这一份

工具面清单原先分散在 `120-retrieval-tools` §6、`230-runos-channel` §3、
`200-arda-channel` §4,各自只写自己那一条通道。后果是**它漂了两次**:
`karda.get_evidence`(`#150`)与 `karda.find_entity`(`#152`)都已上线,而
`120` §6 的表里还是七件。没有一处能回答「karda 现在对外有哪些口、分别通不通」。

这份登记册就是那一处。三条硬规矩:

1. **只登记对外面**。Console 自己的 `/api/kb/*`、`/api/pipeline/*` 等由浏览器
   会话调用,不属于对外接口,不进本册(§7 给出边界判据)。
2. **接口 + 方式 + 状态三者同行**。只有形状没有状态,就是又一张会漂的表。
3. **权威仍在原设计稿**。本册不重述语义与理由,只登记「有什么、怎么调、通不通」,
   每行给出权威出处。语义变更改原稿,本册跟着改状态。

**面向人的那一份在 Artifact 文档集里**:`Karda 接口文档`
(<https://claude.ai/code/artifact/52d5508d-b0c4-43f4-b552-b874fcd1c8c0>),按**谁能调**
把 47 个端点分成会话 / S2S / 机器作业 / 公开四类,是给人读和对外分享的那一面。
**本册是权威,它是投影**——但投影漂了就等于没有:本册建立时它没有同步更新,工具面
停在八件、抽取 tick 缺席、对端需求整节没有。**改本册必须同改它**,见 §10。

---

## 2. 状态词表

| 标记 | 含义 | 判据 |
|---|---|---|
| **已交付** | 代码在 `main`,并已自验 | 单测 + 真库探针或离线 Mock 全绿 |
| **已实现·未激活** | 代码在,线上不通 | 缺配置(env / grant / DDL 增量)或缺对端注册 |
| **待对端** | 我方就绪,挡在别人身上 | 必须带 issue 号,否则不许用这个标记 |
| **未实现** | 设计有,代码无 | 设计稿有条目 |
| **不做** | 明确排除 | 必须指向裁定出处 |

「待对端」不带 issue 号就退回「未实现」——**否则这个标记会变成拖延的藏身处**。

---

## 3. 入站:agent 工具面 `karda.*`

十件工具,两条通道。同一套 `buildToolBackends()`,**一个知识服务,两扇门**。

| 工具 | 模式 | 计量 | 直连 S2S | Runos MCP | 权威 |
|---|---|---|---|---|---|
| `karda.search` | OBO/service | per_call | 已交付 | 已实现·未激活 | `120` §6 |
| `karda.ask` | OBO/service | per_call | 已交付 | 已实现·未激活 | `120` §6 |
| `karda.list_kbs` | OBO/service | 免计量 | 已交付 | 已实现·未激活 | `120` §6 |
| `karda.get_evidence` | OBO/service | **免计量** | 已交付 | **未实现** | `140` §8 |
| `karda.find_entity` | OBO/service | per_call | 已交付 | **未实现** | `140` §8.1 |
| `karda.get_context` | OBO/service | **免计量** | 已交付 | **未实现** | `140` §8.3 |
| `karda.attach_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.detach_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.create_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.write_document` | 直连**仅 OBO** / Runos 可 service | per_doc | 已交付 | 已实现·未激活 | `230` §2 |
| `karda.create_entry` | 直连**仅 OBO** / Runos 可 service | per_doc | 已交付 | 已实现·未激活 | `230` §2 |

**这张表暴露的第一件事:断言层的三件工具只在直连通道上。** Runos 面仍是五件
(`search` / `ask` / `list_kbs` / `write_document` / `create_entry`)。这不是遗漏,
是**代价不对称**:Runos 在端点注册时 live-pull `tools/list` 并逐项比对,加一件工具
等于改注册契约(`tools_list_mismatch`),必须与 runos 线协同——不是一次自由的追加。
补齐的前提是 Runos 通道先注册成功(`vxture-runos#156`)。

**第二件:三件 `*_kb` 在 Runos 面标「不做」而非「未实现」。** 关联清单是
user × product 的概念,而 Runos 通道整条是 service 模式、无用户主体——这些工具在
那条通道上没有语义,不是还没做。

### 3.1 两条通道的调用方式

| | 直连 S2S | Runos MCP |
|---|---|---|
| 端点 | `POST /api/tools/{tool}`(不带 `karda.` 前缀) | `POST /api/mcp` |
| 协议 | JSON body,JSON 响应 | JSON-RPC / MCP Streamable HTTP,**无状态**(一 POST 一次完整往返,无 session、无 SSE) |
| 鉴权 | S2S bearer,`aud=karda`,tailnet only | 通道凭据(账户级,网关注入) |
| 租户上下文 | 走 token | **走参数** `org_id` / `workspace_id`——网关不透传调用方身份 |
| 模式 | OBO 或 service | 一律 service |
| 库范围 | 可省略(取用户关联清单) | `kb_ids` **必填**,按 preset 合并 |
| 发现 | `GET /.well-known/vxture-tools`(S2S,tailnet,**永不公开**) | `tools/list` |
| 计量落账 | supply ledger `channel="direct"` | supply ledger `channel="runos"` |

---

## 4. 入站:HTTP 端点

| 端点 | 方法 | 调用方 | 鉴权方式 | 状态 |
|---|---|---|---|---|
| `/.well-known/vxture-tools` | GET | agent 宿主 | S2S `aud=karda`,tailnet | 已交付 |
| `/api/tools/{tool}` | POST | agent 宿主 | S2S `aud=karda`,tailnet | 已交付 |
| `/api/mcp` | POST | Runos 网关 | 通道凭据,tailnet | 已实现·未激活(`vxture-runos#156`) |
| `/api/connectors/ingest` | POST | connector runtime | `x-internal-job-token` | 已交付 |
| `/provisioning/webhook` | POST | 平台(C3) | HMAC over **原始字节** + 时间戳,幂等 + 有序 | 已交付 |
| `/auth/callback` | GET | 浏览器(OIDC 回跳) | code + state + PKCE | 已交付 |
| `/auth/backchannel-logout` | POST | 平台 IdP | logout_token 验签 | 已交付 |
| `/api/health` | GET | 编排/探活 | 无(**零依赖**:不碰 DB / Redis / 上游) | 已交付 |
| `/api/kb/processing/tick` | POST | 调度器 | `x-internal-job-token` | 已交付 |
| `/api/kb/governance/sweep` | POST | 调度器 | `x-internal-job-token` | 已交付 |
| `/api/kb/extraction/tick` | POST | 调度器 | `x-internal-job-token` | 已交付——**与加工 tick 分开**(KD-211),抽取是 bulk、无人等待,慢抽取不该拖住上传 |
| `/api/usage/flush` | POST | 调度器 | `x-internal-job-token` | 已交付 |
| `/api/kb/admin/seed-presets` | POST | 运维一次性 | `x-internal-job-token` | 已交付(**生产尚未跑过**,TD-006 尾巴) |

`x-internal-job-token` 一律**失败关闭**:未配置 env 即全部 403,不存在「没配就放行」。

**不进本册的**:`/api/kb/*`(除 `admin` 与 `processing/tick`)、`/api/pipeline/*`、
`/api/evaluation/*`、`/api/channels/*`、`/api/overview`、`/api/shell`、`/api/status`、
`/api/entitlement`、`/auth/login` `/logout` `/session`——它们由 Console 自己的浏览器
会话调用,判据见 §7。

---

## 5. 入站:平台三通道

| 通道 | 形态 | 状态 |
|---|---|---|
| C1 身份(OIDC RP) | 我方是 RP:授权码 + PKCE、后端通道登出、会话 cookie | 已实现·未激活(待平台注册 OIDC client 对 `karda` / `karda-beta`) |
| C2 权益 | **出站**读取,见 §6 | 已实现·未激活 |
| C3 开通 + 用量 | 入站 webhook(本节)+ 出站 consume(§6) | 已实现·未激活 |

三条都是模板继承、离线 Mock 全绿;**激活缺的是平台侧注册,不是代码**
(`docs/50-deployment/10-platform-registration-checklist.md`)。

---

## 6. 出站:karda 调别人

| 对端 | 接口 | 方式 | 状态 |
|---|---|---|---|
| Atlas | `POST {ATLAS_BASE_URL}/v1/embed` | bearer `aud=atlas`,taskProfile `karda.embed` | 已实现·未激活(缺 env + grant) |
| Atlas | `POST /v1/rerank` | taskProfile `karda.rerank` | 已实现·未激活 |
| Atlas | `POST /v1/chat` | taskProfile `karda.ask` | 已实现·未激活 |
| Atlas | `POST /v1/chat` | taskProfile `karda.extract`,`temperature: 0` | **已实现·未激活**——授权未到位,Atlas 返 `404 TASK_PROFILE_NOT_ROUTABLE`,我方**驻留可恢复**而非失败(`vxture-atlas#39` OPEN) |
| Atlas | A2 深解析 | 请求页形态未定 | **未实现**——我方的请求侧问题**在对端仓里没有编号**(§11.1);`#102` 是 atlas 通知我方**响应**形状变了,不是我方的提问。不猜线上形状 |
| 平台 | `GET {PLATFORM_API_URL}/platform/entitlements?workspace_id=&product=` | `x-vxture-internal-auth` | 已实现·未激活 |
| 平台 | `POST {PLATFORM_API_URL}/usage/consume` | `x-vxture-internal-auth`,幂等键,配额尽 → 不重试 | 已实现·未激活 |
| Arda | 按 ref 回拉内容 | notify-then-pull | **未实现**(框架与入站端点已就位,arda 侧 driver 未写) |

**模型按 grant 走,不按配置走**(KD-018):taskProfile 由 Atlas 侧授权决定用哪个模型,
karda 不在自己这边选型,也不该出现模型名。

出站一律经 `assertInternalTarget()` 做 egress 守卫——**目标必须落在内网面**。

---

## 7. 什么算「对外接口」

判据一条:**调用方是不是另一个系统**。

- 是 → 进本册。agent 宿主、Runos 网关、平台、Arda、调度器、Atlas。
- 不是 → 不进。Console 页面调自己的 `/api/*`,那是同一个部署单元的内部拼装,
  形状随页面改,登记它只会制造第二处会漂的表。

边界情形按调用方判,不按路径判:`/api/kb/admin/seed-presets` 挂在 `/api/kb` 下,
但调用方是运维脚本,所以进册;`/api/entitlement` 看着像通道,但它读的是**当前浏览器
会话**的权益,所以不进——真正的 C2 出站在 §6。

---

## 8. 未实现与已规划

| 接口 | 依赖 | 状态 |
|---|---|---|
| `karda.browse` | 断言 + 实体分页 | **未实现——下一件** |
| `karda.retrieve` | 检索单元化 | 不做(本轮),`140` §10 |
| 断言抽取的**调度** | —— | **已交付**:`incr/0008` 任务种类 + 抽取 pass + 独立 tick |
| 断言抽取**实际产出断言** | Atlas `karda.extract` 授权 | **待对端** `vxture-atlas#39`;在那之前每次调用驻留,不写库。**不复用 `karda.ask` 标签**(§11.1.2) |
| Runos 面补齐两件断言工具 | Runos 通道先注册成功 | 待对端 `vxture-runos#156` |

---

## 9. 怎么让这份表不再漂

漂的根因是**没有机器检查**:`120` §6 是纯散文,加一件工具没有任何东西提醒去改它。

- 工具面已有契约测试钉住件数与集合(`kb/tools/tools.test.ts`),**加一件工具必然
  改红它**——这一条已经生效,`#152` 就是被它逼着从九改到十的。
- 本册 §3 的行与 `catalog.ts` 的 `TOOLS` 一一对应,由
  `scripts/guardrails/check-interface-register.mjs` 钉住(入 `quality-gate`,
  必过检查)。两个方向都是硬失败:**上线未登记**、**已删仍登记**。
  已双向验红——只会绿的检查器等于没有检查器。
- 该检查**故意不校验** mode / metering / 各通道状态。那些是本册记录的**判断**,
  代码确认不了;一个去猜它们的检查器要么判错,要么逼这份文档只能重复代码已经
  说过的话,那就没有存在价值了。**「有哪几件」是事实,可以机器判;「通不通」
  是判断,只能人写。**
- `120` §6 的表已删,改为指向本册——**一份清单只留一处**。

---

## 11. 我方向对端提出的需求

§4 / §6 登记的是**接口**,这一节登记的是**要求**——我方在等别人做什么、等多久了、
不做会怎样、有没有退路。原先它们散在 workplan 的阻塞表一行、两条 issue、和 §6 的
状态列里,**没有一处能回答「karda 现在总共卡在 Atlas 哪几件事上」**。

规矩沿用 §2:**一条需求没有对端仓的 issue 号,就不算提出来了**,状态退回「未实现」。

### 11.1 Atlas(四条,全部 open)

| # | 我方要什么 | 不给会怎样 | 退路 | 开了多久 |
|---|---|---|---|---|
| `vxture-atlas#4` | 三条 taskProfile 授权:`karda.ask` / `karda.embed` / `karda.rerank` | **检索与问答整条链驻留**:embed 进不了向量、rerank 不精排、ask 不生成 | 运维**直接调授权 CRUD API** 配好,不必等界面 | 2026-08-21 |
| `vxture-atlas#39` | 第四条:`karda.extract` | 抽取每趟驻留,不写库(`#154` / `#156` 已按此建好) | **无。对端明确建议不要走**——见 §11.1.2 | 2026-08-26 |
| ~~`vxture-atlas#21`~~ | ~~`/v1` 契约以类型包或夹具发布~~ | —— | —— | **已交付**,见 §11.1.3 |
| **未提出,且提了也没用** | A2 深解析的**请求页**形态 | 深解析仍永久失败 | 不需要——真正的挡板是**采购**,见 §11.1.4 | —— |

### 11.1.1 前两条是同一个阻塞点,而且不是工程阻塞(对端终态答复 2026-08-26)

Atlas 在 `#4` / `#39` 上给了**终态答复:Atlas 侧无待办**。授权链他们已在自测栈上
端到端实测:授权不存在时返 `404 TASK_PROFILE_NOT_ROUTABLE`;
`POST /capability/tenant-model-grants` 带 `taskProfile` 返 **201** 并原样回显
`state: active`;同一请求再发就带出解析到的 `modelCode`;阴性对照(另一个不存在的
画像)仍 404,**没有连带放行**。

缺的只是 **opera 授权页没有 `taskProfile` 输入框**——已落
`vxture-platform/vxture-platform#52`。所以这两条**不该分别去追 Atlas,它们等的是
同一个界面字段**;而且在界面补上之前,**运维直接调 CRUD API 就能配上**,代价只是
绕过界面的审计与回显(事后从 `audit.change_records` 反查)。

执行时两个易错点(对端点名):

- **`modelId` 是 uuid,不是 `modelCode`**,用 `GET /capability/models` 取;
- 列表端点**拒绝**未知过滤器而不是忽略(传 `limit` 会收到 `CAPABILITY_UNKNOWN_FILTER`
  并附可接受清单)——在检索上,**被忽略的过滤器比被拒绝的危险**。

生效判据不需要另做验证:`model_request_rejections_total{code="TASK_PROFILE_NOT_ROUTABLE",
product="karda"}` 停止增长即是。(这类 404 抛在第一条日志行之前,两张 reqlog 表里都没有。)

### 11.1.2 退路作废:对端建议宁可继续驻留,也不要复用 `karda.ask`

我方原先记的代价是「抽取与问答同价」。**对端指出代价不止于价**,并建议不要走:

同一个标签意味着**路由、计费、可观测三处都分不开抽取与问答**。抽取是批量、长上下文、
可容忍慢的;问答是交互式、要低延迟的——绑在一个标签上,Atlas 无法给它们指不同的模型。
将来想给抽取单独换一个便宜模型,**得改 karda 的代码,回到 KD-018 之前**。而
`taskProfile` 这根轴存在的全部理由,就是让这件事由授权配置决定而不是由消费方代码决定。

**采纳。** 驻留是可恢复的、不写数据、不计费;标签混用是要还的债,还的时候要动我方代码。
§8 的退路列已改。

### 11.1.3 `#21` 已交付——剩下的活在我方这边

对端答复「已交付,请关闭」,而且**已经在生产上跑了三个版本**:

| 我方要的 | 载体 | 上生产版本 |
|---|---|---|
| 错误词表(42 码,4 条可重试) | `GET /.well-known/vxture-contract` 的 `errorCodes` | v0.5.0 |
| 请求形状(四个面各自必填 + 缺了回哪个码) | 同一端点的 `requests` | v0.6.0 |

当前生产指纹 `c1-e132a38fae1a`,**用我方 `/v1` 现有的同一个 S2S 令牌就能拉**。

所以这一条**不再是「待对端」,是我方待办**:去消费那份制品,而不是继续人工抄码表——
`#100` 那次(我方写了 `QUOTA_EXHAUSTED`、真码是 `QUOTA_EXCEEDED`)正是人工抄的产物。
**但现在先不要钉指纹**:对端有一个 PR 待合,合后指纹移到 `c1-d2ecccf5b20d`,他们会在
`#21` 上通知。

对端同时如实告知一处不足(其 TD-051):契约**只发布必填、不发布可接受**,且
`errorCodes` 是扁平全局表而 `requests` 按面划分——所以 `/v1/embed` 的消费方拿到全部
43 个码,**没有任何东西说明这个端点能发出其中哪些**。消费时按面收窄要靠我方自己判断。

### 11.1.4 A2 那条:自评被证实准确,但真正的挡板是采购

对端核过 Atlas 的 issue 列表,**确认我方那四个问题确实没有编号**,我方把它记为
「未实现」而不是「待对端」的自评是准确的。

但**即使提出来,Atlas 现在也给不了,而卡点不是接口未定**:`/v1/parse` 的代码路径完整
且 provider-agnostic,它按 `config.supportsVision: true` 开门,而**没有任何已注册模型
带这个标志**,于是返回契约内的 `501 MODEL_NOT_IMPLEMENTED`(其 TD-003);
`atlas.parse` 的工具描述符被**刻意扣留**不发进清单——描述符表达不了「已定义、尚未提供」,
发出去等于告诉我方它可用(其 TD-019)。

**买哪个视觉模型是产品/成本决定,不是工程决定;注册一个真支持视觉的模型即可零代码解除。**
所以「不阻塞 MVP」的结论对,但理由要改:挡板是采购,不是接口未定。

另外**请求形状其实已经发布了**,就在 `requests["/v1/parse"]` 里——顺着我方这条,对端还
查出自己一处缺陷(`task` 字段运行时强制却没发布,缺失与填错共用一个码),已修。

### 11.1.5 那么这三条该不该关

| # | 该不该关 | 为什么 |
|---|---|---|
| `#21` | **该关** | 对端点名要求关闭,制品已在生产跑三个版本。剩余的活在我方,不该挂在对端板上 |
| `#4` | **不关** | 它跟踪的是**结果**(三条标签实际配上),而结果还没发生。对端自己也写明「保持 open 直到配上」 |
| `#39` | **不关** | 同上,且我方已在生产上发这个标签、每次收 404,是有时间压力的那一条 |

**「Atlas 侧无待办」不等于「这件事完了」。** 关掉一条尚未兑现的需求,等于把它从唯一
还看得见它的地方删掉——这正是 §11 开头那条规矩要防的事。

### 11.2 其他对端

| 对端 | 需求 | issue | 不给会怎样 |
|---|---|---|---|
| runos | 能力端点注册(`karda.kb-read` / `karda.kb-write`) | `vxture-runos#156` | Runos 通道能收不被发;直连 S2S 不受影响 |
| platform | 发布五档套餐,C2 才有权益可解析 | `vxture-platform#371`(KD-207 已裁定) | C2 把每个工作区都解析为未订阅——**唯一还挡着产品的那条** |
| platform | opera 授权页补 `taskProfile` 字段 | `vxture-platform#52` | 上面 Atlas 前两条的共同上游 |
| arda | 内容通道五个问题 | —— | 一个 connector,不是依赖(KD-104) |

---

## 10. 联动修订登记

| 何时 | 必须同改 |
|---|---|
| 增删 `karda.*` 工具 | 本册 §3 + `kb/tools/tools.test.ts` 件数断言 |
| 改 Runos 暴露的 operation 集 | 本册 §3 + `230` §3 + **与 runos 线协同**(注册契约) |
| 新增内部作业端点 | 本册 §4 |
| 新增出站对端 | 本册 §6 + egress 守卫白名单 |
| 任一「待对端」的 issue 关闭 | 本册对应行状态 + §11 |
| 向对端提出新需求 | 本册 §11——**先开 issue 再登记**,没有编号就不算提出来了 |
| **本册任何一节有实质变化** | Artifact `Karda 接口文档`(§1 给出链接)——它是本册面向人的投影,漂了就等于没有 |
