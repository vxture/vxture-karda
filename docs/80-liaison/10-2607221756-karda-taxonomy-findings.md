# karda → 平台线：070-docs-taxonomy 落地核对结果与修订建议

> **发件**：vxture-karda（产品线）
> **收件**：平台线（vxture-platform docs 标准 owner）
> **时间**：2026-07-22 17:56（stamp 2607221756）
> **主题**：karda 仓依 070 §3 授权自定仓内文档约定过程中，对 `070-docs-taxonomy.md` 与 `vxture/docs`
> 实际落盘做了一次全量核对，报告仍成立的条款/实现分叉，并附建议与可移植实现
> **状态**：**已批复（owner 2026-07-22）——D1/D2/D3/D4 全部同意**；待平台仓落地修订，见 §7
> **答复方式**：修订 070 后知会本仓；本仓按新版校准 `docs/00-meta/10-docs-convention.md` 与护栏

---

## 1. 背景

karda 仓实例化后要写第一批域设计文档，需判定 `{kind}_{domain}_{NNN}_{slug}` 在产品仓的适用性。
核对过程中比对了 070 正文、`vxture/docs`（239 篇 .md / 33 个子目录）与两份
`check-docs-numbering.mjs` 实现，发现若干标准正文与落地不一致处。

**其中最核心的一条已由 owner 2026-07-22 对 §3 加作用域条款解决**（域码前缀仅限 platform 仓内部、
仓内组织权下放产品仓），本仓已据此产出 `docs/00-meta/10-docs-convention.md` 并重写护栏，本轮不再重提。

以下是**复核后仍然成立**的条目，按严重度排序。所有结论均可用文末的复核命令自行验证。

---

## 2. 仍成立的条款问题

### F1（高）§4 规定的寄存器文件名，会被 §7 的护栏直接拦下

§4 要求 runbook 命名 `run-{domain}-{slug}.md`、技术债登记表位于 `docs/60-operations/tech-debt.md`。
把这两个名字喂给 §7 所述护栏的现行实现：

| 文件名 | 来源 | 护栏判定 |
|---|---|---|
| `run-platform-alerts.md` | §4 规定形态 | **FAIL**（无 `NN-` 前缀、无 `_NNN` 段） |
| `run-karda-reindex.md` | §4 规定形态 | **FAIL** |
| `tech-debt.md` | §4 规定路径 | **FAIL** |
| `30-run-platform-alerts.md` | 平台仓实际 | PASS |
| `10-tech-debt.md` | 平台仓实际 | PASS |

即：**照 §4 写就过不了 §7 的硬门；平台仓实际落盘的写法与 §4 不符但能过。**全库 `run-*` 实例数 = 0。

**建议**：§4 校准为实际——runbook `NN-run-{slug}.md`、技术债登记表 `60-operations/10-tech-debt.md`；
或把 `RUN-` 加进护栏合法形态。二者取一，但不能维持现状（现状是标准自相矛盾）。

### F2（高）§2「子目录也编号，概莫能外」是死条文

- 平台仓子目录 **33 个，已编号 4 个**（`000-platform` / `001-varda` / `210-arda` / `220-vxtpl`），
  其余 29 个全裸：`30-design/{architecture,commerce,db,decisions,identity,inputs,platform}`、
  `40-implementation/packages/*`（13 个）、`60-operations/audit`、`50-deployment/rebuild` 等。
- 根因：**护栏从不检查目录名**，只扫 `.md` 文件名。条文无机检 = 无约束力。

**建议**：二选一并写明——(a) 护栏补目录检查，同时给 org 钉死的路径（`30-design/decisions/`、
`rebuild/`）开具名例外；或 (b) §2 把子目录编号降级为「建议」。karda 已实现 (a)，见 §4 可移植实现。

### F3（高）§3 的 `kind` 集合覆盖不了 platform 仓自身的文档

§3 定 `kind ∈ {data, design, ops}`。platform 仓 `30-design/` 实际前缀分布：

| 前缀 | 篇数 | 在 kind 集合内 |
|---|---|---|
| `data_` | 19 | ✅ |
| `design_` | 3 | ✅ |
| `product_` | **11** | ❌ 非合法 kind，且是两段式 `product_{NNN}_{slug}`（无 domain 段） |
| `ops_` | **0** | ✅ 但从未使用 |

这 11 篇包含 `product_100_matrix`、`product_110_sharing-isolation`、`product_210_tool-protocol`、
`product_240_repo-template`——全 org 引用密度最高的一批。它们只因 platform 实现的正则比 §7 正文宽松
才没报错（见 F4）。

**建议**：改标准就现实，不建议改这 11 篇（karda 的设计文档已引用 `product_100/110/210/240`，
org 内引用面更宽，`product_240` 已是事实稳定标识）。具体：kind 扩为
`{data, design, ops, product}`，并显式允许 `product` 类省略 domain 段（其域即 product 自身）；
`ops` 若无使用意图则从集合移除。

