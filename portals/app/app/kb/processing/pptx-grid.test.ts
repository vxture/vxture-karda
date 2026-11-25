import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSource,snapshotFromExtraction} from "./source-normalizer";
import {PPTX_MIME,sourceHash,snapshotValid,snapshotIR} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticPptx,syntheticPptxGrid} from "./source-fixtures";
const a="http://schemas.openxmlformats.org/drawingml/2006/main",p="http://schemas.openxmlformats.org/presentationml/2006/main";
const cell=(text:string,attrs="")=>`<a:tc ${attrs}><a:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody></a:tc>`;
const row=(cells:string)=>`<a:tr>${cells}</a:tr>`;
const table=(rows:string,width=2)=>`<a:tbl><a:tblGrid>${"<a:gridCol/>".repeat(width)}</a:tblGrid>${rows}</a:tbl>`;
const slide=(grid:string)=>`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">${grid}</a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`;
const source=(grid:string)=>syntheticPptx({"ppt/slides/slide1.xml":slide(grid)});

test("PPTX merged grids retain a single anchor, logical spans, slide order and exact Unicode support",async()=>{
  const bytes=syntheticPptxGrid(),snapshot=await normalizeSource(PPTX_MIME,bytes);
  assert.equal(snapshot.parserVersion,"pptx-authored-stories-v3");
  assert.ok(snapshot.text.includes('Slide 2 table 3 grid rows=2 columns=2'));
  assert.ok(snapshot.text.includes('Slide 2 table 3 R1C1 rows=2 columns=2: "Required merged proof \u4e2d\ud83d\ude00"'));
  assert.equal(snapshot.text.match(/Required merged proof/g)?.length,1);assert.equal(snapshot.text.includes("R2C2"),false);
  assert.ok(snapshot.text.startsWith("Slide 1 shape 3"));assert.ok(snapshot.locators.every(l=>l.page===undefined));
  const emoji=snapshot.text.lastIndexOf("\ud83d\ude00");assert.equal(snapshot.text.slice(emoji,emoji+2),"\ud83d\ude00");assert.ok(snapshotIR(snapshot).elements.length>0);
  const meta={activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:PPTX_MIME,normalized:snapshot};
  assert.equal(verifiedSourceText(meta,bytes),snapshot.text);assert.equal(verifiedSourceText(meta,syntheticPptx()),null);
  const horizontal=await normalizeSource(PPTX_MIME,source(table(row(cell("horizontal",'gridSpan="2"')+cell("",'hMerge="true"')))));
  assert.match(horizontal.text,/rows=1 columns=2: "horizontal"/);
  const vertical=await normalizeSource(PPTX_MIME,source(table(row(cell("vertical",'rowSpan="2"'))+row(cell("",'vMerge="true"')),1)));
  assert.match(vertical.text,/rows=2 columns=1: "vertical"/);
});

test("PPTX grids refuse orphan/missing continuation, overlap, competing text, bad spans and nested/active cell content",async()=>{
  const valid=table(row(cell("anchor",'rowSpan="2" gridSpan="2"')+cell("",'hMerge="1" rowSpan="2"'))+row(cell("",'vMerge="1" gridSpan="2"')+cell("",'hMerge="1" vMerge="1"')));
  const bad=[
    valid.replace('hMerge="1" rowSpan="2"','rowSpan="2"'),valid.replace('hMerge="1" vMerge="1"','hMerge="1"'),
    valid.replace(cell("",'hMerge="1" rowSpan="2"'),cell("competing",'hMerge="1" rowSpan="2"')),
    ...["0","-1","3","2.0","99999"].map(v=>valid.replace('gridSpan="2"',`gridSpan="${v}"`)),
    valid.replace('hMerge="1"','hMerge="maybe"'),valid.replace('rowSpan="2"','rowSpan="3"'),
    table(row(cell("orphan",'hMerge="1"')+cell("ordinary"))),
    table(row(cell("one")+cell("overlap",'rowSpan="2"'))+row(cell("overlap",'gridSpan="2"')+cell("",'vMerge="1"'))),
    valid.replace('<a:txBody>','<a:txBody><a:tbl/>'),valid.replace('<a:txBody>','<a:txBody><a:extLst/>'),
    valid.replace('<a:r><a:t>anchor</a:t></a:r>','<a:fld><a:t>dynamic</a:t></a:fld>'),
    valid.replace('<a:gridCol/>',''),valid.replace('<a:tr>','<a:tr><a:tc/>'),
  ];
  for(const grid of bad)await assert.rejects(normalizeSource(PPTX_MIME,source(grid)),/source_extraction_refused/);
});

test("PPTX grid cell budgets are global and historical v1 snapshots remain unchanged",async()=>{
  await assert.rejects(normalizeSource(PPTX_MIME,source(table(row(cell("x").repeat(51)),51))),/source_extraction_refused/);
  await assert.rejects(normalizeSource(PPTX_MIME,source(table(row(cell("").repeat(11)).repeat(1820),11))),/source_extraction_refused/);
  const half=slide(table(row(cell("").repeat(50)).repeat(202),50));
  await assert.rejects(normalizeSource(PPTX_MIME,syntheticPptx({"ppt/slides/slide1.xml":half,"ppt/slides/slide2.xml":half})),/source_extraction_refused/);
  const bytes=Buffer.from("frozen original"),text="Slide 1 table 1 row 1: C1=\"frozen\"";
  const legacy=snapshotFromExtraction(PPTX_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version:"pptx-slide-text-v1"},paragraphs:[text]});
  assert.equal(legacy.parserVersion,"pptx-slide-text-v1");assert.equal(legacy.text,text);assert.ok(snapshotValid(legacy));
});
