# 20-doc-system - the published Karda doc system

`docs/` in this repo is the **working authority**: it is versioned with the code,
enforced by `lint:docs-numbering`, and reviewed in the PR that changes the thing
it describes. It is written for whoever is about to change karda.

The **published doc system** is a different audience and a different artefact: a
set of Claude artifacts, written for someone who needs to understand karda
without cloning it - a platform reviewer, an agent developer deciding whether to
integrate, a sibling product team. They are the same facts, selected and shaped
for reading rather than for editing.

Both are needed and neither replaces the other. What this file exists to prevent
is the third state: a published page that has quietly stopped being true.

## The set

Karda joins the family pattern Atlas and Runos already use - one product, one
doc set, every page carrying a rail that links to its siblings. The rail is what
makes it a SYSTEM rather than several pages: a reader who lands on the wrong
document can leave before reading it.

| Document | Answers | URL |
|----------|---------|-----|
| 产品现状 | 是什么、建成了什么、还差什么 | <https://claude.ai/code/artifact/d1d03c78-d9b6-4cd7-8c5e-e7d6e715e868> |
| 系统架构 | 内容怎么流过来，治理怎么正交 | <https://claude.ai/code/artifact/2c305d96-c6c3-45a1-a6c0-a1dde7623bb5> |
| 数据结构 | 30 张表，以及列锁纪律 | <https://claude.ai/code/artifact/50a07490-67b7-463e-8472-96cd4dbd9486> |
| 接口文档 | 46 个端点，按谁能调分组 | <https://claude.ai/code/artifact/52d5508d-b0c4-43f4-b552-b874fcd1c8c0> |
| 审计报告 | 批次 10-14 真实发生的缺陷 | <https://claude.ai/code/artifact/689dbb66-f931-466e-a8f8-aaa692f0e418> |
| 能力登记册 | 84 项能力对照：建没建 / 该不该建 / 为什么 | <https://claude.ai/code/artifact/e9da830c-334c-4297-8be5-219ef8af9e91> |
| 设计语言 V1 | 产品外观与组件语言（**不在本底盘上**，见下） | <https://claude.ai/code/artifact/dca61ae4-c30d-40b9-bd2d-9ec9978a624a> |

## Where each page's facts come from

A published page is a VIEW over this tree plus the code. When the source moves,
the view is stale - that is the whole reason this table exists.

| Published | Source of truth |
|-----------|-----------------|
| 产品现状 | `70-workplan/00-index.md`, `20-specs/10-product-definition.md`, `20-specs/40-tier-capability-matrix.md` |
| 系统架构 | `30-design/1xx` (kb model / processing / retrieval), `220-connector-framework`, `230-runos-channel` |
| 数据结构 | `deploy/database/ddl/` - baseline + 97 + 98 + `incr/*`. The DDL is the structure authority, not Prisma |
| 接口文档 | `portals/app/app/api/**/route.ts` + `.well-known/vxture-tools` |
| 审计报告 | `60-operations/10-tech-debt.md` + the "defects found" notes in each batch of `70-workplan/00-index.md` |

## The chassis

**Six of the seven** pages are generated from one shared chassis so they cannot
drift apart visually or structurally. What it inherits, and from where:

- **the family palette + `shell`/`rail`/`main` + `card`/`kv`/`note`/`tag`** -
  shared with the Atlas and Runos docs. Karda keeps the palette ON PURPOSE: a
  doc system that changes colour per product is three products, not one system.
  Identity is carried by the rail brand, not by the accent.
- **inlined `@vxture/design-tokens` typography** - Atlas's improvement. An
  artifact's CSP admits Google Fonts and nothing else, so the DS package cannot
  be installed and the tokens are copied in. **They must stay identical to the
  DS**; when the DS moves, that block moves with it.
- **the `flow`/`flow-node` diagram vocabulary** - Runos's improvement. Karda has
  more moving parts than either sibling (three platform channels, two supply
  doors, a five-stage pipeline, a governance clock), so it earns its place.

## Updating

Republishing the SAME file path from the session that created it keeps the URL.
From any other session, pass the artifact URL as `url` - publishing without it
creates a SECOND artifact, and then the set has two pages claiming to be the
same document, which is worse than one stale page.

**When to refresh:** a batch that changes what a page asserts. Adding tables
means 数据结构; adding routes means 接口文档; closing a batch means 产品现状; a
defect found by walking a batch through means 审计报告. A page nobody refreshed
after the thing it describes changed is not documentation - it is a claim.

## Two document types, one chassis

The chassis serves two shapes. The second is why it has a `wide` variant rather
than the register being an exception to its own system:

- **reference**（五份）- read a section at a time, look a fact up. `card` + `kv`
  + `note`, prose capped at 62em.
- **register**（能力登记册）- an 84-row scored matrix, scanned vertically and
  compared across rows. It needs two things reference prose does not:
  **filled** status chips (over 84 rows an outline `tag` does not resolve at a
  glance, so reusing the reference vocabulary unchanged would have made the
  register measurably worse), and **width** (a five-column matrix against a
  252px rail). `.main.wide` lifts the cap **for tables only** - paragraphs keep
  it, because a 1400px line of prose is unreadable whatever the page is for.

The register carries a third axis, necessity, styled by **weight rather than
colour**: a capability marked 必要 whose status is 未做 is the most important row
on the page, and colouring necessity with the status palette would hide exactly
that row. Of 84 capabilities, two are currently 必要 and not built - that now
leads the page.

## The one page that is NOT on the chassis

**设计语言 V1** stays as it is (owner, 2026-08-25). It is not a document - it is a
live design showcase: ~2.5MB carrying its own `--om-*` token definitions and 21
script blocks, demonstrating the design language rather than describing it. A
documentation chassis would break the thing it exists to show. It stays in the
rail as a sibling without adopting the chassis; this section exists so that
reads as a decision rather than an oversight.
