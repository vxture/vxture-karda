import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSource} from "./source-normalizer";
import {DOCX_MIME,sourceHash,snapshotValid} from "./source-snapshot";
import {syntheticDocxStories} from "./source-fixtures";

test("DOCX stories bind explicit sections, note IDs, Unicode and fixed original bytes without page guesses",async()=>{
  const bytes=syntheticDocxStories(),value=await normalizeSource(DOCX_MIME,bytes);
  assert.equal(value.parserVersion,"docx-referenced-stories-v3");assert.equal(value.contentHash,sourceHash(bytes));
  assert.match(value.text,/Proof body \u4e2d\ud83d\ude00 \[footnote id=7\] \[endnote id=3\]/);
  assert.match(value.text,/Section 1 header default part=word\/header1.xml paragraph 1: Required header/);
  assert.match(value.text,/Section 1 footer first part=word\/footer2.xml paragraph 1: Footer proof/);
  assert.match(value.text,/footnote id=7 paragraph 1: Required note \u4e2d\ud83d\ude00/);
  assert.match(value.text,/endnote id=3 paragraph 1: Endnote proof/);
  assert.ok(value.locators.every(l=>l.page===undefined));assert.equal(value.locators.length,5);
  assert.ok(snapshotValid({...value,parserVersion:"docx-body-tables-v2"}),"historical snapshots remain readable");
  const w="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const changed=await normalizeSource(DOCX_MIME,syntheticDocxStories({"word/header1.xml":`<w:hdr xmlns:w="${w}"><w:p><w:r><w:t>Changed header</w:t></w:r></w:p></w:hdr>`}));
  assert.notEqual(changed.contentHash,value.contentHash);assert.notEqual(changed.textHash,value.textHash);
});

test("DOCX stories reject external/dynamic/ambiguous/orphaned content instead of silently dropping it",async()=>{
  const w="http://schemas.openxmlformats.org/wordprocessingml/2006/main",r="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const bad:Record<string,string>[]=[
    {"word/header1.xml":`<w:hdr xmlns:w="${w}"><w:p><w:r><w:fldChar w:fldCharType="begin"/><w:t>1</w:t></w:r></w:p></w:hdr>`},
    {"word/header1.xml":`<w:hdr xmlns:w="${w}"><w:p><w:r><w:drawing/></w:r></w:p></w:hdr>`},
    {"word/header1.xml":`<w:hdr xmlns:w="${w}"><w:p><w:r><w:vanish/><w:t>Hidden</w:t></w:r></w:p></w:hdr>`},
    {"word/header1.xml":`<w:hdr xmlns:w="${w}"><w:sdt><w:p><w:r><w:t>Controlled</w:t></w:r></w:p></w:sdt></w:hdr>`},
    {"word/header3.xml":`<w:hdr xmlns:w="${w}"/>`},
    {"word/_rels/document.xml.rels":`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="h" Type="${r}/header" TargetMode="External" Target="https://example.test/header"/></Relationships>`},
    {"word/footnotes.xml":`<w:footnotes xmlns:w="${w}"><w:footnote w:id="8"><w:p><w:r><w:t>Wrong note</w:t></w:r></w:p></w:footnote></w:footnotes>`},
    {"word/footnotes.xml":`<w:footnotes xmlns:w="${w}"><w:footnote w:id="7"><w:p><w:r><w:footnoteReference w:id="8"/></w:r></w:p></w:footnote></w:footnotes>`},
    {"word/endnotes.xml":`<w:endnotes xmlns:w="${w}"><w:endnote w:id="3"/><w:endnote w:id="3"/></w:endnotes>`},
    {"word/header1.xml":'<!DOCTYPE hdr [<!ENTITY bad "wrong">]><hdr/>'},
  ];
  for(const extra of bad)await assert.rejects(normalizeSource(DOCX_MIME,syntheticDocxStories(extra)),/source_extraction_refused/);
});
