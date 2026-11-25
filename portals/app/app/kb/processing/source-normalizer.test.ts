import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {normalizeSource,snapshotFromExtraction} from "./source-normalizer";
import {DOCX_MIME,PDF_MIME,XLSX_MIME,PPTX_MIME,readSourceSnapshot,sourceHash,snapshotIR,snapshotValid} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticPdf,syntheticXlsx,syntheticPptx,syntheticDocxStories} from "./source-fixtures";
import {SOURCE_FORMATS} from "./source-formats";
import {readFileSync} from "node:fs";
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
  assert.equal(snapshot.parserVersion,"docx-cell-grid-v4");
  assert.ok(snapshot.text.startsWith("Before\n\nTable 1 grid"));assert.ok(snapshot.text.endsWith("\n\nAfter"));
  assert.deepEqual(snapshot.locators.map(l=>snapshot.text.slice(l.start,l.end)),["Before",'Table 1 grid rows=2 columns=2','Table 1 R1C1 rows=1 columns=1: "Name"','Table 1 R1C2 rows=1 columns=1: "Value"','Table 1 R2C1 rows=1 columns=1: "\u4e2d\ud83d\ude00"','Table 1 R2C2 rows=1 columns=1: ""',"After"]);
  assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:DOCX_MIME,normalized:snapshot},bytes),snapshot.text);
  assert.equal(snapshotValid({...snapshot,parserVersion:"docx-main-body-v1"}),true);
  assert.ok(snapshotIR(snapshot).elements.some(e=>snapshot.text.slice(e.range.start,e.range.end).includes("\u4e2d\ud83d\ude00")));
  for(const bad of [table.replace('<w:tc>','<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>'),
    table.replace('<w:tc>','<w:tc><w:tcPr><w:vMerge/></w:tcPr>'),table.replace(cell("Value"),""),
    table.replace('<w:tr>','<w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>'),
    `<w:sdt>${p("hidden")}</w:sdt>`])await assert.rejects(normalizeSource(DOCX_MIME,make(bad)),/source_extraction_refused/);
  assert.throws(()=>snapshotFromExtraction(DOCX_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version:"future"},paragraphs:["bad"]}),/source_docx_contract/);
});

test("standalone image finds pinned extractors after Next changes the runtime working directory",async()=>{
  const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),"karda-runtime-layout-"));
  try{
    await mkdir(join(folder,"source-tools"));await mkdir(join(folder,"portals/app"),{recursive:true});
    for(const name of ["normalize-source.py","extract-docx.py","extract-docx-stories.py","extract-xlsx.py","extract-pptx.py",...SOURCE_FORMATS.map(f=>f.script)])
      await copyFile(resolve(cwd,"../../scripts/knowledge",name),join(folder,"source-tools",name));
    process.chdir(join(folder,"portals/app"));
    assert.equal((await normalizeSource(PDF_MIME,syntheticPdf(["Runtime proof"]))).text,"Runtime proof");
    assert.equal((await normalizeSource(XLSX_MIME,syntheticXlsx())).parserVersion,"xlsx-cell-ranges-v2");
    assert.equal((await normalizeSource(PPTX_MIME,syntheticPptx())).parserVersion,"pptx-authored-stories-v3");
    assert.equal((await normalizeSource(DOCX_MIME,syntheticDocxStories())).parserVersion,"docx-cell-grid-v4");
  }finally{process.chdir(cwd);await rm(folder,{recursive:true,force:true});}
});

test("Office registry agrees with parser dispatch, image bundle and fresh database versions",()=>{
  const root=resolve(import.meta.dirname,"../../../../../"),dispatch=readFileSync(join(root,"scripts/knowledge/normalize-source.py"),"utf8"),docker=readFileSync(join(root,"portals/app/Dockerfile"),"utf8"),ddl=readFileSync(join(root,"deploy/database/ddl/00_baseline.sql"),"utf8");
  for(const f of SOURCE_FORMATS){assert.ok(dispatch.includes(f.mime));assert.ok(dispatch.includes(f.script));assert.ok(docker.includes(f.script));
    for(const parser of f.accepted)assert.ok(ddl.includes(parser));}
});

