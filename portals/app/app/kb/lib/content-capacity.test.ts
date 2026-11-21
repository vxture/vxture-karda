import { test } from "node:test";
import assert from "node:assert/strict";
import { CapacityError } from "./capacity";
import { InMemoryContentStore } from "./content-store";
import { ContentService } from "./content-service";
import { CONTENT_PRESETS } from "./presets";
import { uploadDocument } from "./upload";
import { InMemoryObjectStore } from "../storage/objectstore";
import { InMemoryBindingStore } from "../connectors/binding-store";
import { BindingService } from "../connectors/binding-service";

test("content, upload and binding services preserve capacity refusal without success or enqueue", async () => {
  const preset = { ...CONTENT_PRESETS[0], fields: [] };
  for (const code of ["capacity_exceeded", "capacity_unconfigured", "capacity_unavailable"] as const) {
    class RefusingContent extends InMemoryContentStore {
      override async createDocument(): Promise<never> { throw new CapacityError(code, "document.max"); }
      override async createEntry(): Promise<never> { throw new CapacityError(code, "document.max"); }
    }
    class RefusingBinding extends InMemoryBindingStore {
      override async create(): Promise<never> { throw new CapacityError(code, "binding.max"); }
    }
    const content = new ContentService(new RefusingContent());
    const expected = { ok: false, error: { code, metric: "document.max" } };
    assert.deepEqual(await content.createDocument({ kbId: "kb", title: "refuse", source: "api" }), expected);
    assert.deepEqual(await content.createEntry({ kbId: "kb", contentTemplateId: "template", templateVersion: 1, fields: {} }, preset), expected);
    let enqueued = false;
    assert.deepEqual(await uploadDocument({ kbId: "kb", workspaceId: "ws", title: "refuse", mime: "text/plain", bytes: Buffer.from("test") },
      content, new InMemoryObjectStore(), () => { enqueued = true; }), { ok: false, error: { code } });
    assert.equal(enqueued, false);
    assert.deepEqual(await new BindingService(new RefusingBinding()).create({ kbId: "kb", connectorCode: "arda", externalSourceId: "source" }),
      { ok: false, error: { code, metric: "binding.max" } });
  }
});
