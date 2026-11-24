"""Offline, bounded main-body paragraph extraction. Never opens relationships."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile


def extract(path):
    path = Path(path)
    if path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("attachment_size_limit")
    data = path.read_bytes()
    with zipfile.ZipFile(path) as archive:
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
    if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
        raise ValueError("attachment_dtd_refused")
    root = ET.fromstring(xml)
    w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    # These need a richer normalization contract; do not silently flatten them.
    unsupported = {w + tag for tag in ("tbl", "del", "ins", "altChunk", "drawing", "pict", "fldSimple", "instrText")}
    if root.tag != w + "document" or any(e.tag in unsupported for e in root.iter()):
        raise ValueError("unsupported_attachment_content")
    body = root.find(w + "body")
    if body is None:
        raise ValueError("attachment_body_missing")
    paragraphs = []
    for p in body.iter(w + "p"):
        value = "".join(e.text or "" if e.tag == w + "t" else " " for e in p.iter() if e.tag in (w + "t", w + "tab", w + "br"))
        value = " ".join(value.split())
        if value:
            paragraphs.append(value)
    if not paragraphs:
        raise ValueError("attachment_text_missing")
    return {"binarySha256": hashlib.sha256(data).hexdigest(), "documentXmlSha256": hashlib.sha256(xml).hexdigest(), "paragraphs": paragraphs}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("usage: extract-docx.py saved-docx")
    print(json.dumps(extract(sys.argv[1]), ensure_ascii=True))