### F4（中）§7 正文与 platform 实现的正则不一致，且未反映 §3 的新作用域

| | 形态 |
|---|---|
| §7 正文 | `NN-` / `{kind}_{domain}_{NNN}_` / `ADR-\|TD-` |
| platform 实现 | `^[a-z][a-z0-9-]*(_[a-z][a-z0-9-]*)?_\d{3}[_.-].*\.md$` — 任意小写前缀 + 三位数即可，**不校 kind、不校域码** |

按 §7 正文（严格式）扫 platform 仓 → 11 篇报违规（即 F3 那批）。另外 §7 现在读起来仍是跨仓通用条款，
未体现 §3 已把域码形态限定在 platform 仓内部。

**建议**：§7 补一句作用域（`{kind}_{domain}_{NNN}_` 一支仅 platform 仓适用；产品仓依 §3 用本仓约定），
并把正文与实现校准到同一形态（配合 F3 的 kind 集合修订）。

### F5（中）§0.1「编号=正式，概莫能外」的实际覆盖面与措辞不符

三处豁免未在标准中声明：

1. 护栏只扫 `.md`。`30-design/architecture/package-architecture.html`、`30-design/db/schemas/*.sql`（8 个）、
   `50-deployment/rebuild/main-ruleset.json` 完全不受编号约束。
2. `README.md` 白名单**按 basename 全局匹配**（任意层级命中）。
3. 上述 2 的直接后果：`30-design/inputs/`（含 `README.md` + `tenancy_core_tables.sql` + 两篇 `NN-` 草稿）
   构成一个常驻未编号区，正是 §0.1 说「定位即待删」的东西。

**建议**：§0.1 写明约束仅及 `.md`；README 白名单收窄为 docs 根一级；`30-design/inputs/` 归档或编号。
karda 已按此收窄，见 §4。

### F6（中）§6 产品号 `220` 被 `vxtpl` 占用

§6 表明定 `220 = karda`（L2 知识平台），但平台仓存在 `docs/20-specs/220-vxtpl/`，且 `vxtpl` **不在**
`30-design/product_100_matrix.md` 的产品矩阵内（矩阵第 43 行是 karda）。karda 的平台侧 spec 目录一旦建立即撞号。

**建议**：vxtpl 作为模板演示实例，宜迁出产品号段（并入模板线文档或 `10-standards` 相关位），把 `220` 归还 karda。

### F7（低）§1 的 `95-readme` 与 §0.2「顶层=十进制分段」冲突

§0.2 定顶层为 `00/10/…/90`，§1 又列 `95-readme`（自注为过渡 staging）。
**建议**：§0.2 补「过渡目录可占非十进制号，须注明回收条件」，或按 §1 已写的计划并入 `40-implementation/packages/`。

### F8（低）§2 的位数与十位跳在 `30-design/architecture/` 未落实

该目录用 `00,01,02,…,07`（个位跳），且 `00-index.md` 与 `00-overview.md` **双 `00`**（§2 规定 `00` 固定给索引）。
**建议**：重编为 `00-index` + `10/20/…`，或在 §2 注明历史遗留豁免。

---

## 3. 已由 §3 更新消解、不再提请修订的条目

供平台线核对本轮改动的覆盖面，无需回应：

- ~~产品仓该不该用域码前缀~~ → §3 作用域条款已定（产品仓不用）。
- ~~严格版/宽松版两套护栏对产品仓给出相反判定~~ → 产品仓不再有域码正则，分叉消失（platform 仓内部的正文/实现分叉仍在，见 F4）。
- ~~§5 域码表混编「域」与「产品」~~ → §5 新增说明段已界定其作用（登记 platform 仓需托管的域），
  歧义大幅收敛。仅存的小问题：`product` 作为元词与 identity/commerce 等真域并列，若采纳 F3 会一并理顺。

---

## 4. karda 侧已做的可移植实现（供平台参考，不强求采纳）

本仓 `docs/00-meta/10-docs-convention.md` + `scripts/guardrails/check-docs-numbering.mjs`：

- 仓内文档一律 `NN(N)-slug.md`，靠**目录 + 编号带**区分，不用域前缀；`30-design/` 三位并沿用 070 §3 的
  百位段义（`1xx` 架构 / `2xx` 契约与 schema / `3xx` 实施），其余目录两位；**每目录内位数统一**
  （混用会破坏字典序：`20-` 排在 `100-` 之后——这一条建议也补进 070 §2）。
- 护栏三检：文件名、**目录名**（对应 F2）、**根级 README 白名单**（对应 F5）。
- 具名例外集合封闭且有据：`30-design/decisions/`（070 §4 钉死）、`50-deployment/rebuild/`
  （治理规范 §1 钉死），加例外须先改本仓约定文档。
