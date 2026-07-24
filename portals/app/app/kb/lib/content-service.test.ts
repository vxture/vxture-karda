import { test } from "node:test";
import assert from "node:assert/strict";
import { ContentService } from "./content-service";
import { InMemoryContentStore, type CreateDocumentInput } from "./content-store";
import { CONTENT_PRESETS } from "./presets";

const faq = CONTENT_PRESETS.find((t) => t.templateCode === "faq")!;
const KB = "kb_1";

function svc() {
  return new ContentService(new InMemoryContentStore());
}

const doc = (over: Partial<CreateDocumentInput> = {}): CreateDocumentInput => ({
  kbId: KB,
  title: "d",
  source: "upload",
  ...over,
});

// --- folders -----------------------------------------------------------------

test("folder names are unique within a KB", async () => {
  const s = svc();
  assert.ok((await s.createFolder(KB, "specs")).ok);
  assert.deepEqual(await s.createFolder(KB, "specs"), {
    ok: false,
    error: { code: "folder_name_taken" },
  });
  // same name in a different KB is fine
  assert.ok((await s.createFolder("kb_2", "specs")).ok);
});

// --- documents: the connector_code invariant --------------------------------

test("connector documents must carry a connector_code; upload/api must not", async () => {
  const s = svc();
  assert.deepEqual(await s.createDocument(doc({ source: "connector" })), {
    ok: false,
    error: { code: "connector_code_required" },
  });
  assert.deepEqual(await s.createDocument(doc({ source: "upload", connectorCode: "arda" })), {
    ok: false,
    error: { code: "connector_code_not_allowed" },
  });
  assert.ok((await s.createDocument(doc({ source: "connector", connectorCode: "arda" }))).ok);
  assert.ok((await s.createDocument(doc({ source: "upload" }))).ok);
});

// --- documents: dedup --------------------------------------------------------

test("same origin + same hash is a duplicate; a different connector is not", async () => {
  const s = svc();
  assert.ok((await s.createDocument(doc({ contentHash: "A" }))).ok);
  assert.deepEqual(await s.createDocument(doc({ contentHash: "A" })), {
    ok: false,
    error: { code: "duplicate_document" },
  });
  // different hash: allowed
  assert.ok((await s.createDocument(doc({ contentHash: "B" }))).ok);
  // same hash but a connector origin is a different key
  assert.ok(
    (await s.createDocument(doc({ source: "connector", connectorCode: "arda", contentHash: "A" }))).ok,
  );
});

// --- documents: state machine through the service ---------------------------

test("a document starts in processing and follows the content machine", async () => {
  const s = svc();
  const created = await s.createDocument(doc());
  assert.ok(created.ok);
  assert.equal(created.value.contentState, "processing");

  // processing -> indexed: ok
  let r = await s.transitionDocument(created.value.id, "indexed");
  assert.ok(r.ok && r.value.contentState === "indexed");

  // indexed -> processing (reprocess): ok
  r = await s.transitionDocument(created.value.id, "processing");
  assert.ok(r.ok);

  // processing -> archived: illegal (must index first)
  r = await s.transitionDocument(created.value.id, "archived");
  assert.ok(!r.ok && r.error.code === "illegal_transition");
});

test("a failed document keeps its reason; recovering clears it", async () => {
  const s = svc();
  const d = await s.createDocument(doc());
  assert.ok(d.ok);
  let r = await s.transitionDocument(d.value.id, "failed", "parse timeout");
  assert.ok(r.ok && r.value.contentState === "failed" && r.value.failureReason === "parse timeout");
  // retry: failed -> processing, reason cleared
  r = await s.transitionDocument(d.value.id, "processing");
  assert.ok(r.ok && r.value.failureReason === null);
});

test("deleting a document hides it from reads", async () => {
  const s = svc();
  const d = await s.createDocument(doc());
  assert.ok(d.ok);
  await s.transitionDocument(d.value.id, "indexed");
  await s.transitionDocument(d.value.id, "deleted");
  assert.deepEqual(await s.getDocument(d.value.id), { ok: false, error: { code: "not_found" } });
});

// --- entries: template validation -------------------------------------------

test("an entry must satisfy its template's required fields", async () => {
  const s = svc();
  // FAQ requires question + answer.
  const missing = await s.createEntry(
    { kbId: KB, contentTemplateId: "t", templateVersion: 1, fields: { question: "q" } },
    faq,
  );
  assert.deepEqual(missing, { ok: false, error: { code: "missing_required_field", field: "answer" } });

  const okEntry = await s.createEntry(
    { kbId: KB, contentTemplateId: "t", templateVersion: 1, fields: { question: "q", answer: "a" } },
    faq,
  );
  assert.ok(okEntry.ok);
  assert.equal(okEntry.value.contentState, "draft");
});

test("an entry cannot carry a field the template does not declare", async () => {
  const s = svc();
  const r = await s.createEntry(
    {
      kbId: KB,
      contentTemplateId: "t",
      templateVersion: 1,
      fields: { question: "q", answer: "a", smuggled: "x" },
    },
    faq,
  );
  assert.deepEqual(r, { ok: false, error: { code: "unknown_field", field: "smuggled" } });
});

test("entry fields are editable only in draft, and re-validated on edit", async () => {
  const s = svc();
  const e = await s.createEntry(
    { kbId: KB, contentTemplateId: "t", templateVersion: 1, fields: { question: "q", answer: "a" } },
    faq,
  );
  assert.ok(e.ok);
  // edit in draft: ok
  let r = await s.editEntryFields(e.value.id, { question: "q2", answer: "a2" }, faq);
  assert.ok(r.ok);
  // edit re-validates: a required field cleared is rejected
  r = await s.editEntryFields(e.value.id, { question: "q2", answer: "" }, faq);
  assert.ok(!r.ok && r.error.code === "missing_required_field");

  // submit for processing, then editing is no longer allowed
  const t = await s.transitionEntry(e.value.id, "processing");
  assert.ok(t.ok);
  r = await s.editEntryFields(e.value.id, { question: "q3", answer: "a3" }, faq);
  assert.ok(!r.ok && r.error.code === "illegal_transition");
});

test("entry follows the content machine including draft", async () => {
  const s = svc();
  const e = await s.createEntry(
    { kbId: KB, contentTemplateId: "t", templateVersion: 1, fields: { question: "q", answer: "a" } },
    faq,
  );
  assert.ok(e.ok);
  // draft -> processing -> indexed
  assert.ok((await s.transitionEntry(e.value.id, "processing")).ok);
  assert.ok((await s.transitionEntry(e.value.id, "indexed")).ok);
  // indexed -> draft: illegal (no going back to draft)
  const r = await s.transitionEntry(e.value.id, "draft");
  assert.ok(!r.ok && r.error.code === "illegal_transition");
});
