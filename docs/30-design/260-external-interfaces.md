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
| `karda.browse` | OBO/service | per_call | 已交付 | **未实现** | `140` §8.5 |
| `karda.attach_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.detach_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.create_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.write_document` | 直连**仅 OBO** / Runos 可 service | per_doc | 已交付 | 已实现·未激活 | `230` §2 |
| `karda.create_entry` | 直连**仅 OBO** / Runos 可 service | per_doc | 已交付 | 已实现·未激活 | `230` §2 |

**这张表暴露的第一件事:断言层的四件工具只在直连通道上。** Runos 面仍是五件
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
| `/api/health` | GET | 编排/探活 | 无(**零依赖**:不碰 DB / Redis / 上游) | 已交付(2026-08-30 补 025 可选字段 `uptimeSec`) |
| `/api/ready` | GET | 发布闸门/编排 | 无鉴权(身份块可公开,checks 只有 ok/fail/off);探 DB+Redis,fail -> **503** | 已交付 2026-08-30——025 §2 的第二类端点。口径:db fail=fail,redis fail=degraded(S2S 工具面不走会话,照常供给);atlas 刻意不探(对端抖动不是我方未就绪) |
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
| Atlas | `POST {ATLAS_BASE_URL}/v1/embed` | bearer `aud=atlas`,endpointCode `embedding/default` | 已实现·未激活(缺 env + 产品轴授权) |
| Atlas | `POST /v1/rerank` | endpointCode `rerank/default` | 已实现·未激活 |
| Atlas | `POST /v1/chat` | endpointCode `chat/default` | 已实现·未激活 |
| Atlas | `POST /v1/chat` | endpointCode `chat/extract`,`temperature: 0` | **已实现·未激活**——产品轴授权未到位,Atlas 返 `404 ENDPOINT_NOT_ROUTABLE`,我方**驻留可恢复**而非失败(`vxture-platform#55`) |
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
| `karda.retrieve` | 检索单元化 | 不做(本轮),`140` §10 |
| 断言抽取的**调度** | —— | **已交付**:`incr/0008` 任务种类 + 抽取 pass + 独立 tick |
| 断言抽取**实际产出断言** | 产品轴端点授权 `chat/extract` | **待对端** `vxture-platform#55`;在那之前每次调用驻留,不写库。**不与 `chat/default` 共用一个端点**(§11.1.2) |
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

### 11.1 Atlas(全部结清 —— 剩下的不在 Atlas 那边)

**2026-08-26/27,三条全部有了终态,而且两条是被对端推翻的。**

| # | 我方要什么 | 结局 |
|---|---|---|
| `vxture-atlas#4` | 三条 `taskProfile` 授权 | **CLOSED —— 走错了轴**,见 §11.1.1 |
| `vxture-atlas#39` | 第四条 `karda.extract` | **CLOSED —— 同上** |
| `vxture-atlas#21` | `/v1` 契约以类型包/夹具发布 | **CLOSED —— 已交付并已消费**,见 §11.1.3 |
| **`vxture-platform#55`** | **给产品 `karda` 授四个端点** | **待运维**——唯一还剩的一条。执行以 `#55` 为准;我方在 `vxture-platform#56` 补了「每条不做会怎样」与三个坑,操作单 `docs/60-operations/40-run-atlas-endpoint-grants.md` |

### 11.1.1 前两条被对端推翻:那条轴是 legacy,而且是他们指错的

`atlas#47` 是**判定,不是征询**。Atlas 有两条授权轴,而 `grant` 这个词同时指着它们:

| | 产品轴 `product_endpoint_grants` | 租户轴 `model_grants` |
|---|---|---|
| 持有者 | **产品** | 租户 |
| 授的是 | **端点** `endpoint_code` | 模型 `model_id` |
| 解析入参 | `resolveEndpoint(code)`——**一个字符串** | `taskProfile` + `tenantId` + 应用作用域 |
| 状态 | **新轴** | **legacy**,有倒计时指标等着删 |

