import { test } from "node:test";
import assert from "node:assert/strict";
import type { Locale } from "@vxture/shared";
import { states } from "./states";
import { apiErrorKey } from "../apiError";

const LOCALES: Locale[] = ["zh-CN", "en-US"];

// --- the mapping (structure, no renderer needed) ------------------------------

test("apiErrorKey maps the statuses the product actually surfaces", () => {
  assert.equal(apiErrorKey(401).key, "errSessionExpired");
  assert.equal(apiErrorKey(403, "forbidden").key, "errForbidden");
  assert.equal(apiErrorKey(404).key, "errNotFound");
  assert.equal(apiErrorKey(409, "duplicate_document").key, "errDuplicateDocument");
  assert.equal(apiErrorKey(409, "name_taken").key, "errNameTaken");
  assert.equal(apiErrorKey(409, "binding_exists").key, "errBindingExists");
  assert.equal(apiErrorKey(500).key, "errServer");
});

test("an unrecognised 409 still gets the generic conflict wording", () => {
  assert.equal(apiErrorKey(409, "something_else").key, "errConflict");
});

test("an unmapped code is surfaced, not swallowed by a friendly generic", () => {
  const m = apiErrorKey(400, "some_new_code");
  assert.equal(m.key, "errRefused");
  assert.equal(m.withCode, true, "the code must reach the screen so it gets mapped");
  assert.equal(apiErrorKey(400).withCode, false, "no code, nothing to append");
});

// --- the prose (one judgement, asserted in every locale) ----------------------
//
// These are not translation checks - `catalog.test.ts` already pins that every
// message carries every locale. They are PRODUCT judgements about what a
// sentence must tell the reader, and a judgement that holds in one language and
// not the other is a half-translated product.

/** Only the plain-string entries can be pattern-matched directly; the
 *  interpolated ones are checked through their probes below. */
type PlainKey = {
  [K in keyof typeof states]: (typeof states)[K] extends Record<Locale, string> ? K : never;
}[keyof typeof states];

function eachLocale(key: PlainKey, patterns: Record<Locale, RegExp[]>) {
  for (const locale of LOCALES) {
    for (const re of patterns[locale]) {
      assert.match(states[key][locale], re, `${key} [${locale}] must match ${re}`);
    }
  }
}

test("binding_exists names BOTH causes, because the second one surprises people", () => {
  // uidx_binding_kb_connector_source has no state predicate, so a REVOKED
  // binding keeps its row and permanently occupies that identifier for the
  // library. A bare "conflicts with something that exists" leaves the owner
  // retrying forever.
  eachLocale("errBindingExists", {
    "zh-CN": [/撤销/, /不可逆|无法重新绑定/],
    "en-US": [/revok/i, /irreversible|cannot be bound again/i],
  });
  for (const locale of LOCALES) {
    assert.notEqual(
      states.errBindingExists[locale],
      states.errConflict[locale],
      "it must not fall through to the generic 409 wording",
    );
  }
});

test("illegal_transition says WHY, not just that it failed", () => {
  eachLocale("errIllegalTransition", {
    "zh-CN": [/终态|无法恢复/],
    "en-US": [/terminal|cannot be undone/i],
  });
});

test("the processing hint promises the content is not lost - that is the whole point", () => {
  // A document parked in `processing` while the embedding service is down looks
  // identical to one that was dropped. The hint exists to say it was not.
  eachLocale("processingHint", {
    "zh-CN": [/不会丢/],
    "en-US": [/nothing is lost/i],
  });
});

test("session expiry tells the reader what to DO, not just what happened", () => {
  eachLocale("errSessionExpired", {
    "zh-CN": [/重新登录/],
    "en-US": [/sign in again/i],
  });
});

test("every state in each machine has a label in every locale", () => {
  const CONTENT = ["Draft", "Processing", "Indexed", "Failed", "Archived", "Deleted"];
  const VERIF = ["Unverified", "Verified", "Stale"];
  const SHARE = ["Private", "Workspace", "Org"];
  for (const s of CONTENT) assert.ok(states[`content${s}` as keyof typeof states], `content${s}`);
  for (const s of VERIF) assert.ok(states[`verif${s}` as keyof typeof states], `verif${s}`);
  for (const s of SHARE) {
    assert.ok(states[`share${s}` as keyof typeof states], `share${s}`);
    assert.ok(states[`share${s}Help` as keyof typeof states], `share${s}Help`);
  }
});
