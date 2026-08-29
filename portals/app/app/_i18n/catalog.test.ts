import test from "node:test";
import assert from "node:assert/strict";
import { resolve, t } from "./index";
import { shell } from "./messages/shell";
import { common } from "./messages/common";
import { NAMESPACES } from "./messages/registry";

const LOCALES = ["zh-CN", "en-US"] as const;

/**
 * Arguments for the interpolated messages, keyed `namespace.key`.
 *
 * An entry here is REQUIRED for every function-valued message: the earlier
 * version of these tests skipped anything that was not a string, which meant a
 * `MessageFn` whose English half returned Chinese passed every check. Requiring
 * a probe turns "someone added a function" into a failing test rather than a
 * silent gap.
 */
const PROBES: Record<string, unknown[]> = {
  "common.documentCount": [3],
  "common.itemCount": [5],
  "shell.docsCount": [7],
  "assets.coverageAria": [82],
  "assets.openAsset": ["Bid library"],
  "assets.restAssets": [8],
  "assets.cardEntries": [247],
  "assets.cardDocs": [12],
  "assets.parkedCount": [3],
  "assets.hotConsumers": ["forge · anlan"],
  "assets.heatTimes": [412],
  "assets.heatLast7d": [412],
  "assets.pageMeta": [13, "3,948", 82],
  "assets.coverageTag": ["3,249", "3,948"],
  "assets.directTag": [812],
  "assets.runosTag": [392],
  "assets.preVerifiedTag": [41],
  "assets.conflictTag": [3],
  "assets.refluxTag": [27],
  "assets.tagAll": [13],
  "channels.pageMeta": ["1,204", 812, 392, 180],
  "channels.capCallsToday": ["486"],
  "channels.failedCount": [48],
  "channels.toolsMeta": [9, "2026-08"],
  "channels.meteringLead": [5, 4],
  "channels.accessAuth": ["OIDC"],
  "channels.toolsListLead": ["/.well-known/vxture-tools"],
  "channels.benchMeta": [13, 2],
  "channels.citationsLabel": [4],
  "channels.scopeSearched": [3],
  "channels.ignoredLead": [2],
  "pipeline.boardMeta": [62, 38, 94],
  "pipeline.pendingTitle": [5],
  "pipeline.restLink": [3],
  "pipeline.tasksMeta": [12, 40],
  "pipeline.tileThroughputNote": [38],
  "pipeline.countInflight": [12],
  "pipeline.countSuspended": [2],
  "pipeline.countFailed": [6],
  "pipeline.tierQueued": [21, "2 concurrent"],
  "pipeline.triggerLabel": ["template change"],
  "pipeline.rollbackLeft": ["18h"],
  "pipeline.asideConflicts": [3],
  "pipeline.statusRunning": ["Parse"],
  "pipeline.statusRetrying": [3],
  "pipeline.statusFailed": ["Parse"],
  "pipeline.attemptNth": [2],
  "evaluation.pageMeta": [82, 26, "Baseline · bge-m3@v2"],
  "evaluation.baselineLabel": ["bge-m3@v2"],
  "evaluation.verifiedTag": ["3,156"],
  "evaluation.belowFloorEmpty": [70],
  "evaluation.staleCount": [26],
  "evaluation.workAsset": ["Bid library"],
  "evaluation.questionCount": [120],
  "evaluation.gapCount": [3],
  "evaluation.sweepDoneStaled": [412, 7],
  "evaluation.sweepDoneClean": [412],
  "evaluation.queueScopeOne": ["Bid library"],
  "evaluation.queueMeta": [26, 672],
  "evaluation.doneThisSession": [4],
  "evaluation.expiresAt": ["2026-09-01"],
  "evaluation.lastVerified": ["2026-06-01"],
  "evaluation.setsMeta": [4],
  "evaluation.scopeCount": [2],
  "evaluation.questionsTitle": ["Bid QA set"],
  "evaluation.evidenceCount": [3],
  "evaluation.runSkipped": [4],
  "evaluation.runComparedTo": ["bge-m3@v1"],
  "evaluation.citationHits": [3, 5],
  "pipeline.asidePending": [5],
  "pipeline.alertBody": ["Standards library", "failure rate 31% over the 30% threshold"],
  "shell.collapseItem": ["Knowledge assets"],
  "shell.expandItem": ["Knowledge assets"],
  "shell.hubRest": [4],
  "shell.workspaceLabel": ["ws_0a1b"],
  "shell.orgLabel": ["org_9f2c"],
  "shell.roleLine": ["Admin"],
  "shell.pendingBadge": [3],
  "assets.failedCount": [2],
  "assets.verifiedWhen": ["2026-08-25 10:00"],
  "assets.metaDocs": [4],
  "assets.metaFailed": [1],
  "assets.okUpload": ["report.pdf"],
  "assets.okVerifyDoc": ["report.pdf"],
  "assets.okReprocess": ["report.pdf"],
  "assets.okBind": ["Confluence", "SPACE-1"],
  "assets.okRevoke": ["SPACE-1", 3],
  "assets.okShare": ["Workspace"],
  "assets.okFolderDelete": ["Policies"],
  "assets.syncedWhen": ["2026-08-25 10:00"],
  "assets.cursorLabel": ["c-91"],
  "assets.revokeConsequence": [12, 3],
  "assets.templateSpec": [512, 1024],
  "assets.fieldsBudget": [3, 8],
  "assets.fieldsSystemDims": [2, ["kb_id", "folder_id"]],
  "assets.fieldFilterableAria": ["owner"],
  "assets.govOn": ["every 30 days"],
  "assets.folderRenameAria": ["Policies"],
  "states.recordLapsedDays": [30],
  "states.recordOverdueDays": [12],
  "states.recordDueDays": [7],
  "states.intervalEvery": [30],
};