**「标签路由」这个能力当初只在租户轴上建过。** 所以我方一要 `taskProfile`,就被迫拖上一个
租户 uuid ——**不是因为授权需要租户,是因为路由功能只在那条轴上有过实现**。而 karda 是
**产品**,不是租户。

这也就是 owner 2026-08-26 那句质疑的答案:**「为什么需要租户 UUID」——不该需要。**
我方当时是照对端给的指引写的,而指引本身错了(其 `10-http-surface.md` 把 `taskProfile`
定性成 *per-tenant preference*,并把三个选择器摆成平等三选一,**没有一处说明第三个挂在
正在退役的轴上**)。对端已认领并在修(其 PR `#48`,加「轴」一列、标 legacy、写清产品该用
哪行,并登记 TD-052)。

**产品轴的重指语义还更强**:改 `chat/default` 指向哪个模型,**所有持有它的产品自动跟随,
一行授权都不用改**;`taskProfile` 重指要逐租户改授权行。端点还自带 `fallback_model_code`
故障转移链。

### 11.1.2 karda 侧的改动:一处,已交付

`taskProfile` → `endpointCode`,四个能力对应四个端点码:

| 端点码 | 用途 |
|---|---|
| `chat/default` | 问答 |
| `embedding/default` | 向量化 |
| `rerank/default` | 精排 |
| `chat/extract` | **知识抽取,与问答分开** |

选择器优先级不变(`modelCode` > `endpointCode` > `taskProfile`,三选一,更窄的赢);
`404 ENDPOINT_NOT_ROUTABLE` 与退役的 `TASK_PROFILE_NOT_ROUTABLE` **语义一致**,我方现有的
驻留映射原样照搬——`ENDPOINT_NOT_ROUTABLE` 本来就在 `SUSPEND_CODES` 里,
`check-atlas-contract` 证明它是已发布且不可重试的码。

**抽取仍然不与问答共用一个端点**,理由不变、只是换到了正确的轴上:同一个端点让路由、
计费、可观测三处都分不开批量抽取与交互问答。**两个端点,一次配置,永久解耦。**

顺带修正一处我方自己的错:env 兜底原来是 `profile > model`,而契约写的是
`modelCode > endpointCode > taskProfile`——**旧代码的优先级和契约是反的**,已对齐。

**`tenantId` 仍然要发**,不要混淆:`/v1/chat` 的必填项里有 `TENANT_ID_REQUIRED`。变的是
**授权轴**,不是数据面字段——租户仍是计量与归属的主体。

### 11.1.2b 全仓清理:租户轴在代码里一处不留(2026-08-27)

改完发请求还不够——**留着的类型、字段和策略码就是那条轴长回来的路**,而且它长回来的时候
**不会有任何东西失败**:选择器优先级是 `modelCode` > `endpointCode` > `taskProfile`,
一个和 `endpointCode` 并排发出去的 `taskProfile` 会被**静默忽略**。

删掉的:

| 处 | 原来是什么 | 为什么删 |
|---|---|---|
| `SUSPEND_CODES` | `TASK_PROFILE_NOT_ROUTABLE` | karda 不再发 `taskProfile`,**这个码永远不会回来**——一个永不触发的分支正是 `#100` 那个缺陷的形状 |
| `ChatRequest` / `AskInput` 的 `taskProfile?` | 我方类型里声明着 | **这个类型描述的是我方发什么,不是 Atlas 容忍什么** |
| `ask-tool.ts` / `console-retrieval.ts` 的 `deps.taskProfile` | 两处仍在往下传 | **删字段才把它们逼出来**——单靠 grep 注释看不出这两处是活的 |

保留的:**注释里可以提它**。解释一条轴为什么退役,正是注释该干的事,比"全词禁用"换来的
grep 整洁值钱。

`check-atlas-contract.mjs` 加了第三条检查把这件事钉住:非注释源码里出现 `taskProfile` 或
`TASK_PROFILE_*` 即硬失败,**已双向验红**(注意验的是退出码——管道里 `head` 的返回码会把
一个报了错却不失败的检查伪装成通过)。

### 11.1.3 `#21` 已交付并已消费


对端答复「已交付,请关闭」,而且**已经在生产上跑了三个版本**:

