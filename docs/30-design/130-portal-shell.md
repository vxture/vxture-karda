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
| 值班台 | steward dock | 右侧管家值班台,400px | ARIA `<aside>`;Xcode inspector |
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
| 栏间距 pane spacer | 32px | `gap-xl`(工作区行) | owner 2026-08-25 |
| 内衬 content inset | 16px | `px-md`(内容区内层) | owner 2026-08-25 |

导航栏与值班台**贴外边距**,自己不加边距;内容区是唯一的例外,额外加 16px 内衬,于是内容距两侧 pane 为 `32 + 16 = 48px`(2026-08-25 前是 `24 + 32 = 56px`)。理由不变:两侧是卡片面,内容也是卡片面,只隔一个栏间距时读起来是挤在一起的(owner 2026-08-24)——改的是这段留白由谁出,从内衬为主改成栏间距为主。

**写 token 不写字面量。** 三个值都用 `p-lg` / `gap-xl` / `px-md`,而不是
`p-[24px]` 这样的字面量:间距刻度是**密度偏好轴**(`.density-default` /
`.density-compact` / …,见 `@vxture/design-tokens` 的 `spacing-semantic.css`),
默认档下 `md/lg/xl` 恰好是 16/24/32px,压缩档下整体收窄。外壳框架若钉死像素、
里面的控件却跟着密度收紧,读起来是坏的。

**pane 宽度反过来,写字面量**(`w-[17.5rem]` / `w-[25rem]`):它们由**装什么**
决定——一列卡片是 280px 因为卡片是那么宽——不是节奏量,不该跟密度走。

底部另有安全留出(`pb-5xl`),滚到底时最后一块不贴边。

---

## 3. 列数规则:由内容区宽度决定,不由视口

**页面里的列数一律用容器查询,不得用 `sm:` / `xl:` / `2xl:` 视口断点。** 视口断点看不见导航栏和值班台是否展开,这正是 1600px 窗口把四列画进 840px 内容区的原因。

`PortalShell.tsx` 把内容区内层标为 `@container`,页面用 `@min-[Nrem]:` 查询它。

内容区实际宽度 = 视口 − 48(外边距)− 280(导航栏)− 400(值班台)− 64(两处栏间距)− 32(内衬):

| 视口 | 两侧展开 | 两侧收起 | 展开值(2026-08-25 前) |
|---|---|---|---|
| 1440 | 38.5rem | 85rem | 42.5rem |
| 1600 | 48.5rem | 95rem | 52.5rem |
| 1920 | 68.5rem | 115rem | 72.5rem |

2026-08-25 的框架调整对**两侧展开**恒定 **−4rem**(值班台 +80、栏间距 +16、
内衬 −32),对**两侧收起** **+2rem**(只剩内衬那一项)。

**闸门没有跟着下调**,这是刻意的。闸门编码的是「这块内容需要多宽」,框架变了
不代表内容需求变了;容器查询存在的意义就是让布局自己降一档。把闸门整体 −4rem
等于为了保住外观去改内容下限,方向是反的。代价要写明——三个常用闸门正好卡在
新宽度上方,于是在这些视口各降一档:

| 闸门 | 用处 | 旧:够到它的最小视口 | 新 |
|---|---|---|---|
| 40rem | 资产卡三列 | 1440 | 1504 |
| 52rem | 两列版式(5 处) | 1600 | 1664 |
| 72rem | 任务 KPI 四列 | 1920 | 1984 |

也就是说 **1440 双栏展开时资产卡是两列,不再是三列**(此前 owner 2026-08-25
的「两侧展开默认三列」是在 320px 值班台下算出来的)。收起任一侧即回到三/四列
——收起控件正是为此存在。若判定某一条必须保住,改对应闸门一个数即可。

由此定资产卡网格的阶梯 —— **两侧展开时默认三列**(owner 2026-08-25),四列的闸门放在 76rem,只有收起侧栏才够得着:

```
grid-cols-1  @min-[26rem]:grid-cols-2  @min-[40rem]:grid-cols-3  @min-[76rem]:grid-cols-4
```

