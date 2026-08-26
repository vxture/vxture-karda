import { test } from "node:test";
import assert from "node:assert/strict";
import { windowDocument, runExtraction, WINDOW_BUDGET, type StoreFn } from "./extract-run";
import { UnavailableError, QuotaError } from "../processing/orchestrator";
import type { ExtractionClient, ExtractionRequest } from "../atlas/extract";
import type { RawAssertion } from "./extract";

const para = (n: number, size: number) => `第${n}段。` + "内".repeat(size);

class FakeClient implements ExtractionClient {
  calls: ExtractionRequest[] = [];
  constructor(private behaviour: (req: ExtractionRequest, i: number) => RawAssertion[] | Error) {}
  async extract(req: ExtractionRequest): Promise<RawAssertion[]> {
    const out = this.behaviour(req, this.calls.length);
    this.calls.push(req);
    if (out instanceof Error) throw out;
    return out;
  }
}

// Nothing here needs a database: the rules under test are windowing, offsets and
// the park/park-not decision.
const noStore: StoreFn = async () => ({ assertionIds: [], spansWritten: 0, evidenceWritten: 0, entitiesCreated: 0, mentionsWritten: 0 });

const input = (text: string, over: Partial<Parameters<typeof runExtraction>[1]> = {}) => ({
  documentId: "doc-1",
  documentVersion: 1,
  kbId: "kb-1",
  mime: "text/markdown",
  bytes: Buffer.from(text, "utf-8"),
  tenantId: "org-1",
  workspaceId: "ws-1",
  taskId: "task-1",
  extractedBy: "probe",
  ...over,
});

// --- windowing --------------------------------------------------------------------

test("a short document is one window anchored at its first element", () => {
  const w = windowDocument("第一段。\n\n第二段。");
  assert.equal(w.length, 1);
  assert.equal(w[0].baseOffset, 0);
});

test("windows split at ELEMENT boundaries, never mid-sentence", () => {
  // A fixed character cut can turn "the contract was NOT renewed" into "the
  // contract was" - a true statement of something the document never said.
  const doc = [para(1, 100), para(2, 100), para(3, 100)].join("\n\n");
  const windows = windowDocument(doc, 150);
  assert.ok(windows.length > 1);
  for (const w of windows) {
    assert.ok(w.text.startsWith("第"), `window starts mid-element: ${JSON.stringify(w.text.slice(0, 12))}`);
  }
});

test("every window's baseOffset actually locates its text in the document", () => {
  // The whole provenance chain rests on this: get it wrong and every assertion
  // anchors to text that does not say it.
  const doc = [para(1, 200), para(2, 200), para(3, 200)].join("\n\n");
  for (const w of windowDocument(doc, 300)) {
    assert.equal(doc.slice(w.baseOffset, w.baseOffset + w.text.length), w.text);
  }
});

test("an element larger than the budget gets its own oversized window, not a cut", () => {
  const doc = para(1, WINDOW_BUDGET * 2);
  const windows = windowDocument(doc, 100);
  assert.equal(windows.length, 1);
  assert.ok(windows[0].text.length > 100);
});

test("an empty document produces no windows and therefore no Atlas call", () => {
  assert.deepEqual(windowDocument("   \n\n  "), []);
});

// --- the ungranted path: what this whole PR is about ------------------------------

test("a parked capability writes NOTHING and reports why", async () => {
  const client = new FakeClient(() => new UnavailableError("no karda.extract grant"));
  const r = await runExtraction(client, input("第一段。\n\n第二段。"), noStore);
  assert.equal(r.status, "parked");
  assert.equal(r.reason, "capability_unavailable");
  assert.equal(r.stored, null);
});

test("quota parks too, under its own reason code", async () => {
  const client = new FakeClient(() => new QuotaError("out"));
  const r = await runExtraction(client, input("第一段。"), noStore);
  assert.equal(r.status, "parked");
  assert.equal(r.reason, "quota_exhausted");
});

test("ALL WINDOWS OR NOTHING - a park in a later window discards the earlier answers", async () => {
  // Storing what succeeded sounds thriftier and is wrong: a resumed run has no
  // record of which windows landed, so it re-extracts them and the document ends
  // up with every early assertion twice.
  // Big enough to actually cross WINDOW_BUDGET - runExtraction uses the default.
  const doc = [para(1, WINDOW_BUDGET), para(2, WINDOW_BUDGET)].join("\n\n");
  const client = new FakeClient((_req, i) =>
    i === 0 ? [{ kind: "fact", statement: "早", startOffset: 0, endOffset: 3 }] : new UnavailableError("gone"),
  );
  const r = await runExtraction(client, input(doc, { bytes: Buffer.from(doc, "utf-8") }), noStore);
  assert.equal(r.status, "parked");
  assert.equal(r.stored, null);
  assert.equal(r.raw, 0);
});

test("a transient failure is NOT parked - it propagates to the bounded retry path", async () => {
  // Parking a karda-side bug would hide it forever behind "waiting on Atlas".
  const client = new FakeClient(() => new Error("atlas extract: response is not JSON"));
  await assert.rejects(() => runExtraction(client, input("第一段。"), noStore), /not JSON/);
});

// --- what cannot be extracted ------------------------------------------------------

test("a deep-path document is not extractable, and Atlas is never called", async () => {
  const client = new FakeClient(() => []);
  const r = await runExtraction(client, input("x", { mime: "application/pdf" }), noStore);
  assert.equal(r.status, "not_extractable");
  assert.equal(r.reason, "deep_path_mime");
  assert.equal(client.calls.length, 0);
});

test("a document with no stored bytes is not extractable", async () => {
  const r = await runExtraction(new FakeClient(() => []), input("x", { bytes: null }), noStore);
  assert.deepEqual([r.status, r.reason], ["not_extractable", "no_source_bytes"]);
});

// --- the seam to prepare() ----------------------------------------------------------

test("offsets are bounds-checked against the WHOLE document, not the window", async () => {
  // The client rebases into document coordinates before returning, so a window
  // that starts at 300 legitimately yields offsets past the window's own length.
  // Big enough to actually cross WINDOW_BUDGET - runExtraction uses the default.
  const doc = [para(1, WINDOW_BUDGET), para(2, WINDOW_BUDGET)].join("\n\n");
  const client = new FakeClient((req) => [
    { kind: "fact", statement: "s", startOffset: req.window.baseOffset, endOffset: req.window.baseOffset + 5 },
  ]);
  const r = await runExtraction(client, input(doc, { bytes: Buffer.from(doc, "utf-8") }), noStore);
  assert.equal(r.status, "ok");
  assert.equal(r.batch!.rejected.length, 0, JSON.stringify(r.batch!.rejected));
});

test("CRLF is normalised before windowing, so offsets match the canonical space", async () => {
  const crlf = "第一段。" + String.fromCharCode(13, 10, 13, 10) + "第二段。";
  const client = new FakeClient(() => []);
  const r = await runExtraction(client, input(crlf, { bytes: Buffer.from(crlf, "utf-8") }), noStore);
  assert.equal(r.status, "ok");
  assert.ok(!client.calls[0].window.text.includes(String.fromCharCode(13)));
});
