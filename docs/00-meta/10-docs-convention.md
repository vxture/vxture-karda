# 本仓文档编号与组织约定（karda docs convention）

> **依据**：org 权威 `070-docs-taxonomy.md` §3（owner 2026-07-22 定调）——`{kind}_{domain}_{NNN}`
> 域文档编码**仅用于 vxture-platform 仓内部**；产品一旦有独立仓库，仓内文档改用该仓自己的编号
> 惯例。本文即 karda 行使这一授权的产物：**本仓 `docs/` 内部组织的唯一权威**。
> **强制**：`pnpm lint:docs-numbering --strict`（CI `quality-gate` 硬门）。
> **边界**：本文只管本仓 `docs/` 内部。跨仓共用的部分（decades 划分、`NN-` 序列、`00-index`、
> `ADR-`/`TD-` 寄存器）仍归 org 权威，本仓不得自行改动。

---

## 1. 继承 org、不得偏离的部分

| org 条款 | 内容 | 本仓状态 |
|---|---|---|
| 070 §0.1 | 编号 = 正式（永久）；无编号 = 临时（定位即待删）。索引也不破例（`00-index.md`） | 遵照，机检 |
| 070 §0.2 | 编号预留空位、不连续；顶层十进制分段、目录内十位跳 | 遵照，机检（位数与带宽见 §3） |
| 070 §0.3 | 寄存器（`ADR-`/`TD-`）append-only、稳定 ID、永不重排 | 遵照 |
| 070 §1 | 十个 decade 顶层目录 `00-meta`…`90-memory`，空号保留不挪用 | 遵照 |
| 070 §2 | 目录内 `NN-kebab-slug.md`；每目录一个 `00-index.md` | 遵照，机检 |
| 070 §4 | `ADR-NNN` 在 `30-design/decisions/`；`TD-NNN` 在 `60-operations/` | 遵照（TD 登记表 = `60-operations/00-index.md`） |

本仓**不设** `95-readme`（那是 platform 仓的过渡 staging）。

## 2. 本仓自定：不使用域码前缀

**`{kind}_{domain}_{NNN}_{slug}` 在本仓是非法文件名。** 理由即 070 §3 的定调：本仓是单一域仓库，
每一份文档的域都是 karda，域前缀是纯噪音；platform 仓需要它是因为多域文档挤在一层。

区分靠**目录 + 编号带**，不靠文件名前缀：

- 域内纵深设计之间的区分 → `30-design/` 内的百位编号带（§3）
- 文档类型的区分 → decade 目录本身（specs / design / implementation / operations…）

**留在 platform 仓的 karda 文档不受本文约束**：平台视角、需跨域引用的部分（对接契约、
entitlement / commerce 集成设计等）继续留在 platform 仓并沿用 `{kind}_karda_{NNN}_` 域码前缀
（域码表 §5 已登记 `karda`）。两边不互相搬运、不双处维护——同一主题只在一处有正本，另一处引用它。

## 3. 编号带与位数

**每个目录内位数统一**（混用 2 位与 3 位会破坏字典序：`20-` 排在 `100-` 之后）。

| 目录 | 位数 | 编号带 | 说明 |
|---|---|---|---|
| `00-meta/` | 2 | `10/20/…` | 关于文档本身 |
| `10-standards/` | 2 | `10/20/…` | 仅 org 标准的薄索引 + 本仓落地指针，不复制标准正文 |
| `20-specs/` | 2 | `10/20/…` | 产品与业务规格 |
| `30-design/` | **3** | `1xx` 架构与域纵深设计 · `2xx` 对外契约与细化(schema) · `3xx` 实施 | 带语义沿用 070 §3，只去掉前缀 |
| `40-implementation/` | 2 | `10/20/…` | 分层/包指南、编码规范 |
| `50-deployment/` | 2 | `10/20/…` | 基建、CI/CD、bootstrap 清单 |
| `60-operations/` | 2 | `10/20/…` | runbook 用 `NN-run-{slug}.md`；TD 登记表在 `00-index.md` |
| `70-workplan/` | 2 | `10/20/…` | 批次跟踪（当前全在 `00-index.md`） |
| `80-liaison/` | 2 | `10/20/…` | 联络函，`NN-{YYMMDDHHMM}-{slug}.md`，时间戳在序号之后 |
| `90-memory/` | 2 | `10/20/…` | 仓内 AI handoff |

`30-design/` 用三位是因为它要承载 karda 的整个设计族，且要保留 070 §3 的百位段义；其余目录文件
量小，两位足够，插档用 `15`。

**跨文档互引用编号引用**，不用文件名：写"本仓 `30-design/100`"或"`100-kb-model`"，
改 slug 不会打断引用。

## 4. 子目录

- **新建子目录一律编号** `NN-name/`，并自带 `00-index.md`。
- **具名例外（两个，均为 org 钉死的路径，不得改名）**：
  - `30-design/decisions/` —— 070 §4 明定 ADR 位置
  - `50-deployment/rebuild/` —— 治理规范 §1 明定 `rebuild/main-ruleset.json`
- 例外集合是封闭的：新增例外须先改本文。

## 5. 文件名字符集

`NN-kebab-slug.md`：小写字母、数字、连字符。不用下划线（下划线是 platform 仓域码前缀的分隔符，
本仓不使用，留空以免误认）、不用空格、不用非 ASCII。

## 6. 临时区

`temp/` 是未定稿草稿的暂存区，**已 git-ignore，不是仓库历史**。草稿评审后按本文编号迁入 `docs/`，
迁入即从 `temp/` 删除（避免双处维护）。`docs/` 下不设任何未编号暂存区——070 §0.1 的"无编号=待删"
在本仓无例外，`temp/` 之所以合法正是因为它在 `docs/` 之外。

编号 ≠ 定稿：文档可以是正式编号文件而内部状态仍为 `Draft`（含待拍板项）。状态写在文档头部，
不靠文件名表达。

## 7. 机检（`scripts/guardrails/check-docs-numbering.mjs`）

`--strict` 接 CI `quality-gate`。检查项：

1. **文件名**：`docs/` 下每个 `.md` 必须匹配 `NN(N)-slug.md`（含 `00-index.md`）或 `ADR-NNN*` /
   `TD-NNN*`，否则违规。
2. **目录名**：`docs/` 下每个子目录必须匹配 `NN(N)-name`，或在 §4 的具名例外集合内。
   （org §2 早有此要求，但 platform 仓的护栏从不检目录，33 个子目录仅 4 个编号——本仓补上机检，
   把条文变成硬门。）
3. **白名单收窄**：`README.md` 仅在 `docs/` 根一级豁免。platform 版按 basename 全局豁免，
   等于任意层级放一个 `README.md` 就能开出一片未编号区（platform 仓 `30-design/inputs/` 即如此）——
   本仓不留这个口子。

护栏只扫 `.md`。非 `.md` 产物（`.json` / `.sql` / 图片等）不受编号约束，但同样禁止在 `docs/` 下
形成未编号的常驻草稿区。

## 8. 与 org 权威的偏差登记

本文对 070 的**收紧**（目录名机检、README 白名单收窄）不构成偏离——070 §2 本就要求子目录编号，
本仓只是把它执行到位。本文对 070 的**不适用**（§3 域码前缀）由 070 §3 自身的作用域条款授权。
如后续 org 收回或修改该授权，本文随之作废并回归 org 编码。
