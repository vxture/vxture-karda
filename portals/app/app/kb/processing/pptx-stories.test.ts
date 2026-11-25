import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSource,snapshotFromExtraction} from "./source-normalizer";
import {PPTX_MIME,sourceHash,snapshotValid} from "./source-snapshot";
import {syntheticPptxStories} from "./source-fixtures";
import {verifiedSourceText} from "../semantic/source-text";
const p="http://schemas.openxmlformats.org/presentationml/2006/main",a="http://schemas.openxmlformats.org/drawingml/2006/main",r="http://schemas.openxmlformats.org/officeDocument/2006/relationships",rel="http://schemas.openxmlformats.org/package/2006/relationships";
const notes=(text:string,kind="body")=>`<p:notes xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="${kind}"/></p:nvPr></p:nvSpPr><p:txBody><a:p>${text}</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
test("PPTX authored groups and linked notes bind slide order, part identity and exact current source text",async()=>{
  const bytes=syntheticPptxStories(),value=await normalizeSource(PPTX_MIME,bytes);
  assert.equal(value.parserVersion,"pptx-authored-stories-v3");
  assert.ok(value.text.startsWith("Slide 1 shape 3/3 paragraph 1: Proof grouped \u4e2d\ud83d\ude00"));
  assert.match(value.text,/Slide 1 speaker notes part=ppt\/notesSlides\/notesSlide7.xml shape 3 paragraph 1: Required speaker proof/);
  assert.ok(value.text.indexOf("speaker notes")<value.text.indexOf("Slide 2 table"));
  assert.ok(value.locators.every(l=>l.page===undefined));const emoji=value.text.lastIndexOf("\ud83d\ude00");assert.equal(value.text.slice(emoji,emoji+2),"\ud83d\ude00");
  const meta={activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:PPTX_MIME,normalized:value};
  assert.equal(verifiedSourceText(meta,bytes),value.text);
  const numbered=notes('<a:r><a:t>Authored note</a:t></a:r>').replace('</p:spTree>','<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:fld type="slidenum"><a:t>9999</a:t></a:fld></a:p></p:txBody></p:sp></p:spTree>');
  const withNumber=await normalizeSource(PPTX_MIME,syntheticPptxStories({"ppt/notesSlides/notesSlide7.xml":numbered}));
  assert.ok(withNumber.text.includes("Authored note"));assert.equal(withNumber.text.includes("9999"),false);

  const changed=syntheticPptxStories({"ppt/notesSlides/notesSlide7.xml":notes('<a:r><a:t>Changed notes</a:t></a:r>')});
  assert.equal(verifiedSourceText(meta,changed),null);assert.notEqual((await normalizeSource(PPTX_MIME,changed)).textHash,value.textHash);
});
test("PPTX notes refuse orphaned/shared/misbound parts, hidden content and dynamic authored text",async()=>{
  const cases:Record<string,string>[]=[
    {"ppt/slides/_rels/slide2.xml.rels":`<Relationships xmlns="${rel}"/>`},
    {"ppt/notesSlides/_rels/notesSlide7.xml.rels":`<Relationships xmlns="${rel}"><Relationship Id="s" Type="${r}/slide" Target="../slides/slide1.xml"/></Relationships>`},
    {"ppt/slides/_rels/slide2.xml.rels":`<Relationships xmlns="${rel}"><Relationship Id="n" Type="${r}/notesSlide" Target="../../evil.xml"/></Relationships>`},
    {"ppt/slides/_rels/slide1.xml.rels":`<Relationships xmlns="${rel}"><Relationship Id="n" Type="${r}/notesSlide" Target="../notesSlides/notesSlide7.xml"/></Relationships>`},
    {"ppt/notesSlides/notesSlide7.xml":notes('<a:r><a:t>body</a:t></a:r>').replace('</p:notes>','<a:t>unmapped</a:t></p:notes>')},
    {"ppt/notesSlides/notesSlide8.xml":notes('<a:r><a:t>orphan</a:t></a:r>')},
    {"ppt/notesSlides/notesSlide7.xml":notes('<a:fld><a:t>dynamic</a:t></a:fld>')},
    {"ppt/notesSlides/notesSlide7.xml":notes('<a:r><a:t>non-body</a:t></a:r>',"hdr")},
    {"ppt/notesSlides/notesSlide7.xml":notes('<a:r><a:t>hidden</a:t></a:r>').replace('<p:sp>','<p:sp hidden="1">')},
    {"ppt/notesSlides/notesSlide7.xml":notes('<a:r><a:t>wrong placeholder</a:t></a:r>',"sldNum")},
  ];
  for(const parts of cases)await assert.rejects(normalizeSource(PPTX_MIME,syntheticPptxStories(parts)),/source_extraction_refused/);
});
test("PPTX authored group depth is bounded and v1/v2 frozen snapshots remain readable",async()=>{
  const sp='<p:sp><p:txBody><a:p><a:r><a:t>deep</a:t></a:r></a:p></p:txBody></p:sp>';
  const group=(s:string)=>`<p:grpSp><p:nvGrpSpPr/><p:grpSpPr/>${s}</p:grpSp>`;
  const slide=(s:string)=>`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree>${s}</p:spTree></p:cSld></p:sld>`;
  let nested=sp;for(let i=0;i<4;i++)nested=group(nested);
  assert.match((await normalizeSource(PPTX_MIME,syntheticPptxStories({"ppt/slides/slide2.xml":slide(nested)}))).text,/shape 1\/3\/3\/3\/3/);
  await assert.rejects(normalizeSource(PPTX_MIME,syntheticPptxStories({"ppt/slides/slide2.xml":slide(group(nested))})),/source_extraction_refused/);
  await assert.rejects(normalizeSource(PPTX_MIME,syntheticPptxStories({"ppt/slides/slide2.xml":slide(group(sp).replace('<p:grpSp>','<p:grpSp hidden="1">'))})),/source_extraction_refused/);
  const bytes=Buffer.from("frozen");for(const version of ["pptx-slide-text-v1","pptx-cell-grid-v2"]){const value=snapshotFromExtraction(PPTX_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version},paragraphs:["frozen source"]});assert.equal(value.parserVersion,version);assert.ok(snapshotValid(value));}
});