- 正反双向验过：注入未编号文件、未编号目录、嵌套 `README.md`、`design_karda_100_*` 四种违规均被 `--strict` 拦下。

若平台线采纳 F2/F5，可直接取本仓实现替换。

---

## 5. 请求平台线决策的四项

| # | 事项 | karda 建议 | 影响本仓 |
|---|---|---|---|
| D1 | F3 kind 集合：扩为 `{data,design,ops,product}` + 允许 product 省略 domain？ | 采纳（改标准，不改 11 篇） | 否（仅 platform 仓内部） |
| D2 | F2 子目录编号：补机检 还是 降级为建议？ | 补机检，可取本仓实现 | 已按「补机检」执行；若平台改判「建议」本仓仍保留严格版（收紧不构成偏离） |
| D3 | F6 `220` 归还 karda？ | 归还，vxtpl 迁出产品号段 | 是——karda 平台侧 spec 目录建立时机取决于此 |
| D4 | 070 是否补一条：产品仓行使 §3 授权后，**须**在仓内固化一份文档约定并接入机检、且回报平台线 | 建议补 | 本仓已如此做，可作参照 |

D4 的理由：§3 只写了「改用该仓库自己的编号惯例」，未要求把惯例固化成文档、也未说放哪、要不要回报。
不补的话「下放」在实践中会退化为各仓各写各的、无约定无机检——恰是 070 §0 想消灭的状态。

---

## 6. 批复与落地状态（owner 2026-07-22）

四项决策**全部同意**。落地动作全在 **platform 仓**（karda 仓写权限不及，本仓不代改）：

| # | 批复 | platform 仓落地动作 | 状态 |
|---|---|---|---|
| D1 | 同意 | 070 §3 kind 集合扩为 `{data,design,ops,product}`，显式允许 `product` 类省 domain 段；`ops` 视使用意图去留。**零文件改名**——现有 11 篇 `product_*` 即刻合法 | 待平台仓 |
| D2 | 同意，补机检 | platform 的 `check-docs-numbering.mjs` 补目录名检查 + 具名例外；配套决定 29 个未编号子目录是补号还是入例外集合 | 待平台仓 |
| D3 | 同意，归还 `220` | `20-specs/220-vxtpl/` 迁出产品号段；`220` 归 karda | 待平台仓；**解锁本仓 karda 平台侧 spec 目录** |
| D4 | 同意，补充 | 070 §3 补：产品仓行使授权后须固化仓内约定文档 + 接入机检 + 回报平台线 | 待平台仓 |

顺带（F1/F4/F5/F7/F8 未单列为决策项，但同属本函修订面）：§4 寄存器命名与路径校准到实际
（`NN-run-{slug}.md` / `60-operations/10-tech-debt.md`）、§7 正文补作用域并与实现校准、§0.1 写明
仅及 `.md` 且 README 白名单收窄、`95-readme` 与 §0.2 的冲突择一处理、`30-design/architecture/` 重编号。
建议与 D1–D4 同一批 PR 落地，避免标准出现中间态。

**对本仓的影响**：D1/D2/D4 无（D2 本仓已实现严格版，平台若判"降级为建议"本仓仍保留，收紧不构成偏离）。
仅 D3 解锁 `docs/70-workplan/` 里那条 blocked 项。070 修订发布后本仓复核
`docs/00-meta/10-docs-convention.md` §1 的继承条款表与 §8 偏差登记，如有出入随即校准。

---

## 7. 复核命令

```bash
# F1：§4 规定的文件名 vs §7 护栏
node -e 'const re=[/^\d{2,3}-.+\.md$/u,/^[a-z][a-z0-9-]*(_[a-z][a-z0-9-]*)?_\d{3}[_.-].*\.md$/u,/^(ADR|TD)-\d{3}.*\.md$/u];
for(const n of ["run-platform-alerts.md","tech-debt.md","30-run-platform-alerts.md","10-tech-debt.md"])
console.log(n.padEnd(30), re.some(r=>r.test(n))?"PASS":"FAIL")'

# F2：子目录编号计数（预期 33 / 4）
find docs -mindepth 2 -type d | sed 's|.*/||' \
  | awk '{t++; if($0 ~ /^[0-9][0-9]?[0-9]?-/) n++} END{print "子目录="t, "已编号="n}'

# F3：kind 前缀分布
find docs -name '*_[0-9][0-9][0-9]_*.md' | sed 's|.*/||' | cut -d_ -f1 | sort | uniq -c

# F4：按 §7 正文（严格式）扫 platform 仓，预期 11 篇 product_*
node <karda>/scripts/guardrails/check-docs-numbering.mjs   # 在 vxture 仓根执行

# F5：全局 README 豁免与非 .md 产物
find docs -name README.md; find docs -type f ! -name '*.md'

# F6：220 占用
ls docs/20-specs/ | grep 220; grep -n 'vxtpl' docs/30-design/product_100_matrix.md
```
