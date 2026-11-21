import { test } from "node:test";
import assert from "node:assert/strict";
import { storageConfiguration, probeStorageConfiguration } from "./config";
import { getObjectStore, InMemoryObjectStore, FilesystemObjectStore } from "./objectstore";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const keys = ["ALIYUN_OSS_BUCKET", "ALIYUN_OSS_REGION", "ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_SECRET", "KARDA_OBJECT_ROOT", "DEPLOY_STAGE"];
const full = { ALIYUN_OSS_BUCKET: "test-bucket", ALIYUN_OSS_REGION: "cn-beijing", ALIYUN_OSS_ACCESS_KEY_ID: "test-id", ALIYUN_OSS_ACCESS_KEY_SECRET: "test-secret" };
test("storage needs complete OSS or an explicit filesystem root; partial OSS never downgrades", () => {
  assert.equal(storageConfiguration(full), true);
  assert.equal(storageConfiguration({}), null);
  assert.equal(storageConfiguration({ KARDA_OBJECT_ROOT: "/tmp/objects" }), true);
  for (const key of Object.keys(full)) {
    assert.equal(storageConfiguration({ ...full, [key]: " " }), false);
  }
  assert.equal(storageConfiguration({ ALIYUN_OSS_BUCKET: "partial", KARDA_OBJECT_ROOT: "/tmp/objects" }), false);
});

test("filesystem readiness requires a readable/writable directory; new store instances reuse persisted bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "karda-storage-ready-"));
  try {
    assert.equal(await probeStorageConfiguration({ KARDA_OBJECT_ROOT: root }), true);
    assert.equal(await probeStorageConfiguration({ KARDA_OBJECT_ROOT: join(root, "missing") }), false);
    const file = join(root, "file"); await writeFile(file, "not-a-directory");
    assert.equal(await probeStorageConfiguration({ KARDA_OBJECT_ROOT: file }), false);
    assert.equal(await probeStorageConfiguration({}), null);
    const stored = await new FilesystemObjectStore(root).put("ws", "kb", Buffer.from("persistent"));
    assert.equal((await new FilesystemObjectStore(root).get(stored.key))?.toString(), "persistent");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime storage factory never grants production an ephemeral backend", () => {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    for (const stage of ["production", "beta"]) {
      process.env.DEPLOY_STAGE = stage;
      assert.throws(() => getObjectStore(), /durable_object_storage_unconfigured/);
      process.env.KARDA_OBJECT_ROOT = "/tmp/objects";
      assert.ok(getObjectStore() instanceof FilesystemObjectStore);
      delete process.env.KARDA_OBJECT_ROOT;
    }
    process.env.DEPLOY_STAGE = "dev";
    assert.ok(getObjectStore() instanceof InMemoryObjectStore);
    process.env.KARDA_OBJECT_ROOT = "/tmp/objects";
    assert.ok(getObjectStore() instanceof FilesystemObjectStore);
    process.env.ALIYUN_OSS_BUCKET = "partial";
    assert.throws(() => getObjectStore(), /durable_object_storage_unconfigured/);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