/** Every message in every namespace, already flattened to comparable strings. */
function* entries(): Generator<{ path: string; zh: string; en: string }> {
  for (const [ns, table] of Object.entries(NAMESPACES)) {
    for (const [key, msg] of Object.entries(table as Record<string, unknown>)) {
      const path = `${ns}.${key}`;
      const halves = msg as Record<string, unknown>;
      const zh = halves["zh-CN"];
      const en = halves["en-US"];
      assert.ok(zh !== undefined && zh !== null, `${path} is missing zh-CN`);
      assert.ok(en !== undefined && en !== null, `${path} is missing en-US`);

      if (typeof zh === "function" || typeof en === "function") {
        const args = PROBES[path];
        assert.ok(args, `${path} is interpolated but has no PROBES entry - add one`);
        assert.equal(typeof zh, "function", `${path} zh-CN must also be a function`);
        assert.equal(typeof en, "function", `${path} en-US must also be a function`);
        yield {
          path,
          zh: (zh as (...a: unknown[]) => string)(...args),
          en: (en as (...a: unknown[]) => string)(...args),
        };
        continue;
      }
      yield { path, zh: zh as string, en: en as string };
    }
  }
}

// --- the contract the shape exists to enforce ---------------------------------

test("every message carries EVERY supported locale", () => {
  // This is the whole reason the catalog is keyed message-first rather than
  // locale-first: a per-locale file lets the two drift, and a missing key is
  // only a runtime blank. `entries()` asserts presence as it walks.
  let n = 0;
  for (const _ of entries()) n += 1;
  assert.ok(n > 0, "the registry resolved to no messages at all");
});

/**
 * 两个语言下**故意相同**的条目,以及为什么。
 *
 * 与 `SAME_ON_PURPOSE` 不是一回事:那个管的是「两个键说同一句话」,这个管的是
 * 「一个键的两半一样」。都要写理由——没有理由的豁免就是把规则改松。
 *
 * 唯一合法的理由是**专名**:产品名、品牌名。翻译一个产品名会得到另一个产品。
 * 措辞、标签、说明一律不进这里。
 */
const UNTRANSLATED_ON_PURPOSE: Record<string, string> = {
  "shell.agentName":
    "Karda Super Agent —— karda 平台独有 super agent 的产品名(owner 2026-08-28 定名)。中文「卡尔达」是它旁边的 tag(`shell.hubTag`),不是它的译名",
};

test("no message is left as an untranslated copy of the other language", () => {
  // A pair whose two halves are identical is almost always a placeholder
  // someone pasted and meant to come back to. Punctuation-only and
  // number-only values are legitimately identical, so they are exempt.
  const exempt = /^[\s\d\p{P}]*$/u;
  for (const { path, zh, en } of entries()) {
    if (exempt.test(zh)) continue;
    if (UNTRANSLATED_ON_PURPOSE[path]) continue;
    assert.notEqual(zh, en, `${path} has the same text in both languages`);
  }
});

test("the English half contains no CJK", () => {
  // The failure this catches is a half-done sweep: someone adds a key, fills
  // zh, and pastes zh into en to make it compile. Nothing else would notice -
  // and for an interpolated message, nothing did, until PROBES.
  for (const { path, en } of entries()) {
    assert.ok(!/[\u4e00-\u9fff]/.test(en), `${path} en-US contains CJK: ${en}`);
  }
});

test("the Chinese half of a product string is not left in English", () => {
  // The mirror failure, and the likelier one now that DS ships English
  // defaults: a key gets its English filled from the DS default and the
  // Chinese never written. Proper nouns and pure symbols are legitimately
  // shared, so only a zh half that is IDENTICAL to a multi-word English
  // sentence is treated as unwritten - single tokens are exempt.
  for (const { path, zh, en } of entries()) {
    if (!/[a-zA-Z]/.test(zh)) continue;
    if (/[\u4e00-\u9fff]/.test(zh)) continue;
    if (UNTRANSLATED_ON_PURPOSE[path]) continue;
    assert.ok(
      !(zh === en && en.trim().split(/\s+/).length > 1),
      `${path} zh-CN looks unwritten: ${zh}`,
    );
  }
});

