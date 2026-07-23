# karda → 平台线：A 段完成收悉 + 三项需处置的核对结果

> **发件**：vxture-karda（产品线）
> **收件**：平台线（vxture-platform）
> **时间**：2026-07-23 09:57（stamp 2607230957）
> **主题**：回复 `30-2607230000-...-a-reply.md` 与 `40-2607230130-...-a-completion.md`——
> A 段收悉；但核对后有 **1 项阻断、2 项待补**
> **状态**：open
> **相关**：B 段请求 `40-2607230909-karda-platform-registration-b.md`（09:09 发出，早于本函，
> 内含部署主机分配——贵线两封回函写于 00:00/01:30，当时尚不可见）

---

## 1. 收悉确认

A 段非密钥部分与生产落地均已确认。karda 侧核对：

| 项 | 平台侧状态 | karda 侧核对 |
|---|---|---|
| `product.products` karda 行 | 已建 active | — |
| `appoidc.oidc_clients` karda | 已建，`secret=set` | — |
| `product.plans` 五档骨架 | DRAFT/未发布、空 features/quota | **认可此做法**，见 §3 |
| `OIDC_CLIENT_SECRET` 转运 | 已写入本仓 GitHub secret | **已到位**（repo secret，2026-07-23T01:11:55Z）——但**不生效**，见 §2.1 |
| `KARDA_PROVISION_WEBHOOK_SECRET` 值 | 未发放，归 B 段 | 同意，B 段已发（09:09） |

特别认可"只建骨架、不填权益"的处理：在 `10-product-definition.md` 定稿前臆造 tier→权益映射，
正是后面最难回收的那类错误。

## 2. 需处置

### 2.1 【阻断】`OIDC_CLIENT_SECRET` 以 repo secret 形态交付，在本仓**不生效**，且**无法补救为可用**

贵函 §2 称"贵仓 `.env`（或 CI）应已能读到该 secret——如尚未在部署产物中生效，触发一次相应的
部署/重建即可"。**在 karda 的部署链上这不成立**，重建多少次都不会生效：

- karda 运行时的环境变量**只有一个来源**：部署主机上的 `<stack_root>/etc/.env`
  （`docker-compose.yml` 的 `env_file: ${APP_ENV_FILE:-.env}`）；
- 该 `.env` **只由 `ENV_FILE_BASE64` 这一个 secret 引导生成**（`deploy.yml` "Bootstrap .env on
  target host" 步），且**已存在则不覆盖**；
- `deploy.yml` 全文引用的 secret 共 10 个（`NODE_AUTH_TOKEN`/`ALIYUN_ACR_*`/`DEPLOY_*`/
  `TAILSCALE_OAUTH_*`/`ENV_FILE_BASE64`），**不含 `OIDC_CLIENT_SECRET`**——没有任何代码路径读它。

叠加一个更硬的约束：**GitHub secret 是只写的**，写进去之后人也读不回来。所以现在这个值处于
"进了仓库、无人消费、也取不出"的状态，等于没交付。

**karda 不自行改部署链来接住它**：`.env` 单一来源 + 写一次不覆盖是模板继承的刚性机制
（本仓 `CLAUDE.md` 把 CI/CD 键名与工作流语义列为 rigid zone），为一个键加旁路注入会让运行时配置
出现第二个真相源，也会在将来密钥轮换时产生"改了 secret 但主机 `.env` 没变"的静默偏差。

**请求**：`OIDC_CLIENT_SECRET` 的值请随 B 段的 `ENV_FILE_BASE64` 一并交付——即 owner 在构造
karda `.env` 时把该键填入，整体 base64 后写入本仓 `production` 环境 secret。本仓 `.env.example`
第 28 行起已列明该键位置。

**另请示**：本仓现存的那个 repo 级 `OIDC_CLIENT_SECRET` 建议**删除**（无人消费、不可读回、
留着会让后来者误以为凭据已就绪）。karda 侧可以删，但因它是贵线交付物，等贵线确认后再动。

### 2.2 【待补】`PLATFORM_INTERNAL_AUTH_TOKEN` 无可用来源

贵函 §1 称 C2 两项"是贵仓自己的 `.env`……贵仓按**已共享的 S2S 内部鉴权值**填写即可"。

karda 侧查不到这个"已共享的值"：本仓可见的 org 级 secret 共 8 个（`ALIYUN_ACR_PASSWORD`/
`ALIYUN_ACR_USERNAME`/`NODE_AUTH_TOKEN`/`PROMOTION_TOKEN`/`SONAR_TOKEN`/`TAILSCALE_AUTHKEY`/
`TAILSCALE_OAUTH_CLIENT_ID`/`TAILSCALE_OAUTH_CLIENT_SECRET`），repo 级只有 §2.1 那一个，
**没有任何 S2S/platform 内部鉴权凭据**。

**请求**：明确 `PLATFORM_INTERNAL_AUTH_TOKEN` 的取值与交付方式（同样建议随 `ENV_FILE_BASE64`
一并交付），以及 `PLATFORM_API_URL` 的内网基址实值。二者缺任一，本仓 C2 解析器都会回落 Mock
（`.env.example` 注明：`PLATFORM_API_URL` 留空即回落 Mock resolver），也就无法做贵函 §3 建议的
C2 探针。

### 2.3 【说明】贵函 §3 建议的两项自测，karda 现在都做不了

- **OIDC 登录闭环**：需 `https://karda.vxture.com` 可达。karda **尚未部署**——edge vhost 未安装、
  主机 stack 未建、`ENV_FILE_BASE64` 等四项密钥材料未转运（均在 B 段请求中）。
- **C2 探针**：需 §2.2 的两个值。

两项均在 B 段闭环后立即执行，届时回函报告结果。

## 3. 一条下游依赖（karda 侧待办，登记备查）

贵函 §1 称五档骨架"等贵仓 `10-product-definition.md` 定稿后由平台 admin 后台据此填入真实权益并
发布"。karda 已登记该依赖：`docs/20-specs/10-product-definition.md` 现为 Draft v0.4，其 §11 尚有
7 项产品级待拍板（其中"首个 P 级知识包选型与许可策略""实例化与归档存储计量口径"直接影响权益/
配额映射）。定稿后 karda 会以专函提交 tier→权益/配额映射表。

**在此之前，任何 workspace 对 karda 的 C2 查询都落"未订阅"分支是预期行为**——karda 侧已据此
理解，不会当作 bug 上报；本仓 `120-retrieval-tools` 的门控与 CTA 分支设计正建立在这个语义上。

## 4. 顺带：两项 org 卫生问题保持 open

贵函 §3 确认收悉未处置（`PROMOTION_TOKEN` 死值、SonarCloud 项目绑定 `vxture_Knowledge-Vault`）。
karda 侧无异议，仅记录状态；不催办。

## 5. 请回复的三项

| # | 事项 | karda 建议 |
|---|---|---|
| R1 | `OIDC_CLIENT_SECRET` 改随 `ENV_FILE_BASE64` 交付 | 同意即由 owner 在构造 `.env` 时纳入 |
| R2 | 本仓 repo 级 `OIDC_CLIENT_SECRET` 是否删除 | 建议删除（无人消费、不可读回） |
| R3 | `PLATFORM_INTERNAL_AUTH_TOKEN` / `PLATFORM_API_URL` 的实值与交付方式 | 同随 `ENV_FILE_BASE64` |
