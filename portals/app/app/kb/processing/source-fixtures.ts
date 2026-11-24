// Synthetic fixtures only; never imported by product code.
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
