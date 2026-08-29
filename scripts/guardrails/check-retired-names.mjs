#!/usr/bin/env node
// 退役名不许回来。
//
// 这条护栏是被一次真实的失败逼出来的:2026-08-29 把「知识管家 → 卡尔达」「值班台 →
// 智枢」清了一遍,清完发现**没有任何东西能保证它不长回来**——那些串散在
// `_i18n/messages/`、`api/`、`kb/demo/` 和 `docs/` 四个地方,而 `check-i18n-seam` 只扫
// 前一处的一部分。
//
// **为什么不是「把 api/ 和 kb/demo/ 加进 i18n 扫描面」**:那两处放的是**演示内容**
// (资产名、提案正文、活动流),它们是数据不是界面文案。把内容塞进 i18n 目录是错的
// ——目录管的是「同一句话的两种语言」,而一条演示活动流没有「另一种语言的它」。
// 方向反了,规则会立刻变成一堆豁免。
//
// 所以查的是另一件事,而且只查一件:**这些词已经退役,任何地方都不该再出现。**
// 它与语言无关、与文件类型无关,因此覆盖面正好是四处全都覆盖。
//
// 例外只有一种:**记录历史的那几行**。它们提到旧名不是残留,是它们的全部内容
// ——「旧名叫 X,已退役」这句话不写 X 就没有意义。这类行必须显式登记在 ALLOW 里,
// 连同它记的是什么。#181 就是没排除它们、被全局替换误伤,造出一个从没存在过的
// 「管家智枢」;记录写错比不写更糟。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** 扫哪些地方。产品串会出现在这四处,所以四处都扫。 */
const SCOPE = ["portals/app/app", "docs", "CLAUDE.md"];

/**
 * 退役词,以及它被什么取代。
 *
 * 只收**已经落槌**的:一个还在讨论的名字不该由护栏来推行。
 */
const RETIRED = [
  { word: "知识管家", now: "Karda Super Agent(身份出场)/ 卡尔达(行内指代)" },
  { word: "管家值班台", now: "Karda Super Agent + 智枢" },
  { word: "值班台", now: "智枢 / agent hub" },
  { word: "Steward desk", now: "Karda Super Agent" },
];

/**
 * 允许出现旧名的行:`文件:行号` -> 它记的是什么。
 *
 * 每一条都要写理由。**没有理由的豁免就是把规则改松**——而这条规则的全部价值就是
 * 「除了记录历史,别处都不许有」。
 */
const ALLOW = {
  "portals/app/app/_i18n/messages/shell.ts": "用名规则的说明:它必须写出旧名才说得清退役了什么",
  "docs/30-design/130-portal-shell.md": "词汇表与 §1.4 的退役记录:同上",
  "docs/20-specs/20-decisions.md": "KD-216 的裁定正文:裁定必须写清它改的是什么",
  "scripts/guardrails/check-retired-names.mjs": "这个文件本身:RETIRED 表里就是那些词",
};

function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|md|mjs)$/.test(p)) {
      out.push(p);
    }
  }
  return out;
}

function filesIn(entry) {
  const abs = join(root, entry);
  try {
    if (!statSync(abs).isDirectory()) return [abs];
  } catch {
    return [];
  }
  return walk(abs);
}

const hits = [];
let scanned = 0;
for (const scope of SCOPE) {
  for (const abs of filesIn(scope)) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    scanned += 1;
    if (ALLOW[rel]) continue;
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const r of RETIRED) {
        if (line.includes(r.word)) {
          hits.push(`${rel}:${i + 1}  「${r.word}」-> ${r.now}\n      ${line.trim().slice(0, 100)}`);
          return; // 一行报一次就够
        }
      }
    });
  }
}

const stale = Object.keys(ALLOW).filter((f) => {
  try {
    const src = readFileSync(join(root, f), "utf8");
    return !RETIRED.some((r) => src.includes(r.word));
  } catch {
    return true;
  }
});

if (hits.length || stale.length) {
  if (hits.length) {
    console.error(`[retired-names] ${hits.length} 处用了已退役的名字:\n`);
    for (const h of hits) console.error("  " + h);
    console.error(
      "\n改成右边那个。如果这一行是在**记录历史**(「旧名叫 X,已退役」),把文件登记进 ALLOW 并写明理由。",
    );
  }
  if (stale.length) {
    console.error(`\n[retired-names] ALLOW 里有 ${stale.length} 条已经不描述任何东西了,删掉:`);
    for (const f of stale) console.error("  " + f);
  }
  process.exit(1);
}

console.log(
  `[retired-names] OK - ${scanned} 个文件,${RETIRED.length} 个退役名一个都没回来;${Object.keys(ALLOW).length} 处历史记录已登记。`,
);
