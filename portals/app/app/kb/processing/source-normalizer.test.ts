import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {normalizeSource,snapshotFromExtraction} from "./source-normalizer";
import {DOCX_MIME,PDF_MIME,XLSX_MIME,readSourceSnapshot,sourceHash,snapshotIR,snapshotValid} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticPdf,syntheticXlsx} from "./source-fixtures";
import {runExtraction} from "../assertions/extract-run";
import {mkdtemp,mkdir,copyFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";

test("normalized source coordinates preserve UTF-16, parser identity and physical page gaps",async()=>{
  const bytes=Buffer.from("synthetic bytes"),text="A\ud83d\ude00B";
  const snapshot=snapshotFromExtraction(PDF_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version:"6.21.4"},pages:[
    {page:1,text,textSha256:sourceHash(text)},{page:2,text:"",textSha256:sourceHash("")},
    {page:3,text:"Last",textSha256:sourceHash("Last")}]});
  assert.equal(snapshot.text,"A\ud83d\ude00B\n\nLast");assert.equal(snapshot.locators[1].start,6);
  assert.deepEqual(snapshotIR(snapshot).elements.map(el=>el.locator.page),[1,3]);
  const metadata={activeVersion:2,contentState:"indexed",contentHash:sourceHash(bytes),mime:PDF_MIME,normalized:snapshot};
  assert.equal(verifiedSourceText(metadata,bytes),snapshot.text);
  assert.equal(verifiedSourceText({...metadata,normalized:null},bytes),null);
  assert.equal(verifiedSourceText(metadata,Buffer.from("replacement")),null);
  assert.equal(snapshotValid({...snapshot,parserVersion:"future"}),false);
  assert.equal(snapshotValid({...snapshot,text:"changed"}),false);
  assert.equal(snapshotValid({...snapshot,locators:[{start:0,end:99,ordinal:0,page:1}]}),false);
  assert.throws(()=>snapshotFromExtraction(PDF_MIME,bytes,{binarySha256:"wrong"}),/mismatch/);
  let parameters:unknown[]=[];
  assert.equal(await readSourceSnapshot(async(_sql,...values)=>{parameters=values;return [snapshot];},"doc",2),snapshot);
  assert.deepEqual(parameters,["doc",2]);
  assert.equal(await readSourceSnapshot(async()=>[{...snapshot,textHash:"wrong"}],"doc",2),null);
  const captured:unknown[]=[];
  const result=await runExtraction({extract:async({window})=>{captured.push(window);return [];}},
    {documentId:"doc",documentVersion:2,kbId:"kb",mime:PDF_MIME,bytes,normalized:snapshot,tenantId:"tenant",workspaceId:"ws",taskId:"task",extractedBy:"test"},
    async()=>({assertionIds:[],spansWritten:0,evidenceWritten:0,entitiesCreated:0,mentionsWritten:0}));
  assert.equal(result.status,"ok");assert.ok(captured.length>0);
});

test("real bounded PDF and DOCX runtime extraction rejects malformed and scan-only sources",async()=>{
  const bytes=syntheticPdf(["Proof first","","Proof last"]);
  const snapshot=await normalizeSource(PDF_MIME,bytes);
  assert.equal(snapshot.text,"Proof first\n\nProof last");assert.equal(snapshot.contentHash,sourceHash(bytes));
  assert.deepEqual(snapshot.locators.map(row=>row.page),[1,3]);
  await assert.rejects(normalizeSource(PDF_MIME,syntheticPdf([""])),/source_extraction_refused/);
  await assert.rejects(normalizeSource(PDF_MIME,Buffer.from("not PDF")),/source_extraction_refused/);
  await assert.rejects(normalizeSource("application/msword",bytes),/source_format_unsupported/);
  const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>One \u4e2d\ud83d\ude00 proof.</w:t></w:r></w:p></w:body></w:document>';
  const python=process.env.KARDA_KNOWLEDGE_PYTHON||(process.platform==="win32"?"python":"python3");
  const docx=execFileSync(python,["-I","-c",'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr("word/document.xml",sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())'],
    {input:Buffer.from(xml),timeout:10000,windowsHide:true});
  const normalized=await normalizeSource(DOCX_MIME,docx);
  assert.equal(normalized.text,"One \u4e2d\ud83d\ude00 proof.");
  assert.equal(normalized.text.slice(4,7),"\u4e2d\ud83d\ude00");
});

test("DOCX table snapshots preserve body/cell order and UTF-16 while refusing ambiguous structures",async()=>{
  const python=process.env.KARDA_KNOWLEDGE_PYTHON||(process.platform==="win32"?"python":"python3");
  const p=(s:string)=>`<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`,cell=(s:string)=>`<w:tc>${p(s)}</w:tc>`;
  const table=`<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr>${cell("Name")}${cell("Value")}</w:tr><w:tr>${cell("\u4e2d\ud83d\ude00")}${cell("")}</w:tr></w:tbl>`;
  const make=(body:string)=>execFileSync(python,["-I","-c",'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr("word/document.xml",sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())'],
    {input:Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),timeout:10000,windowsHide:true});
  const bytes=make(p("Before")+table+p("After")),snapshot=await normalizeSource(DOCX_MIME,bytes);
  assert.equal(snapshot.parserVersion,"docx-body-tables-v2");
  assert.equal(snapshot.text,"Before\n\nName\tValue\n\n\u4e2d\ud83d\ude00\t\n\nAfter");
  assert.deepEqual(snapshot.locators.map(l=>snapshot.text.slice(l.start,l.end)),["Before","Name\tValue","\u4e2d\ud83d\ude00\t","After"]);
  assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:DOCX_MIME,normalized:snapshot},bytes),snapshot.text);
  assert.equal(snapshotValid({...snapshot,parserVersion:"docx-main-body-v1"}),true);
  assert.ok(snapshotIR(snapshot).elements.some(e=>snapshot.text.slice(e.range.start,e.range.end).includes("\u4e2d\ud83d\ude00")));
  for(const bad of [table.replace('<w:tc>','<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>'),
    table.replace('<w:tc>','<w:tc><w:tcPr><w:vMerge/></w:tcPr>'),table.replace(cell("Value"),""),
    table.replace(cell("Value"),`<w:tc>${table}</w:tc>`),table.replace('<w:tr>','<w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>'),
    `<w:sdt>${p("hidden")}</w:sdt>`])await assert.rejects(normalizeSource(DOCX_MIME,make(bad)),/source_extraction_refused/);
  assert.throws(()=>snapshotFromExtraction(DOCX_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version:"future"},paragraphs:["bad"]}),/source_docx_contract/);
});

