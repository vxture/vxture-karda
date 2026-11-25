import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSource,snapshotFromExtraction} from "./source-normalizer";
import {XLSX_MIME,sourceHash,snapshotValid,snapshotIR} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticXlsx,syntheticXlsxRanges} from "./source-fixtures";

const w="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const data='<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>42</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>Proof second</t></is></c></row></sheetData>';
const ranges=(refs:string[],count=String(refs.length))=>`<mergeCells count="${count}">${refs.map(ref=>`<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`;
const source=(xml:string)=>syntheticXlsx({"xl/worksheets/sheet1.xml":`<worksheet xmlns="${w}">${xml}</worksheet>`});
const multiSheet=(refs:string[])=>syntheticXlsx({
  "xl/workbook.xml":`<workbook xmlns="${w}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="r1"/><sheet name="Second" sheetId="2" r:id="r2"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
  ...Object.fromEntries(refs.map((ref,i)=>[`xl/worksheets/sheet${i+1}.xml`,`<worksheet xmlns="${w}">${data}${ranges([ref])}</worksheet>`])),
});

test("XLSX merged ranges preserve anchor text once, sparse cells and exact Unicode support without propagation",async()=>{
  const bytes=syntheticXlsxRanges(),snapshot=await normalizeSource(XLSX_MIME,bytes);
  assert.equal(snapshot.parserVersion,"xlsx-cell-ranges-v2");
  assert.equal(snapshot.text,'Sheet "Proof" merged A1:B2 anchor=A1 rows=2 columns=2\n\nSheet "Proof" row 1: A1 (text)="Required \u4e2d\ud83d\ude00" | C1 (number(raw))="42" | D1 (boolean)=true\n\nSheet "Proof" row 3: B3 (text)="Proof second"');
  assert.equal(snapshot.text.match(/Required/g)?.length,1);
  assert.equal(snapshot.text.includes("B2 (text)="),false);
  assert.ok(snapshot.locators.every(l=>l.page===undefined));
  const emoji=snapshot.text.indexOf("\ud83d\ude00");assert.equal(snapshot.text.slice(emoji,emoji+2),"\ud83d\ude00");assert.ok(snapshotIR(snapshot).elements.length>0);
  const meta={activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:XLSX_MIME,normalized:snapshot};
  assert.equal(verifiedSourceText(meta,bytes),snapshot.text);
  const changed=source(data+ranges(["A1:B1"]));assert.equal(verifiedSourceText(meta,changed),null);
  const emptyRange=await normalizeSource(XLSX_MIME,source(data+ranges(["A5:B5","A1:B2"])));
  assert.ok(emptyRange.text.indexOf("merged A1:B2")<emptyRange.text.indexOf("merged A5:B5"));
  assert.equal(emptyRange.text.includes("A5 (text)="),false,"empty anchor metadata never fabricates a literal");
  const multi=await normalizeSource(XLSX_MIME,multiSheet(["A1:B2","A1:B2"]));
  assert.match(multi.text,/Sheet "First" merged A1:B2/);assert.match(multi.text,/Sheet "Second" merged A1:B2/);
});

test("XLSX range parsing refuses overlap, out-of-bounds/ambiguous declarations and populated covered cells",async()=>{
  const bad=[
    ...["B2:A1","A1:A1","A0:B2","a1:b2","$A$1:$B$2","XFE1:XFF2","A1048576:A1048577","A1"].map(ref=>data+ranges([ref])),
    data+ranges(["A1:B2","B2:C3"]),data+ranges(["A1:B2","A1:B2"]),data+ranges(["A1:B2"],"2"),
    data+ranges(["A1:B2"])+ranges(["A5:B5"]),data+'<mergeCell ref="A1:B2"/>',
    data.replace('</sheetData>','<mergeCells><mergeCell ref="A1:B2"/></mergeCells></sheetData>'),
    data+data+ranges(["A1:B2"]),
    data.replace('<row r="3">','<row r="2"><c r="B2" t="inlineStr"><is><t>Hidden competing value</t></is></c></row><row r="3">')+ranges(["A1:B2"]),
    data.replace('<v>42</v>','<f>SUM(A1)</f><v>42</v>')+ranges(["A1:B2"]),
    data.replace('<row r="3">','<row r="3" hidden="1">')+ranges(["A1:B2"]),
    '<sheetData/>'+ranges(["A1:B2"]),
  ];
  for(const xml of bad)await assert.rejects(normalizeSource(XLSX_MIME,source(xml)),/source_extraction_refused/);
});

test("XLSX range expansion is bounded while historical literal-cell snapshots retain their parser identity",async()=>{
  const boundary=await normalizeSource(XLSX_MIME,source(data+ranges(["A1:A20000"])));
  assert.match(boundary.text,/rows=20000 columns=1/);assert.equal(boundary.locators.length,3,"logical coverage does not expand output text");
  await assert.rejects(normalizeSource(XLSX_MIME,source(data+ranges(["A1:A20001"]))),/source_extraction_refused/);
  await assert.rejects(normalizeSource(XLSX_MIME,source(data+ranges(Array.from({length:1001},(_,i)=>`E${2*i+1}:E${2*i+2}`)))),/source_extraction_refused/);
  await assert.rejects(normalizeSource(XLSX_MIME,multiSheet(["A1:A12000","A1:A12000"])),/source_extraction_refused/);
  const bytes=Buffer.from("frozen original");
  const legacy=snapshotFromExtraction(XLSX_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version:"xlsx-literal-cells-v1"},paragraphs:['Sheet "Original" row 1: A1 (text)="frozen"']});
  assert.equal(legacy.parserVersion,"xlsx-literal-cells-v1");assert.ok(snapshotValid(legacy));
  const unmerged=await normalizeSource(XLSX_MIME,syntheticXlsx());assert.equal(unmerged.parserVersion,"xlsx-cell-ranges-v2");assert.equal(unmerged.text.includes("merged"),false);
});