test("PPTX text/table provenance follows slide ordering, rejects active/ambiguous content and preserves Unicode coordinates",async()=>{
  const bytes=syntheticPptx(),snapshot=await normalizeSource(PPTX_MIME,bytes);
  assert.equal(snapshot.parserVersion,"pptx-authored-stories-v3");
  assert.equal(snapshot.text,'Slide 1 shape 3 paragraph 1: Proof \u4e2d\ud83d\ude00 first\nSecond line\n\nSlide 2 table 3 grid rows=1 columns=2\n\nSlide 2 table 3 R1C1 rows=1 columns=1: "Required"\n\nSlide 2 table 3 R1C2 rows=1 columns=1: ""');
  assert.ok(snapshot.locators.every(l=>l.page===undefined));assert.equal(snapshot.locators.length,4);
  const pos=snapshot.text.indexOf("\ud83d\ude00");assert.equal(snapshot.text.slice(pos,pos+2),"\ud83d\ude00");
  assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:PPTX_MIME,normalized:snapshot},bytes),snapshot.text);
  assert.ok(snapshotIR(snapshot).elements.length>0);
  const a='http://schemas.openxmlformats.org/drawingml/2006/main',p='http://schemas.openxmlformats.org/presentationml/2006/main';
  const slide=(shape:string,attrs="")=>`<p:sld xmlns:p="${p}" xmlns:a="${a}" ${attrs}><p:cSld><p:spTree>${shape}</p:spTree></p:cSld></p:sld>`;
  const textShape=(content:string)=>`<p:sp><p:txBody><a:p>${content}</a:p></p:txBody></p:sp>`;
  const refused:Record<string,string>[]=[
    ...['<p:pic/>','<p:grpSp/>','<p:cxnSp/>',textShape('<a:fld><a:t>dynamic</a:t></a:fld>'),textShape('<a:r><a:rPr><a:hlinkClick/></a:rPr><a:t>link</a:t></a:r>')].map(shape=>({"ppt/slides/slide2.xml":slide(shape)})),
    {"ppt/slides/slide2.xml":slide(textShape('<a:r><a:t>hidden</a:t></a:r>'),'show="0"')},
    {"ppt/_rels/presentation.xml.rels":'<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>'},
    {"ppt/notesSlides/notesSlide1.xml":`<p:notes xmlns:p="${p}" xmlns:a="${a}"><a:t>Unincluded note</a:t></p:notes>`},
    {"ppt/vbaProject.bin":"macro"},{"ppt/charts/chart1.xml":"<chart/>"},
    {"ppt/slides/slide2.xml":'<!DOCTYPE x [<!ENTITY e "bad">]><x/>'},
  ];
  for(const parts of refused)await assert.rejects(normalizeSource(PPTX_MIME,syntheticPptx(parts)),/source_extraction_refused/);
  const cell=(value:string,attrs="")=>`<a:tc ${attrs}><a:txBody><a:p><a:r><a:t>${value}</a:t></a:r></a:p></a:txBody></a:tc>`;
  const table=(cells:string)=>`<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol/><a:gridCol/></a:tblGrid><a:tr>${cells}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  for(const shape of [table(cell("merged",'gridSpan="2"')),table(cell("one")),table(cell("one")+cell("two",'vMerge="1"'))])
    await assert.rejects(normalizeSource(PPTX_MIME,syntheticPptx({"ppt/slides/slide2.xml":slide(shape)})),/source_extraction_refused/);
  const reordered=syntheticPptx({"ppt/presentation.xml":`<p:presentation xmlns:p="${p}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="s1"/><p:sldId id="257" r:id="s2"/></p:sldIdLst></p:presentation>`});
  assert.match((await normalizeSource(PPTX_MIME,reordered)).text,/^Slide 1 table/);
  assert.throws(()=>snapshotFromExtraction(PPTX_MIME,bytes,{binarySha256:sourceHash(bytes),extractor:{version:"future"},paragraphs:["bad"]}),/source_pptx_contract/);
});

test("XLSX literal snapshots preserve sheet/cell identity, sparse coordinates, types and UTF-16 without interpreting formulas",async()=>{
  const bytes=syntheticXlsx(),snapshot=await normalizeSource(XLSX_MIME,bytes);
  assert.equal(snapshot.parserVersion,"xlsx-cell-ranges-v2");
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
    row('<c r="A1"><v>1</v></c>')+'<mergeCells><mergeCell ref="A1:B1"/><mergeCell ref="A1:A2"/></mergeCells>'];
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