test("standalone image finds pinned extractors after Next changes the runtime working directory",async()=>{
  const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),"karda-runtime-layout-"));
  try{
    await mkdir(join(folder,"source-tools"));await mkdir(join(folder,"portals/app"),{recursive:true});
    for(const name of ["normalize-source.py","extract-pdf.py","extract-docx.py","extract-xlsx.py"])
      await copyFile(resolve(cwd,"../../scripts/knowledge",name),join(folder,"source-tools",name));
    process.chdir(join(folder,"portals/app"));
    assert.equal((await normalizeSource(PDF_MIME,syntheticPdf(["Runtime proof"]))).text,"Runtime proof");
    assert.equal((await normalizeSource(XLSX_MIME,syntheticXlsx())).parserVersion,"xlsx-literal-cells-v1");
  }finally{process.chdir(cwd);await rm(folder,{recursive:true,force:true});}
});

test("XLSX literal snapshots preserve sheet/cell identity, sparse coordinates, types and UTF-16 without interpreting formulas",async()=>{
  const bytes=syntheticXlsx(),snapshot=await normalizeSource(XLSX_MIME,bytes);
  assert.equal(snapshot.parserVersion,"xlsx-literal-cells-v1");
  assert.equal(snapshot.text,'Sheet "Proof" row 1: A1 (text)="Required \u4e2d\ud83d\ude00" | C1 (number(raw))="42" | D1 (boolean)=true\n\nSheet "Proof" row 3: B3 (text)="Proof second"');
  assert.ok(snapshot.locators.every(l=>l.page===undefined));assert.equal(snapshot.locators.length,2);
  assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:XLSX_MIME,normalized:snapshot},bytes),snapshot.text);
  assert.ok(snapshotIR(snapshot).elements.every(e=>snapshot.text.slice(e.range.start,e.range.end).length>0));
  const xml=(body:string)=>`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${body}</worksheet>`;
  const row=(cell:string)=>`<sheetData><row r="1">${cell}</row></sheetData>`;
  const badSheets=[row('<c r="A1"><f>SUM(A2:A3)</f><v>99</v></c>'),row('<c r="A1" t="s"><v>9</v></c>'),
    row('<c r="A1" t="e"><v>#REF!</v></c>'),row('<c r="A2"><v>1</v></c>'),row('<c r="A1"><v>1</v></c><c r="A1"><v>2</v></c>'),
    row('<c r="A1"><v>NaN</v></c>'),row('<c r="XFE1"><v>1</v></c>'),
    row('<c r="A1"><v>1</v><v>2</v></c>'),row('<c r="A1" cm="1"><v>1</v></c>'),
    '<sheetData><row r="1" hidden="1"><c r="A1"><v>1</v></c></row></sheetData>',
    '<sheetData><row r="1" s="1"><c r="A1"><v>1</v></c></row></sheetData>',
    '<cols><col min="1" max="1" style="1"/></cols>'+row('<c r="A1"><v>1</v></c>'),
    row('<c r="A1"><v>1</v></c>')+'<mergeCells><mergeCell ref="A1:B1"/></mergeCells>'];
  for(const sheet of badSheets)await assert.rejects(normalizeSource(XLSX_MIME,syntheticXlsx({"xl/worksheets/sheet1.xml":xml(sheet)})),/source_extraction_refused/);
  const rejectedParts:Record<string,string>[]=[
    {"xl/vbaProject.bin":"macro"},
    {"xl/_rels/workbook.xml.rels":'<Relationships><Relationship TargetMode="External" Target="https://example.invalid/"/></Relationships>'},
    {"xl/styles.xml":'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="14"/></cellXfs></styleSheet>'},
    {"xl/sharedStrings.xml":'<!DOCTYPE s [<!ENTITY x "hidden">]><sst/>'},
  ];
  for(const extra of rejectedParts)await assert.rejects(normalizeSource(XLSX_MIME,syntheticXlsx(extra)),/source_extraction_refused/);
  const multi={
    "xl/workbook.xml":'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="r1"/><sheet name="Second" sheetId="2" r:id="r2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet2.xml":xml(row('<c r="A1" t="inlineStr"><is><t>Second sheet</t></is></c>')),
  };
  const multiple=await normalizeSource(XLSX_MIME,syntheticXlsx(multi));assert.equal(multiple.locators.length,3);assert.match(multiple.text,/Sheet "Second" row 1: A1/);
  await assert.rejects(normalizeSource(XLSX_MIME,syntheticXlsx({...multi,"xl/workbook.xml":multi["xl/workbook.xml"].replace('name="Second"','name="Second" state="hidden"')})),/source_extraction_refused/);
  assert.throws(()=>snapshotFromExtraction(XLSX_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version:"future"},paragraphs:["x"]}),/source_xlsx_contract/);
});
