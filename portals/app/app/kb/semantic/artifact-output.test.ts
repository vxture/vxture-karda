import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { writeReproducibleArtifact } from "../../../../../scripts/knowledge/artifact-output";

test("artifact generators create once and identical reproduction performs no replacement", () => {
  const root = mkdtempSync(join(tmpdir(), "karda-artifact-")), file = join(root, "nested", "draft.json");
  try {
    assert.equal(writeReproducibleArtifact(file, '{"reviewStatus":"agent_draft"}\n'), "created");
    assert.equal(writeReproducibleArtifact(file, '{"reviewStatus":"agent_draft"}\n'), "unchanged");
    assert.throws(() => writeReproducibleArtifact(file, '{"reviewStatus":"different"}\n'), /artifact_overwrite_refused/);
    assert.equal(readFileSync(file, "utf8"), '{"reviewStatus":"agent_draft"}\n');
  } finally { rmSync(root, { recursive: true }); }
});

test("reviewed artifacts and partial writes are preserved instead of repaired by a draft generator", () => {
  const root = mkdtempSync(join(tmpdir(), "karda-artifact-")), file = join(root, "review.json");
  try {
    for (const existing of ['{"reviewStatus":"human_reviewed","note":"keep"}\n', "", "partial"]) {
      writeFileSync(file, existing);
      assert.throws(() => writeReproducibleArtifact(file, '{"reviewStatus":"agent_draft"}\n'), /artifact_overwrite_refused/);
      assert.equal(readFileSync(file, "utf8"), existing);
    }
  } finally { rmSync(root, { recursive: true }); }
});

test("output directories and symbolic links cannot substitute for an artifact file", () => {
  const root = mkdtempSync(join(tmpdir(), "karda-artifact-")), folder = join(root, "folder");
  try {
    mkdirSync(folder);
    assert.throws(() => writeReproducibleArtifact(folder, "anything"), /artifact_overwrite_refused/);
    // Directory junctions work on Windows without symlink privileges.
    const link = join(root, "link");
    symlinkSync(folder, link, "junction");
    assert.throws(() => writeReproducibleArtifact(link, "anything"), /artifact_overwrite_refused/);
  } finally { rmSync(root, { recursive: true }); }
});

test("official draft generator re-runs without changing the pinned corpus or case file", () => {
  const files = ["../../scripts/knowledge/corpus/procurement-regulations-2015.json",
    "../../scripts/knowledge/corpus/procurement-draft-cases.json"];
  const before = files.map(file => readFileSync(file));
  const result = spawnSync(process.execPath, ["--import", "tsx", "../../scripts/knowledge/build-draft-cases.ts"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  files.forEach((file, index) => assert.deepEqual(readFileSync(file), before[index]));
});