/**
 * Pairs that are IDENTICAL on purpose, `"a.b == c.d"`, with the reason.
 *
 * Everything not listed here is an accident waiting to drift. The check found
 * sixteen on its first run, including four API-failure sentences duplicated
 * verbatim from `states.ts` into a `common` namespace that nothing imported -
 * a second, untested copy of the error catalog living inside the very layer
 * that exists to prevent one.
 */
const SAME_ON_PURPOSE: Record<string, string> = {
  "shell.settings == assets.tabSettings":
    "the system settings entry in the 顶栏 vs an asset's own settings tab - different things that share a word",
  "shell.densityDefault == shell.sizeDefault":
    "two preference axes; a language that distinguishes them would translate them differently",
  "shell.pipeFailed == states.contentFailed":
    "a pipeline count label vs a document's content state - different subjects",
  "assets.actVerify == pipeline.stageVerify":
    "验证 as an ACTION on one document vs 验证 as the name of a pipeline STAGE - a verb and a noun that share a word",
  "evaluation.metricLatency == channels.metricP95":
    "retrieval P95 measured in two different circumstances - live serving on the channel dashboard, one evaluation run on the quality card - so the name is right on both and the figures are not comparable",
  "pipeline.stageCommit == pipeline.procCommit":
    "two stage enumerations that share their terminal name: the STEWARD pass ends at 入藏, and so does the mechanical pipeline - the word is right in both",
  "states.contentProcessing == states.healthProcessing":
    "two state machines that share a word: a DOCUMENT being processed, and an ASSET whose documents are - they move independently",
};

test("no two catalog entries say the same thing without saying why", () => {
  const byText = new Map<string, string[]>();
  for (const { path, zh, en } of entries()) {
    // Punctuation- and digit-only values are legitimately shared.
    if (/^[\s\d\p{P}]*$/u.test(zh)) continue;
    const k = `${zh} ${en}`;
    if (!byText.has(k)) byText.set(k, []);
    byText.get(k)!.push(path);
  }
  const unexplained: string[] = [];
  for (const paths of byText.values()) {
    if (paths.length < 2) continue;
    for (let i = 1; i < paths.length; i += 1) {
      const key = `${paths[0]} == ${paths[i]}`;
      if (!SAME_ON_PURPOSE[key]) unexplained.push(key);
    }
  }
  assert.deepEqual(
    unexplained,
    [],
    "collapse the duplicate onto one entry, or add it to SAME_ON_PURPOSE with the reason",
  );
});

test("UNTRANSLATED_ON_PURPOSE has no stale entries", () => {
  // 一条豁免如果对应的键已经不再两半相同(或者压根不存在了),它就该被删掉——
  // 留着的豁免会在下一次有人把那个键改成真需要翻译时,悄悄替他挡掉报警。
  const byPath = new Map([...entries()].map((e) => [e.path, e]));
  const stale = Object.keys(UNTRANSLATED_ON_PURPOSE).filter((p) => {
    const e = byPath.get(p);
    return !e || e.zh !== e.en;
  });
  assert.deepEqual(stale, [], "these exemptions no longer describe anything - delete them");
});

test("SAME_ON_PURPOSE has no stale entries", () => {
  // A listed pair that is no longer identical means someone changed one half
  // and left the exception behind - the next real duplicate would then hide
  // under it.
  const seen = new Set<string>();
  const byText = new Map<string, string[]>();
  for (const { path, zh, en } of entries()) {
    const k = `${zh} ${en}`;
    if (!byText.has(k)) byText.set(k, []);
    byText.get(k)!.push(path);
  }
  for (const paths of byText.values()) {
    for (let i = 1; i < paths.length; i += 1) seen.add(`${paths[0]} == ${paths[i]}`);
  }
  for (const key of Object.keys(SAME_ON_PURPOSE)) {
    assert.ok(seen.has(key), `${key} is no longer a duplicate - drop it from SAME_ON_PURPOSE`);
  }
});

// --- resolution ---------------------------------------------------------------

test("resolve binds one locale's half of a whole namespace", () => {
  const zh = resolve(shell, "zh-CN");
  const en = resolve(shell, "en-US");
  assert.equal(zh.navAssets, "知识资产");
  assert.equal(en.navAssets, "Knowledge assets");
});

test("interpolated messages resolve to a CALLABLE, not a string", () => {
  // Word order is not shared between languages - Chinese puts the quantifier
  // where English puts a plural suffix - so these are functions per locale
  // rather than one template with placeholders.
  const zh = resolve(common, "zh-CN");
  const en = resolve(common, "en-US");
  assert.equal(zh.documentCount(3), "3 份文档");
  assert.equal(en.documentCount(3), "3 documents");
  assert.equal(en.documentCount(1), "1 document", "English needs the singular; Chinese does not distinguish");
  assert.equal(zh.documentCount(1), "1 份文档");
});

test("t() reads one message without binding a namespace", () => {
  assert.equal(t(shell.navChannels, "en-US"), "Supply channels");
});