两列布局(`flex-col` → `flex-row`)统一在 `@min-[52rem]` 切换。

阈值不是随便定的,按**内容装得下什么**倒推。例:任务与队列的 KPI 行里,「阶段 P95」块要放五根带标签的小柱,需要约 216px 的块内宽 → 约 264px 的块 → 约 72rem 的行,所以它的四列闸门是 `@min-[72rem]`,而不是跟着别处抄 `@min-[40rem]`。

**注意容器查询量的是内容盒**:`@container` 挂在带 `px-md` 的内层上,所以查询值 = 元素边框盒宽 − 32px 内衬,上表已经减过了。用 `getBoundingClientRect()` 对照时会多出这 32px。

上表也**不再为滚动条留量**:滚动条已全局隐藏(见 §6),所以内容盒宽度就是可用
宽度。此前在 Windows 上经典滚动条会从内容区吃掉约 15px,表里的数是偏乐观的。

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

## 6. 全屏与滚动条

### 6.1 全屏 = 整个应用,走原生

全屏目标是 **shell 根**(`PORTAL_FULLSCREEN_ID`,现为 `karda-portal-shell`),
即**顶栏 + 工作区**(owner 2026-08-25)。此前目标是内容区,进入全屏后顶栏和两侧
pane 都被盖掉、只留阅读栏。

这次反转**逼出 native 模式**:伪全屏只是把元素 `position: fixed; inset: 0` 钉到
视口,而 shell 根本来就是 `h-screen`——对它做伪全屏是空操作。还能收回的只剩
浏览器自己的边框,只有 Fullscreen API 拿得到。所以 `ShellFullscreenToggle` 传
`mode="native"`。

背景由 DS 的 `:fullscreen { background: var(--background) }` 给(DS 的
`fullscreen.css`)。**不要在产品侧再补一层**:原生全屏的元素默认合成在黑底上,
少了这条规则整屏会是黑框;而它已经在 DS 里,产品重复一遍只会多一个会漂移的
副本。同理,`PortalShell.tsx` 里那段手写的 `fixed inset-0 z-50 bg-background`
伪全屏层随目标一起删掉了。

### 6.2 滚动条全局隐藏,滚动不受影响

`globals.css` 里一条 `*` 规则关掉所有滚动条的绘制(`scrollbar-width: none` +
`::-webkit-scrollbar`)。导航栏和值班台此前各自写过一遍,理由是「外壳是 chrome,
边上一条轨道会被读成内容」——这个理由对每一个面都成立,所以规则收到全局,
两处局部写法删除。

用 `*` 而不是 `html, body`:`scrollbar-width` 不继承,而本应用里真正滚动的都是
内层元素(工作区各 pane、对话框正文、预览框),不是文档本身。

滚轮、触控板、键盘、拖选自动滚动、脚本滚动**全部照常**,消失的只有那条轨道。
代价是长页面失去位置反馈;补偿是 Windows 上经典滚动条本来会占布局宽度,现在
这部分宽度还给内容(§3 的宽度表因此不再需要为它留量)。

---

## 7. 文件对应

| 文件 | 职责 |
|---|---|
| `_shell/PortalShell.tsx` | 工作区骨架、三个空间常量、`@container` 声明、pane 展开状态(localStorage) |
| `_shell/AppHeader.tsx` | 顶栏 |
| `_shell/NavPane.tsx` | 导航栏;词汇表与色表的声明处 |
| `_shell/StewardDock.tsx` | 值班台 |
| `_shell/PageHead.tsx` | 内容区统一页头 |
| `_shell/nav.ts` | 功能域清单(顶栏 launcher 与导航栏共用的唯一来源)、全屏目标 id。**只有结构,没有文案**——每条声明自己的目录键(`labelKey`/`descKey`),文案在 `_i18n/messages/shell.ts`,见 `250-i18n-seam.md` |
| `_shell/roles.ts` / `_lib/session.ts` | 角色梯级:判定在 session.ts(结构),名称在目录,顶栏与范围面板共用一份 |
| `app/globals.css` | 唯一的 `--background` 覆盖;滚动条全局隐藏(§6.2) |