| 我方要的 | 载体 | 上生产版本 |
|---|---|---|
| 错误词表(42 码,4 条可重试) | `GET /.well-known/vxture-contract` 的 `errorCodes` | v0.5.0 |
| 请求形状(四个面各自必填 + 缺了回哪个码) | 同一端点的 `requests` | v0.6.0 |

当前生产指纹 `c1-e132a38fae1a`,**用我方 `/v1` 现有的同一个 S2S 令牌就能拉**。

**已消费(2026-08-27)。** 做法与「把制品当运行时依赖」不同,分两半:

- **词表是 Atlas 的**,我方不发表意见——哪些码存在、哪些他们认为可重试,是我方读到的
  事实。制品落在 `kb/atlas/contract.snapshot.json`(指纹 `c1-d2ecccf5b20d`)。
- **策略是我方的**——哪些码驻留、哪些烧重试、哪些可见地失败,Atlas 决定不了,因为它取决于
  调用失败后 karda 做什么,而不是上游出了什么事。策略写在 `kb/atlas/codes.ts`。

**指纹不钉,也不与生产比对。** 对端提醒过(`#21`):他们一个修复正在移动指纹,钉上去会
让 CI 因为一个「昨天对、明天也对」的值而红。这个常量的用途是**溯源**——说明这批码来自
发布的哪一版,于是一次刷新是一个可评审的 diff,而不是一处无从解释的编辑。

`check-atlas-contract.mjs` 是让它咬住的东西(入 `quality-gate`),两个方向都硬失败:

1. 我方分支上出现一个 Atlas **没有发布**的码——**把 `#100` 的原缺陷原样放回去,它当场
   报红**:「branches on `QUOTA_EXHAUSTED`, which Atlas does not publish - this branch
   can never fire」。字符串比字符串在任何语言里都合法,所以除了拿真表核,没有别的办法。
2. 驻留策略里出现一个 Atlas 标了 `retryable` 的码——**把对方叫我们重试的活驻留掉,等于
   把它搁死**。

**故意不检查两件事**:不要求我方处理全部 43 个码(其中多数是我方从不发送的字段的校验码,
逐码加分支只会让文件更差);也不比对快照与**生产实际服务**的那一份——CI 跑在 GitHub 托管
runner 上而 Atlas 在 tailnet,这个比对**在这里跑不了**,而**一个悄悄跑不了的检查比没有检查
更糟**。刷新要从 tailnet 侧执行:

    curl -H "Authorization: Bearer <aud=atlas 令牌>"       "$ATLAS_BASE_URL/.well-known/vxture-contract" > contract.snapshot.json

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

### 11.1.5 关于「该不该关」:我上一版的判断被事实推翻了一半

上一版这里写着:`#21` 该关,`#4` / `#39` **不关**——理由是「它们跟踪的是**结果**(标签实际
配上),而结果还没发生」。

**那个理由本身没错,结论错了。** 它们不该开着,不是因为结果达成了,而是因为**它们要的东西
是错的**——继续开着等于继续追一条走错轴的需求。判断一条需求该不该关,除了「结果有没有
发生」,还有一问我漏了:**这条需求本身还成立吗。**

结果由 `vxture-platform#55` 接管:同一件事、正确的轴、一次运维写入,而且**这次是真的一次**
——产品轴按产品授权,不按租户,所以不再是 §11.1.1 旧版里那个「每个客户 org 四次」的
O(租户) 形状。

### 11.1.6 「按租户区分模型」这个方向,对端明确否掉了

将来若出现「不同客户用不同档次模型」的需求,**正确形态不是给租户授权**,而是产品侧选一个
**业务模式**(成本优先 / 质量优先 / 效率优先),由运营决定每个模式后面挂什么。

理由值得记下来:按租户绑模型会让**租户本身变成路由维度**,每接一个客户改一次配置,
O(租户);业务模式是 O(模式),三个就够。更要紧的是——**标签应该说明调用方需要什么,
而租户身份不携带这个意图**。

**所以 `taskProfile` 不会被扩展**,这个概念会以模式的形式落在产品轴上。

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
