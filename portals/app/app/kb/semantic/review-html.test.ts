import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { renderOfflineReviewHtml } from "./review-html";

test("source markup cannot close the data script or alter the exact CSP script hash", () => {
  const data = { text: "</script><script>globalThis.injected=true</script><img onerror=alert(1)>", separators: "<&\u2028\u2029" };
  const html = renderOfflineReviewHtml('<meta content="__SCRIPT_HASH__"><script>__SCRIPT__</script>', "globalThis.started=true;\r\n", data);
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
  assert.deepEqual(JSON.parse(script.slice("const DATA=".length, script.indexOf(";\n"))), data);
  assert.equal(script.includes("<img"), false);
  assert.equal(script.includes("</script>"), false);
  assert.equal(script.includes("\r"), false);
  assert(html.includes("sha256-" + createHash("sha256").update(script).digest("base64")));
  assert.throws(() => renderOfflineReviewHtml("__SCRIPT____SCRIPT__", "", {}), /invalid_review_template/);
});

test("real graph artifact contains only selected development sources and reproduces exact bytes", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "karda-review-graph-")), output = resolve(directory, "index.html");
  try {
    const args = ["--import", "tsx", resolve("../../scripts/knowledge/export-review-graph.ts"), output];
    execFileSync(process.execPath, args, { encoding: "utf8" });
    const bytes = readFileSync(output), html = bytes.toString("utf8");
    const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
    const data = JSON.parse(script.slice("const DATA=".length, script.indexOf(";\n")));
    assert.equal(data.sources.length, 5); assert.equal(data.cases.length, 32);
    assert.equal(data.sources.reduce((n: number, s: { sections: unknown[] }) => n + s.sections.length, 0), 18);
    assert.equal(html.includes("satellite-tender-20261124"), false);
    assert.equal(html.includes("CEITCL-BJ03-2609026"), false);
    assert.equal(html.includes("selectedHtml"), false);
    assert.equal(html.includes("__SCRIPT_HASH__"), false);
    assert(html.includes("sha256-" + createHash("sha256").update(script).digest("base64")));
    execFileSync(process.execPath, args, { encoding: "utf8" });
    assert(readFileSync(output).equals(bytes));
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir())); assert(basename(directory).startsWith("karda-review-graph-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
