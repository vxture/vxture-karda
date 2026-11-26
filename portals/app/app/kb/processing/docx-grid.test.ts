import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSource,snapshotFromExtraction} from "./source-normalizer";
import {DOCX_MIME,sourceHash,snapshotValid} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticDocxStories} from "./source-fixtures";

const w="http://schemas.openxmlformats.org/wordprocessingml/2006/main",r="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const p=(s:string)=>`<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`;
const cell=(s:string,props="")=>`<w:tc><w:tcPr>${props}</w:tcPr>${p(s)}</w:tc>`;
const row=(cells:string)=>`<w:tr>${cells}</w:tr>`;
const table=(rows:string,width=3)=>`<w:tbl><w:tblGrid>${"<w:gridCol/>".repeat(width)}</w:tblGrid>${rows}</w:tbl>`;
const span='<w:gridSpan w:val="2"/>',restart='<w:vMerge w:val="restart"/>';
function bytes(body:string,overrides:Record<string,string>={}){
  return syntheticDocxStories({"word/document.xml":`<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body>${p("Before")}${body}<w:p><w:r><w:footnoteReference w:id="7"/><w:endnoteReference w:id="3"/></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="h"/><w:footerReference w:type="first" r:id="f"/></w:sectPr></w:body></w:document>`,...overrides});
}

test("DOCX cell grids bind merged anchors, nested cell paths, story provenance and exact Unicode evidence",async()=>{
  const nested=table(row(cell("Nested proof")),1);
  const grid=table(row(cell("Merged \u4e2d\ud83d\ude00",span+restart)+cell("Top"))+
    row(cell("",span+'<w:vMerge/>')+`<w:tc>${p("Before nested")}${nested}${p("After nested")}</w:tc>`)+
    row(cell("A")+cell("B")+cell("C")));
  const original=bytes(grid,{"word/header1.xml":`<w:hdr xmlns:w="${w}">${table(row(cell("Header grid")),1)}</w:hdr>`});
  const snapshot=await normalizeSource(DOCX_MIME,original);
  assert.equal(snapshot.parserVersion,"docx-numbered-stories-v5");
  assert.match(snapshot.text,/Table 1 grid rows=3 columns=3/);
  assert.ok(snapshot.text.includes('Table 1 R1C1 rows=2 columns=2: "Merged \u4e2d\ud83d\ude00"'));
  assert.equal(snapshot.text.match(/Merged/g)?.length,1,"continuation never duplicates anchor text");
  assert.ok(snapshot.text.includes('Table 1/R2C3/table1 R1C1 rows=1 columns=1: "Nested proof"'));
  assert.ok(snapshot.text.indexOf("Before nested")<snapshot.text.indexOf("Nested proof"));
  assert.ok(snapshot.text.indexOf("Nested proof")<snapshot.text.indexOf("After nested"));
  assert.match(snapshot.text,/Section 1 header default part=word\/header1.xml paragraph/);
  assert.match(snapshot.text,/footnote id=7 paragraph 1/);
  assert.ok(snapshot.locators.every(l=>l.page===undefined&&snapshot.text.slice(l.start,l.end).length>0));
  const emoji=snapshot.text.indexOf("\ud83d\ude00");assert.equal(snapshot.text.slice(emoji,emoji+2),"\ud83d\ude00");
  const source={activeVersion:1,contentState:"indexed",contentHash:sourceHash(original),mime:DOCX_MIME,normalized:snapshot};
  assert.equal(verifiedSourceText(source,original),snapshot.text);
  assert.equal(verifiedSourceText(source,bytes(grid.replace("Nested proof","Changed proof"))),null);
});

test("DOCX grids reject ambiguous continuation, mismatched widths, unsupported changes and depth/count overflow",async()=>{
  const valid=table(row(cell("start",span+restart)+cell("other"))+row(cell("",span+'<w:vMerge/>')+cell("last")));
  const failures=[
    table(row(cell("",span+'<w:vMerge/>')+cell("orphan"))),
    valid.replace('w:val="continue"','w:val="unknown"').replace('<w:vMerge/>','<w:vMerge w:val="unknown"/>'),
    valid.replace(cell("",span+'<w:vMerge/>'),cell("hidden",span+'<w:vMerge/>')),
    table(row(cell("start",span+restart)+cell("other"))+row(cell("",'<w:vMerge/>')+cell("middle")+cell("last"))),
    valid.replace(span,'<w:gridSpan w:val="0"/>'),valid.replace(span,span+span),
    valid.replace('<w:gridCol/>',''),valid.replace('<w:tr>','<w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>'),
    valid.replace(span,'<w:hMerge/>'),valid.replace('<w:tcPr>','<w:tcPr><w:tcPrChange/>'),
    valid.replace('<w:tcPr>','<w:tcPr><w:drawing/>'),
    '<w:p>'+table(row(cell("misplaced")),1)+'</w:p>',
    table(row(cell("one")),1).repeat(101),table(row(cell("one")).repeat(2001),1),
  ];
  let deep=table(row(cell("inner")),1);
  for(let i=0;i<4;i++)deep=table(row(`<w:tc>${deep}</w:tc>`),1);
  failures.push(deep);
  for(const body of failures)await assert.rejects(normalizeSource(DOCX_MIME,bytes(body)),/source_extraction_refused/);
});

test("DOCX legacy snapshots remain readable without rewriting historical normalization",()=>{
  const original=Buffer.from("frozen original");
  for(const version of [undefined,"docx-body-tables-v2","docx-referenced-stories-v3","docx-cell-grid-v4"]){
    const snapshot=snapshotFromExtraction(DOCX_MIME,original,{binarySha256:sourceHash(original),...(version?{extractor:{version}}:{}),paragraphs:["Frozen \u4e2d\ud83d\ude00"]});
    assert.ok(snapshotValid(snapshot));assert.equal(snapshot.text,"Frozen \u4e2d\ud83d\ude00");
    assert.equal(snapshot.parserVersion,version??"docx-main-body-v1");
  }
});
