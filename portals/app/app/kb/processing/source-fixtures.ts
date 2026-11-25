// Synthetic fixtures only; never imported by product code.
import {execFileSync} from "node:child_process";

export function syntheticDocxGrid():Buffer{
  const w="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  return syntheticDocxStories({"word/header1.xml":`<w:hdr xmlns:w="${w}"><w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Required merged proof</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nested support</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:hdr>`});
}

export function syntheticDocxStories(overrides:Record<string,string>={}):Buffer{
  const w="http://schemas.openxmlformats.org/wordprocessingml/2006/main",r="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const p=(text:string)=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const parts={
    "word/document.xml":`<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p><w:r><w:t>Proof body \u4e2d\ud83d\ude00</w:t><w:footnoteReference w:id="7"/><w:endnoteReference w:id="3"/></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="h"/><w:footerReference w:type="first" r:id="f"/></w:sectPr></w:body></w:document>`,
    "word/_rels/document.xml.rels":`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="h" Type="${r}/header" Target="header1.xml"/><Relationship Id="f" Type="${r}/footer" Target="footer2.xml"/><Relationship Id="fn" Type="${r}/footnotes" Target="footnotes.xml"/><Relationship Id="en" Type="${r}/endnotes" Target="endnotes.xml"/></Relationships>`,
    "word/header1.xml":`<w:hdr xmlns:w="${w}">${p("Required header")}</w:hdr>`,
    "word/footer2.xml":`<w:ftr xmlns:w="${w}">${p("Footer proof")}</w:ftr>`,
    "word/footnotes.xml":`<w:footnotes xmlns:w="${w}"><w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="7">${p("Required note \u4e2d\ud83d\ude00")}</w:footnote></w:footnotes>`,
    "word/endnotes.xml":`<w:endnotes xmlns:w="${w}"><w:endnote w:id="3">${p("Endnote proof")}</w:endnote></w:endnotes>`,...overrides};
  const python=process.env.KARDA_KNOWLEDGE_PYTHON||(process.platform==="win32"?"python":"python3");
  return execFileSync(python,["-I","-c",'import io,json,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); [z.writestr(k,v) for k,v in json.loads(sys.stdin.buffer.read().decode("utf-8")).items()]; z.close(); sys.stdout.buffer.write(b.getvalue())'],{input:JSON.stringify(parts),timeout:10000,windowsHide:true});
}

export function syntheticPptx(overrides:Record<string,string>={}):Buffer{
  const a='http://schemas.openxmlformats.org/drawingml/2006/main',p='http://schemas.openxmlformats.org/presentationml/2006/main';
  const parts={
    "ppt/presentation.xml":`<p:presentation xmlns:p="${p}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="s2"/><p:sldId id="257" r:id="s1"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="s2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="/ppt/slides/slide2.xml"/></Relationships>',
    "ppt/slides/slide2.xml":`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Proof \u4e2d\ud83d\ude00 first</a:t></a:r><a:br/><a:r><a:t>Second line</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    "ppt/slides/slide1.xml":`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid><a:gridCol/><a:gridCol/></a:tblGrid><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Required</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p/></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`,
    ...overrides,
  };
  const python=process.env.KARDA_KNOWLEDGE_PYTHON||(process.platform==="win32"?"python":"python3");
  return execFileSync(python,["-I","-c",'import io,json,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); parts=json.loads(sys.stdin.buffer.read().decode("utf-8")); [z.writestr(k,v) for k,v in parts.items()]; z.close(); sys.stdout.buffer.write(b.getvalue())'],{input:JSON.stringify(parts),timeout:10000,maxBuffer:16*1024*1024,windowsHide:true});
}
export function syntheticPptxGrid():Buffer{
  const a="http://schemas.openxmlformats.org/drawingml/2006/main",p="http://schemas.openxmlformats.org/presentationml/2006/main";
  const cell=(text:string,attrs="")=>`<a:tc ${attrs}><a:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody></a:tc>`;
  return syntheticPptx({"ppt/slides/slide1.xml":`<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol/><a:gridCol/></a:tblGrid><a:tr>${cell("Required merged proof \u4e2d\ud83d\ude00",'rowSpan="2" gridSpan="2"')}${cell("",'hMerge="1" rowSpan="2"')}</a:tr><a:tr>${cell("",'vMerge="1" gridSpan="2"')}${cell("",'hMerge="1" vMerge="1"')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`});
}

export function syntheticXlsx(overrides:Record<string,string>={}):Buffer {
  const parts={
    "xl/workbook.xml":'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Proof" sheetId="1" r:id="r1"/></sheets><definedNames/></workbook>',
    "xl/_rels/workbook.xml.rels":'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml":'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Required \u4e2d\ud83d\ude00</t></si></sst>',
    "xl/worksheets/sheet1.xml":'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>42</v></c><c r="D1" t="b"><v>1</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>Proof second</t></is></c></row></sheetData></worksheet>',
    ...overrides,
  };
  const python=process.env.KARDA_KNOWLEDGE_PYTHON||(process.platform==="win32"?"python":"python3");
  return execFileSync(python,["-I","-c",'import io,json,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); parts=json.loads(sys.stdin.buffer.read().decode("utf-8")); [z.writestr(k,v) for k,v in parts.items()]; z.close(); sys.stdout.buffer.write(b.getvalue())'],
    {input:JSON.stringify(parts),timeout:10000,windowsHide:true});
}
export function syntheticXlsxRanges():Buffer{
  return syntheticXlsx({"xl/worksheets/sheet1.xml":'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>42</v></c><c r="D1" t="b"><v>1</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>Proof second</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B2"/></mergeCells></worksheet>'});
}
export function syntheticPdf(texts:string[]):Buffer {
  const objects=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Count ${texts.length} /Kids [${texts.map((_,i)=>`${4+i*2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for(const [index,text] of texts.entries()){
    const stream=`BT /F1 12 Tf 20 200 Td (${text.replace(/([\\()])/g,"\\$1")}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+index*2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  let output="%PDF-1.4\n";const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(output);
  output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
