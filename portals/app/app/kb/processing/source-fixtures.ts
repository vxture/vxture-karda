// Synthetic fixtures only; never imported by product code.
import {execFileSync} from "node:child_process";

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
