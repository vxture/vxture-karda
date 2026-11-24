import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {normalizeSource,snapshotFromExtraction} from "./source-normalizer";
import {DOCX_MIME,PDF_MIME,readSourceSnapshot,sourceHash,snapshotIR,snapshotValid} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticPdf} from "./source-fixtures";
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

test("standalone image finds pinned extractors after Next changes the runtime working directory",async()=>{
  const cwd=process.cwd(),folder=await mkdtemp(join(tmpdir(),"karda-runtime-layout-"));
  try{
    await mkdir(join(folder,"source-tools"));await mkdir(join(folder,"portals/app"),{recursive:true});
    for(const name of ["normalize-source.py","extract-pdf.py","extract-docx.py"])
      await copyFile(resolve(cwd,"../../scripts/knowledge",name),join(folder,"source-tools",name));
    process.chdir(join(folder,"portals/app"));
    assert.equal((await normalizeSource(PDF_MIME,syntheticPdf(["Runtime proof"]))).text,"Runtime proof");
  }finally{process.chdir(cwd);await rm(folder,{recursive:true,force:true});}
});
