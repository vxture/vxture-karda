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
| `karda.attach_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.detach_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.create_kb` | **仅 OBO** | 免计量 | 已交付 | 不做 | `120` §6 |
| `karda.write_document` | 直连**仅 OBO** / Runos 可 service | per_doc | 已交付 | 已实现·未激活 | `230` §2 |
| `karda.create_entry` | 直连**仅 OBO** / Runos 可 service | per_doc | 已交付 | 已实现·未激活 | `230` §2 |

**这张表暴露的第一件事:断言层的两件工具只在直连通道上。** Runos 面仍是五件
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
| Atlas | 抽取调用 | taskProfile `karda.extract` | **待对端** `vxture-atlas#39`(OPEN) |
| Atlas | A2 深解析 | 请求页形态未定 | **待对端** `#102`——**不猜线上形状** |
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
| `karda.get_context` | Span + chunk 来源区间(`incr/0007`,均已就位) | **未实现——下一件**,不依赖 Atlas |
| `karda.browse` | 断言 + 实体分页 | 未实现 |
| `karda.retrieve` | 检索单元化 | 不做(本轮),`140` §10 |
| 断言抽取管线 | Atlas `karda.extract` | **待对端** `vxture-atlas#39` |
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

## 10. 联动修订登记

| 何时 | 必须同改 |
|---|---|
| 增删 `karda.*` 工具 | 本册 §3 + `kb/tools/tools.test.ts` 件数断言 |
| 改 Runos 暴露的 operation 集 | 本册 §3 + `230` §3 + **与 runos 线协同**(注册契约) |
| 新增内部作业端点 | 本册 §4 |
| 新增出站对端 | 本册 §6 + egress 守卫白名单 |
| 任一「待对端」的 issue 关闭 | 本册对应行状态 |
