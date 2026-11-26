import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSource} from "./source-normalizer";
import {DOCX_MIME,sourceHash,snapshotValid} from "./source-snapshot";
import {syntheticNumberedDocx} from "./source-fixtures";
import {verifiedSourceText,matchesSourceSpan} from "../semantic/source-text";
const w="http://schemas.openxmlformats.org/wordprocessingml/2006/main",r="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const p=(text:string,props='<w:numPr><w:numId w:val="1"/></w:numPr>')=>`<w:p><w:pPr>${props}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const document=(body:string)=>`<w:document xmlns:w="${w}"><w:body>${body}</w:body></w:document>`;
const numbering=(format:string,label:string,start=1,extra="")=>`<w:numbering xmlns:w="${w}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="${start}"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${label}"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/>${extra}</w:num></w:numbering>`;
test("DOCX automatic multilevel numbers survive normalization, reset and exact source evidence",async()=>{
  const bytes=syntheticNumberedDocx(),snapshot=await normalizeSource(DOCX_MIME,bytes);
  assert.equal(snapshot.parserVersion,"docx-numbered-stories-v5");
  assert.deepEqual([...snapshot.text.matchAll(/label=([^\]]+)/g)].map(m=>m[1]),["1.","1.1","1.2","2.","2.1"]);
  assert.ok(snapshot.text.includes("Proof \u4e2d\ud83d\ude00"));assert.ok(snapshot.locators.every(l=>l.page===undefined));
  const start=snapshot.text.indexOf("label=1.1"),end=snapshot.text.indexOf("\n\n",start);
  assert.equal(matchesSourceSpan(snapshot.text,start,end,snapshot.text.slice(start,end)),true);
  assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",mime:DOCX_MIME,contentHash:sourceHash(bytes),normalized:snapshot},bytes),snapshot.text);
  for(const version of ["docx-main-body-v1","docx-body-tables-v2","docx-referenced-stories-v3","docx-cell-grid-v4"])assert.equal(snapshotValid({...snapshot,parserVersion:version}),true);
});
test("DOCX numbered stories support style inheritance, start overrides, literal bullets and authored table positions",async()=>{
  const styles=`<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Base"><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="Base"/></w:style></w:styles>`;
  const table=`<w:tbl><w:tblGrid><w:gridCol/></w:tblGrid><w:tr><w:tc>${p("Cell proof",'<w:pStyle w:val="Child"/>')}</w:tc></w:tr></w:tbl>`;
  const out=await normalizeSource(DOCX_MIME,syntheticNumberedDocx({"word/document.xml":document(p("Styled proof",'<w:pStyle w:val="Child"/>')+table+p("No number",'<w:pStyle w:val="Child"/><w:numPr><w:numId w:val="0"/></w:numPr>')),
    "word/styles.xml":styles,"word/numbering.xml":numbering("upperLetter","%1)",1,'<w:lvlOverride w:ilvl="0"><w:startOverride w:val="27"/></w:lvlOverride>')}));
  assert.match(out.text,/label=AA\)/);assert.match(out.text,/R1C1.*label=AB\)/);assert.equal(out.text.match(/list numId/g)?.length,2);
  for(const [format,label,start,expected] of [["lowerRoman","%1.",9,"ix."],["chineseCounting","\uff08%1\uff09",12,"\uff08\u5341\u4e8c\uff09"],["bullet","\u2022",1,"\u2022"],["decimalZero","%1.",2,"02."]] as const){
    const value=await normalizeSource(DOCX_MIME,syntheticNumberedDocx({"word/document.xml":document(p("Proof")),"word/numbering.xml":numbering(format,label,start)}));assert.ok(value.text.includes(`label=${expected}`));
  }
  const stories=await normalizeSource(DOCX_MIME,syntheticNumberedDocx({"word/document.xml":`<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body>${p("Body")}<w:p><w:r><w:footnoteReference w:id="7"/></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="h"/></w:sectPr></w:body></w:document>`,
    "word/_rels/document.xml.rels":`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="n" Type="${r}/numbering" Target="numbering.xml"/><Relationship Id="h" Type="${r}/header" Target="header1.xml"/><Relationship Id="fn" Type="${r}/footnotes" Target="footnotes.xml"/></Relationships>`,
    "word/header1.xml":`<w:hdr xmlns:w="${w}">${p("Header")}</w:hdr>`,"word/footnotes.xml":`<w:footnotes xmlns:w="${w}"><w:footnote w:id="7">${p("Note")}</w:footnote></w:footnotes>`}));
  assert.match(stories.text,/header default.*label=1\./);assert.match(stories.text,/footnote id=7.*label=1\./);
});
test("DOCX numbered sources refuse missing/ambiguous definitions and unsupported numbering instead of losing labels",async()=>{
  const failures:Record<string,string>[]=[
    {"word/numbering.xml":numbering("ordinalText","%1.")},
    {"word/numbering.xml":numbering("decimal","%2.")},
    {"word/numbering.xml":numbering("decimal","%0.")},
    {"word/numbering.xml":numbering("bullet","\uf0b7")},
    {"word/numbering.xml":numbering("decimal","%1.",0)},
    {"word/numbering.xml":numbering("decimal","%1.").replace('<w:abstractNumId w:val="0"/>','<w:abstractNumId w:val="99"/>')},
    {"word/numbering.xml":numbering("decimal","%1.").replace('<w:start w:val="1"/>','<w:start w:val="1"/><w:start w:val="2"/>')},
    {"word/_rels/document.xml.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'},
    {"word/styles.xml":`<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Loop"><w:basedOn w:val="Loop"/></w:style></w:styles>`,"word/document.xml":document(p("Loop",'<w:pStyle w:val="Loop"/>'))},
    {"word/numbering.xml":'<!DOCTYPE bad [<!ENTITY x "x">]><bad/>'},
  ];
  for(const extra of failures)await assert.rejects(normalizeSource(DOCX_MIME,syntheticNumberedDocx(extra)),/source_extraction_refused/);
});
