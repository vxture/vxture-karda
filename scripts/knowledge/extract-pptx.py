"""Extract authored slide text and rectangular tables in package order, never render."""
import hashlib
import io
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def extract(path):
    with Path(path).open("rb") as handle:
        data = handle.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError("pptx_binary_limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        if len(entries) > 1000 or len(set(names)) != len(names) or sum(e.file_size for e in entries) > 32 * 1024 * 1024:
            raise ValueError("pptx_archive_limit")
        if any(n.startswith("/") or ".." in n.split("/") or "\\" in n for n in names):
            raise ValueError("pptx_path_refused")
        if any(any(x in n.lower() for x in ("vbaproject", "embeddings/", "comments/", "commentauthors", "activex/", "diagrams/", "charts/")) for n in names):
            raise ValueError("pptx_unsupported_parts")

        def xml(name):
            entry = archive.getinfo(name)
            if entry.file_size > 4 * 1024 * 1024:
                raise ValueError("pptx_xml_limit")
            text = archive.read(entry).decode("utf-8-sig")
            declaration = re.match(r"<\?xml\s+[^?]*\bencoding\s*=\s*(['\"])([^'\"]+)\1", text, re.IGNORECASE)
            if "\x00" in text or (declaration and declaration.group(2).lower() != "utf-8") or "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
                raise ValueError("pptx_xml_refused")
            return ET.fromstring(text)

        for name in names:
            if name.endswith(".rels") and any(e.get("TargetMode") == "External" for e in xml(name)):
                raise ValueError("pptx_external_relationship")
            if name.startswith("ppt/notesSlides/") and name.endswith(".xml") and any((e.text or "").strip() for e in xml(name).iter(A + "t")):
                raise ValueError("pptx_notes_refused")
        presentation = xml("ppt/presentation.xml")
        slides = presentation.find(P + "sldIdLst")
        if presentation.tag != P + "presentation" or slides is None or not 1 <= len(slides) <= 300:
            raise ValueError("pptx_slide_limit")
        links = {}
        for link in xml("ppt/_rels/presentation.xml.rels"):
            if link.tag != REL + "Relationship" or not link.get("Id") or link.get("Id") in links:
                raise ValueError("pptx_relationship_refused")
            links[link.get("Id")] = link
        paragraphs, seen, chars, cells = [], set(), 0, 0

        def append(value):
            nonlocal chars
            chars += len(value)
            if chars > 5000000 or len(paragraphs) >= 20000:
                raise ValueError("pptx_text_limit")
            paragraphs.append(value)

        def text_paragraph(element):
            if any(e.tag in (A + "fld", A + "hlinkClick", A + "hlinkMouseOver") for e in element.iter()):
                raise ValueError("pptx_dynamic_text_refused")
            value = "".join((e.text or "") if e.tag == A + "t" else "\n" for e in element.iter() if e.tag in (A + "t", A + "br"))
            if len(value) > 100000:
                raise ValueError("pptx_paragraph_limit")
            return value.strip()

        for number, slide in enumerate(slides, 1):
            link = links.get(slide.get(R + "id"))
            if slide.tag != P + "sldId" or link is None or not link.get("Type", "").endswith("/slide"):
                raise ValueError("pptx_slide_refused")
            target = link.get("Target", "")
            target = target[1:] if target.startswith("/ppt/") else "ppt/" + target
            if not re.fullmatch(r"ppt/slides/[A-Za-z0-9_-]+\.xml", target) or target in seen:
                raise ValueError("pptx_slide_target_refused")
            seen.add(target)
            root = xml(target)
            if root.tag != P + "sld" or root.get("show", "1") in ("0", "false") or any(e.tag in (P + "timing", P + "oleObj", P + "contentPart", "{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent") for e in root.iter()):
                raise ValueError("pptx_slide_content_refused")
            tree = root.find(P + "cSld/" + P + "spTree")
            if tree is None:
                raise ValueError("pptx_tree_missing")
            for shape_number, shape in enumerate(tree, 1):
                if shape.tag in (P + "nvGrpSpPr", P + "grpSpPr"):
                    continue
                if any(e.get("hidden") in ("1", "true") for e in shape.iter()):
                    raise ValueError("pptx_hidden_content_refused")
                if shape.tag == P + "sp":
                    body = shape.find(P + "txBody")
                    if body is None:
                        raise ValueError("pptx_nontext_shape_refused")
                    for paragraph_number, element in enumerate(body.findall(A + "p"), 1):
                        value = text_paragraph(element)
                        if value:
                            append(f"Slide {number} shape {shape_number} paragraph {paragraph_number}: {value}")
                elif shape.tag == P + "graphicFrame":
                    graphic = shape.find(A + "graphic/" + A + "graphicData")
                    if graphic is None or graphic.get("uri") != "http://schemas.openxmlformats.org/drawingml/2006/table" or len(graphic) != 1 or graphic[0].tag != A + "tbl":
                        raise ValueError("pptx_graphic_refused")
                    table = graphic[0]
                    grid = table.find(A + "tblGrid")
                    width = len(grid) if grid is not None else 0
                    rows = table.findall(A + "tr")
                    if not 1 <= width <= 50 or not rows or len(rows) > 2000:
                        raise ValueError("pptx_table_limit")
                    for row_number, row in enumerate(rows, 1):
                        if len(row) != width or any(c.tag != A + "tc" for c in row):
                            raise ValueError("pptx_table_refused")
                        values = []
                        for column, cell in enumerate(row, 1):
                            cells += 1
                            if cells > 20000 or any(k in cell.attrib for k in ("gridSpan", "rowSpan", "hMerge", "vMerge")):
                                raise ValueError("pptx_table_merge_refused")
                            body = cell.find(A + "txBody")
                            if body is None:
                                raise ValueError("pptx_cell_refused")
                            value = "\n".join(text_paragraph(p) for p in body.findall(A + "p"))
                            values.append(f"C{column}={json.dumps(value, ensure_ascii=False)}")
                        append(f"Slide {number} table {shape_number} row {row_number}: " + " | ".join(values))
                else:
                    raise ValueError("pptx_shape_refused")
        if not paragraphs:
            raise ValueError("pptx_text_missing")
    return {"binarySha256": hashlib.sha256(data).hexdigest(), "extractor": {"version": "pptx-slide-text-v1"}, "paragraphs": paragraphs}
