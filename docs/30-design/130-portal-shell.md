# Karda 门户外壳设计(Portal Shell)(130-portal-shell)

> 版本:v1.0
> 状态:Implemented — 与 `portals/app/app/_shell/` 一致
> 上游文档:10-product-definition、DS `04-tokens-contract.md` / `07-consumption-pitfalls.md`
> 定位:门户外壳的**词汇、空间常量、列数规则与排版基准**。这四项是全局产品口径,任何页面都不得各自解释
> 设计方法:按行业最佳实践对齐——Material 3 自适应布局(body / pane / pane spacer / margins)、ARIA 地标语义、容器查询驱动列数

---

## 1. 词汇(唯一口径)

外壳区域的命名此前混用 rail / flank / column / sidebar 四套说法,写进注释和文档后无法判断指的是同一块还是不同块。以下为**唯一合法用词**,代码注释、文档、需求沟通一律照此:

| 中文 | 英文 | 指什么 | 行业依据 |
|---|---|---|---|
| 顶栏 | header | 48px 顶部栏 | Material top app bar |
| **工作区** | **shell body** | 顶栏以下的**整块**,含三个 pane | Material 3 body region;VS Code workbench |
| 导航栏 | nav pane | 左侧域卡片列,280px | 见 §1.1 |
| 内容区 | main pane | 中间可滚动列 | ARIA `<main>` |
| 值班台 | steward dock | 右侧管家值班台,320px | ARIA `<aside>`;Xcode inspector |
| 栏间距 | pane spacer | pane 之间的间距 | Material 3 pane spacer |
| 外边距 | window margin | 工作区距浏览器边 | Material 3 margins |
| 内衬 | content inset | 内容区在自己 pane 内再加的边距 | inset / padding |

另有一个**不属于外壳**的概念,一并定名以免再借用 rail:内容区里某个页面自己的次要卡片列叫**页内副栏(page aside)**,组件为 `(portal)/pipeline/_ui.tsx` 的 `AsideCard`。它是页面的一部分,随路由变化;值班台是外壳 pane,跨页常驻。两者不得混称。

**"工作区"包含"内容区",两级不同名**——说"内容区"永远只指中间那一列。此前的"大内容区/中内容区"语义正确但两级同名,不采用。

### 1.1 为什么左侧不叫 rail

Material 的 navigation rail 特指 80dp 的窄图标条;本产品左侧是 280px 的卡片列,按 M3 定义属于 navigation drawer / pane。组件文件因此为 `NavPane.tsx`(原 `NavRail.tsx`,2026-08-25 更名)。

### 1.2 ARIA 提示

`<main>` **只指内容区**,不含两侧 pane。任何把整个工作区标成 `main` 的写法都是错的。

---

## 2. 空间常量

三个数,全部在 `PortalShell.tsx` 一处声明,其他文件不得再出现边距:

| 常量 | 值 | 类名 | 依据 |
|---|---|---|---|
| 外边距 window margin | 24px | `p-lg`(工作区行) | M3 medium 及以上档 = 24dp |
| 栏间距 pane spacer | 24px | `gap-lg`(工作区行) | M3 pane spacer = 24dp |
| 内衬 content inset | 32px | `px-xl`(内容区内层) | 产品决定,见下 |

导航栏与值班台**贴外边距**,自己不加边距;内容区是唯一的例外,额外加 32px 内衬,于是内容距两侧 pane 为 `24 + 32 = 56px`。理由:两侧是卡片面,内容也是卡片面,只隔一个栏间距时读起来是挤在一起的(owner 2026-08-24)。

底部另有安全留出(`pb-5xl`),滚到底时最后一块不贴边。

---

## 3. 列数规则:由内容区宽度决定,不由视口

**页面里的列数一律用容器查询,不得用 `sm:` / `xl:` / `2xl:` 视口断点。** 视口断点看不见导航栏和值班台是否展开,这正是 1600px 窗口把四列画进 840px 内容区的原因。

`PortalShell.tsx` 把内容区内层标为 `@container`,页面用 `@min-[Nrem]:` 查询它。

