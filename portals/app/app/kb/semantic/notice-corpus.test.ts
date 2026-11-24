import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importNotice, reconstructNotice, sha256, type NoticeSource } from "./notice-corpus";

const corpus = JSON.parse(readFileSync("../../scripts/knowledge/corpus/procurement-notices-20261124.json", "utf8")) as {
  formatVersion: number; dataClass: string; sources: NoticeSource[];
};

test("three public project snapshots reproduce offline with twelve exact UTF-16 anchors", () => {
  assert.equal(corpus.dataClass, "public_business_notice_snapshot");
  assert.equal(corpus.sources.length, 3);
  assert.equal(new Set(corpus.sources.map(s => s.projectFamilyId)).size, 3);
  assert.equal(corpus.sources.reduce((n, s) => n + s.sections.length, 0), 12);
  for (const source of corpus.sources) {
    const result = reconstructNotice(source);
    assert.equal(result.text, source.text);
    assert.equal(result.canonicalSha256, source.canonicalSha256);
    assert.deepEqual(result.sections, source.sections);
    assert.ok(source.text.includes(source.projectNumber));
    let end = 0;
    for (const section of source.sections) {
      assert.ok(section.start >= end && section.end <= source.text.length);
      assert.ok(source.text.slice(section.start, section.end).startsWith(section.label));
      end = section.end;
    }
    assert.equal(source.sections.some(s => s.label.includes("\u8054\u7cfb")), false);
  }
});

function savedFixture() {
  const source = corpus.sources[0];
  const html = `<title>${source.title}</title>2026\u5e7411\u670824\u65e5<div class="vF_detail_content">${source.selectedHtml}<p><strong>\u56db\u3001\u8054\u7cfb</strong></p><p>EXCLUDED-CONTACT</p></div></div><!--vF_detail_content_container-->`;
  return { html, input: { ...source, savedHtmlSha256: sha256(html) } };
}

test("importer takes business headings only, not summary/footer/contact sections", () => {
  const { html, input } = savedFixture();
  const imported = importNotice(input, html);
  assert.equal(imported.text, corpus.sources[0].text);
  assert.equal(imported.text.includes("EXCLUDED-CONTACT"), false);
  assert.equal(imported.omittedSections.includes("attachments_not_downloaded"), true);
});

test("saved-page hash, title, project number and publication date are pinned before extraction", () => {
  const { html, input } = savedFixture();
  for (const patch of [{ savedHtmlSha256: "a".repeat(64) }, { title: "wrong" }, { projectNumber: "wrong" },
    { publishedOn: "2025-11-24" }, { url: "https://example.org/mirror" }]) {
    assert.throws(() => importNotice({ ...input, ...patch }, html));
  }
});

test("selected HTML cannot change unnoticed and malformed headings cannot silently reshape anchors", () => {
  const source = corpus.sources[0];
  assert.throws(() => reconstructNotice({ ...source, selectedHtml: source.selectedHtml + "changed" }), /notice_selected_html_mismatch/);
  const selectedHtml = source.selectedHtml.replace(source.sections[1].label, "unexpected-heading");
  assert.throws(() => reconstructNotice({ ...source, selectedHtml, selectedHtmlSha256: sha256(selectedHtml) }), /notice_heading_mismatch/);
  const { html, input } = savedFixture();
  const missingContact = html.replace("\u56db\u3001\u8054\u7cfb", "wrong");
  assert.throws(() => importNotice({ ...input, savedHtmlSha256: sha256(missingContact) }, missingContact), /notice_contact_boundary_missing/);
});

test("unrecognized entities fail rather than corrupting exact source ranges", () => {
  const source = corpus.sources[0], selectedHtml = source.selectedHtml + "<p>&unknownentity;</p>";
  assert.throws(() => reconstructNotice({ ...source, selectedHtml, selectedHtmlSha256: sha256(selectedHtml) }), /unknown_notice_entity/);
});
