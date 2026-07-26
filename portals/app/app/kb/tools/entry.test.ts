import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntry, type EntryDeps } from "./entry";
import type { CallerContext } from "./s2s";
import { KbService } from "../lib/service";
import { InMemoryKbStore } from "../lib/store";
import { ContentService } from "../lib/content-service";
import { InMemoryContentStore } from "../lib/content-store";
import { PresetTemplateResolver } from "../lib/template-resolver";
import { InMemoryUsageStore, setUsageStore } from "../../usage/lib/store";

const oboCaller = (over: Partial<CallerContext> = {}): CallerContext => ({
  callerProduct: "agent",
  org: "org1",
  workspace: "ws1",
  user: "u1",
  mode: "obo",
  ...over,
});

async function fixture() {
  const kb = new KbService(new InMemoryKbStore());
  const content = new ContentService(new InMemoryContentStore());
  const templates = new PresetTemplateResolver();
  const lib = await kb.create({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "L" });
  assert.ok(lib.ok);
  const deps: EntryDeps = { kb, content, templates };
  return { deps, kbId: lib.value.id, content };
}

test("create_entry validates fields against the template, writes a draft, and meters ingest", async () => {
  const usage = new InMemoryUsageStore();
  setUsageStore(usage);
  try {
    const { deps, kbId, content } = await fixture();
    const r = await createEntry(
      oboCaller(),
      { kb_id: kbId, template_id: "faq", fields: { question: "What is Karda?", answer: "A knowledge service." } },
      deps,
    );
    assert.equal(r.status, 201);
    const entryId = (r.body.entry as { id: string; content_state: string }).id;
    assert.equal((r.body.entry as { content_state: string }).content_state, "draft", "an entry lands in draft");

    const got = await content.getEntry(entryId);
    assert.ok(got.ok);
    assert.equal(got.value.contentTemplateId, "ctpl_faq");
    assert.equal(got.value.templateVersion, 1);

    const buffered = await usage.unflushed(10);
    assert.equal(buffered.length, 1, "one ingest event buffered");
    assert.equal(buffered[0].metric, "karda.ingest");
    assert.equal(buffered[0].workspaceId, "ws1");
    assert.equal(buffered[0].idempotencyKey, `karda.ingest:${entryId}`);
  } finally {
    setUsageStore(null);
  }
});

test("create_entry rejects a missing required field (400) and does not meter", async () => {
  const usage = new InMemoryUsageStore();
  setUsageStore(usage);
  try {
    const { deps, kbId } = await fixture();
    const r = await createEntry(oboCaller(), { kb_id: kbId, template_id: "faq", fields: { question: "Q only" } }, deps);
    assert.equal(r.status, 400);
    assert.match(r.body.detail as string, /answer/);
    assert.equal((await usage.unflushed(10)).length, 0, "a rejected entry is not metered");
  } finally {
    setUsageStore(null);
  }
});

test("create_entry rejects an unknown field (400)", async () => {
  const { deps, kbId } = await fixture();
  const r = await createEntry(
    oboCaller(),
    { kb_id: kbId, template_id: "faq", fields: { question: "Q", answer: "A", bogus: "x" } },
    deps,
  );
  assert.equal(r.status, 400);
  assert.match(r.body.detail as string, /bogus/);
});

test("create_entry 404s an unknown template code before touching the library", async () => {
  const { deps, kbId } = await fixture();
  const r = await createEntry(oboCaller(), { kb_id: kbId, template_id: "nope", fields: { x: 1 } }, deps);
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "unknown_template");
});

test("create_entry rejects a library outside the caller's workspace (knowing an id is not permission)", async () => {
  const { deps, kbId } = await fixture();
  const r = await createEntry(
    oboCaller({ workspace: "other-ws" }),
    { kb_id: kbId, template_id: "faq", fields: { question: "Q", answer: "A" } },
    deps,
  );
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "not_found");
});

test("create_entry validates args: kb_id, template_id, and fields shape", async () => {
  const { deps, kbId } = await fixture();
  assert.equal((await createEntry(oboCaller(), { template_id: "faq", fields: {} }, deps)).status, 400);
  assert.equal((await createEntry(oboCaller(), { kb_id: kbId, fields: {} }, deps)).status, 400);
  assert.equal((await createEntry(oboCaller(), { kb_id: kbId, template_id: "faq" }, deps)).status, 400);
  assert.equal(
    (await createEntry(oboCaller(), { kb_id: kbId, template_id: "faq", fields: ["not", "an", "object"] }, deps)).status,
    400,
  );
});