内容区实际宽度 = 视口 − 48(外边距)− 280(导航栏)− 320(值班台)− 48(两处栏间距)− 64(内衬):

| 视口 | 两侧展开 | 两侧收起 |
|---|---|---|
| 1440 | 42rem | 83rem |
| 1600 | 52rem | 93rem |
| 1920 | 72rem | 112rem |

由此定资产卡网格的阶梯 —— **两侧展开时默认三列**(owner 2026-08-25),四列的闸门放在 76rem,只有收起侧栏才够得着:

```
grid-cols-1  @min-[26rem]:grid-cols-2  @min-[40rem]:grid-cols-3  @min-[76rem]:grid-cols-4
```

两列布局(`flex-col` → `flex-row`)统一在 `@min-[52rem]` 切换。

阈值不是随便定的,按**内容装得下什么**倒推。例:任务与队列的 KPI 行里,「阶段 P95」块要放五根带标签的小柱,需要约 216px 的块内宽 → 约 264px 的块 → 约 72rem 的行,所以它的四列闸门是 `@min-[72rem]`,而不是跟着别处抄 `@min-[40rem]`。

**注意容器查询量的是内容盒**:`@container` 挂在带 `px-xl` 的内层上,所以查询值 = 元素边框盒宽 − 64px 内衬,上表已经减过了。用 `getBoundingClientRect()` 对照时会多出这 64px。

---

## 4. 排版基准

全部走 DS 排版角色,**不得出现任意 px 字号或裸 `text-xs/sm/base`**。除一致性外的硬理由:用户的字号偏好(`html.vx-font-small|default|large`)只作用于角色,任意 px 是写死的,偏好会半残。

| 位置 | 基准 |
|---|---|
| 导航栏 / 值班台正文 | 14px(`*-md` 档:`text-body-md` / `text-label-md` / `font-mono text-code-md`) |
| 角标、板块眉头 | 12px(`*-sm` 档、`text-overline`) |
| 卡片标题 | `text-label-md` / `text-title-sm` |
| 卡内主数字 | `text-title-lg font-mono` |

**陷阱(DS `07-consumption-pitfalls.md` 同源):**

1. 角色**不含字族**——`text-code-md` 只给等宽的字号/行高/字重/字距,字族仍需 `font-mono` 同挂。
2. **不要写 `leading-none`**:Tailwind v4 的 `leading-*` 回落到 `--spacing-*`,而 DS 注册了 `--spacing-none: 0px`,于是它等于 `line-height: 0`;同一元素若还带 `truncate`,整块渲染成空白。角色自带行高,通常无需任何 leading 工具类。
3. 只改一项属性时用**单属性工具类**(`font-mono`、`font-semibold`)覆盖,不要叠第二个角色。

---

## 5. 面与色

- 卡面由**上下渐变**承载(`bg-gradient-to-b from-card/80 to-card/30`),边框压到 `border-primary/[0.06]` 一道发丝;选中态把同一条渐变加深成品牌色,是唯一允许边框看得见的地方。
- 导航栏图表只用一张色表(`TONE`,声明在 `NavPane.tsx`),扇形/色块/柱条/数字全部从同一条目取色——`color-mix(oklab)` 混出的颜色与 `bg-primary/60` 这类工具类**不是同一个值**,分开写必然对不上。
- 色义:brand = 量/在制/资产;ai = 能力平台(Runos);success = 已验证/增长;warning = 待办/需关注/异常;danger = 失败/缺口。

---

## 6. 文件对应

| 文件 | 职责 |
|---|---|
| `_shell/PortalShell.tsx` | 工作区骨架、三个空间常量、`@container` 声明、pane 展开状态(localStorage) |
| `_shell/AppHeader.tsx` | 顶栏 |
| `_shell/NavPane.tsx` | 导航栏;词汇表与色表的声明处 |
| `_shell/StewardDock.tsx` | 值班台 |
| `_shell/PageHead.tsx` | 内容区统一页头 |
| `_shell/nav.ts` | 功能域清单(顶栏 launcher 与导航栏共用的唯一来源)、全屏目标 id |
