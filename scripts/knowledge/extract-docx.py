"""Offline, bounded main-body paragraph extraction. Never opens relationships."""
import hashlib
import json
import io
import re
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile


def extract(path, tables=False):
    path = Path(path)
    # Hash and unpack the same bounded snapshot, even if the path changes later.
    with path.open("rb") as handle:
        data = handle.read(2 * 1024 * 1024 + 1)
    return extract_bytes(data, tables)


def extract_bytes(data, tables=False):
    if len(data) > 2 * 1024 * 1024:
        raise ValueError("attachment_size_limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        if len(entries) > 100 or len(names) != len(set(names)) or sum(e.file_size for e in entries) > 16 * 1024 * 1024:
            raise ValueError("attachment_archive_limit")
        if any(n.startswith(("word/header", "word/footer", "word/footnotes", "word/endnotes")) for n in names):
            raise ValueError("unsupported_attachment_parts")
        entry = archive.getinfo("word/document.xml")
        if entry.file_size > 2 * 1024 * 1024:
            raise ValueError("attachment_xml_limit")
        xml = archive.read(entry)
    # A strict UTF-8 contract makes declaration checks independent of byte encoding.
    # Keep the original bytes for the pinned XML hash; never silently transcode.
    try:
        xml_text = xml.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError("attachment_xml_encoding_refused") from error
    declaration = re.match(r"<\?xml\s+[^?]*\bencoding\s*=\s*(['\"])([^'\"]+)\1", xml_text, re.IGNORECASE)
    if "\x00" in xml_text or (declaration and declaration.group(2).lower() != "utf-8"):
        raise ValueError("attachment_xml_encoding_refused")
    if "<!DOCTYPE" in xml_text.upper() or "<!ENTITY" in xml_text.upper():
        raise ValueError("attachment_dtd_refused")
    root = ET.fromstring(xml_text)
    w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    # These need a richer normalization contract; do not silently flatten them.
    unsupported = {w + tag for tag in ("del", "ins", "altChunk", "drawing", "pict", "fldSimple", "instrText")}
    if not tables:
        unsupported.add(w + "tbl")
    if root.tag != w + "document" or any(e.tag in unsupported for e in root.iter()):
        raise ValueError("unsupported_attachment_content")
    body = root.find(w + "body")
    if body is None:
        raise ValueError("attachment_body_missing")
    def paragraph(p):
        value = "".join(e.text or "" if e.tag == w + "t" else " " for e in p.iter() if e.tag in (w + "t", w + "tab", w + "br"))
        return " ".join(value.split())

    paragraphs = []
    if not tables:
        paragraphs = [value for p in body.iter(w + "p") if (value := paragraph(p))]
    else:
        # New runtime contract: explicit rectangular cells, body order, no merges.
        forbidden = {w + tag for tag in ("gridSpan", "vMerge", "hMerge", "gridBefore", "gridAfter", "sdt", "customXml")}
        if any(e.tag in forbidden for e in body.iter()):
            raise ValueError("unsupported_attachment_table_structure")
        table_count = 0
        row_count = 0
        for block in body:
            if block.tag == w + "p":
                value = paragraph(block)
                if value:
                    paragraphs.append(value)
            elif block.tag == w + "tbl":
                table_count += 1
                if table_count > 100 or len(list(block.iter(w + "tbl"))) != 1:
                    raise ValueError("attachment_table_limit")
                if any(c.tag not in (w + "tblPr", w + "tblGrid", w + "tr") for c in block):
                    raise ValueError("unsupported_attachment_table_structure")
                rows = block.findall(w + "tr")
                grid = block.find(w + "tblGrid")
                grid_width = len(grid.findall(w + "gridCol")) if grid is not None else None
                widths = set()
                if not rows:
                    raise ValueError("unsupported_attachment_table_structure")
                for row in rows:
                    if any(c.tag not in (w + "trPr", w + "tblPrEx", w + "tc") for c in row):
                        raise ValueError("unsupported_attachment_table_structure")
                    row_count += 1
                    cells = row.findall(w + "tc")
                    widths.add(len(cells))
                    if row_count > 2000 or not 1 <= len(cells) <= 50 or len(widths) > 1 or (grid_width is not None and grid_width != len(cells)):
                        raise ValueError("attachment_table_limit")
                    values = []
                    for cell in cells:
                        if any(c.tag not in (w + "tcPr", w + "p") for c in cell):
                            raise ValueError("unsupported_attachment_table_structure")
                        values.append("\n".join(paragraph(p) for p in cell.findall(w + "p")).strip())
                    if any(values):
                        paragraphs.append("\t".join(values))
            elif block.tag != w + "sectPr":
                raise ValueError("unsupported_attachment_content")
        if len(paragraphs) > 20000:
            raise ValueError("attachment_table_limit")
    if not paragraphs:
        raise ValueError("attachment_text_missing")
    result = {"binarySha256": hashlib.sha256(data).hexdigest(), "documentXmlSha256": hashlib.sha256(xml).hexdigest(), "paragraphs": paragraphs}
    if tables:
        result["extractor"] = {"version": "docx-body-tables-v2"}
    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("usage: extract-docx.py saved-docx")
    print(json.dumps(extract(sys.argv[1]), ensure_ascii=True))
