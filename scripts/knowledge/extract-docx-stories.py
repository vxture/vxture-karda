"""Versioned DOCX text stories. Package order and references, never rendered pages."""
import copy
import hashlib
import io
import re
import runpy
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
P = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def extract(path, table_reader=None, version="docx-referenced-stories-v3", story_factory=None):
    with Path(path).open("rb") as handle:
        data = handle.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise ValueError("docx_binary_limit")
    legacy = runpy.run_path(str(Path(__file__).with_name("extract-docx.py")))["extract_bytes"]
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        if len(entries) > 100 or len(set(names)) != len(names) or sum(e.file_size for e in entries) > 16 * 1024 * 1024:
            raise ValueError("docx_archive_limit")
        if any(n.startswith("/") or ".." in n.split("/") or "\\" in n for n in names):
            raise ValueError("docx_path_refused")
        if any(any(v in n.lower() for v in ("vbaproject", "embeddings/", "activex/", "comments")) for n in names):
            raise ValueError("docx_parts_refused")

        def xml(name):
            entry = archive.getinfo(name)
            if entry.file_size > 2 * 1024 * 1024:
                raise ValueError("docx_xml_limit")
            text = archive.read(entry).decode("utf-8-sig")
            declaration = re.match(r"<\?xml\s+[^?]*\bencoding\s*=\s*(['\"])([^'\"]+)\1", text, re.IGNORECASE)
            if "\x00" in text or (declaration and declaration.group(2).lower() != "utf-8") or "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
                raise ValueError("docx_xml_refused")
            return ET.fromstring(text)

        for name in names:
            if name.endswith(".rels"):
                if any(e.get("TargetMode", "Internal") != "Internal" for e in xml(name)):
                    raise ValueError("docx_external_relationship")
        root = xml("word/document.xml")
        if root.tag != W + "document" or root.find(W + "body") is None:
            raise ValueError("docx_body_refused")
        links = {}
        if "word/_rels/document.xml.rels" in names:
            for link in xml("word/_rels/document.xml.rels"):
                if link.tag != P + "Relationship" or not link.get("Id") or link.get("Id") in links:
                    raise ValueError("docx_relationship_refused")
                links[link.get("Id")] = link

        story_reader = story_factory(xml, names, links) if story_factory else None
        if story_reader:
            story_reader(root)

        def validate_tree(tree):
            forbidden = {W + tag for tag in ("del", "ins", "moveFrom", "moveTo", "altChunk", "drawing", "pict", "object", "fldSimple", "instrText", "fldChar", "hyperlink", "sdt", "customXml", "sym", "vanish", "webHidden", "numPr", "delText", "commentReference", "subDoc")}
            if any(e.tag in forbidden or not e.tag.startswith(W) for e in tree.iter()):
                raise ValueError("docx_story_content_refused")

        def paragraphs(tree):
            validate_tree(tree)
            if table_reader is not None:
                tree = table_reader(copy.deepcopy(tree))
            document = ET.Element(W + "document")
            body = ET.SubElement(document, W + "body")
            for child in tree:
                body.append(copy.deepcopy(child))
            binary = io.BytesIO()
            with zipfile.ZipFile(binary, "w") as package:
                package.writestr("word/document.xml", ET.tostring(document, encoding="utf-8"))
            try:
                return legacy(binary.getvalue(), tables=True)["paragraphs"]
            except ValueError as error:
                if str(error) == "attachment_text_missing":
                    return []
                raise

        # Replace explicit note markers with stable source IDs, not inferred labels.
        note_ids = {"footnote": [], "endnote": []}
        for element in root.iter():
            for kind in note_ids:
                if element.tag == W + kind + "Reference":
                    note_id = element.get(W + "id", "")
                    if not re.fullmatch(r"[1-9][0-9]{0,8}", note_id):
                        raise ValueError("docx_note_reference_refused")
                    if note_id not in note_ids[kind]:
                        note_ids[kind].append(note_id)
                    element.tag, element.text = W + "t", f" [{kind} id={note_id}] "
                    element.attrib.clear()
        validate_tree(root)
        sections = list(root.iter(W + "sectPr"))
        if len(sections) > 100 or sum(len(ids) for ids in note_ids.values()) > 1000:
            raise ValueError("docx_story_count_limit")
        story_refs, used = [], set()
        for section_index, section in enumerate(sections, 1):
            seen = set()
            for ref in section:
                kind = "header" if ref.tag == W + "headerReference" else "footer" if ref.tag == W + "footerReference" else None
                if kind is None:
                    continue
                mode = ref.get(W + "type", "")
                if mode not in ("default", "first", "even") or (kind, mode) in seen:
                    raise ValueError("docx_story_reference_refused")
                seen.add((kind, mode))
                link = links.get(ref.get(R + "id"))
                if link is None or link.get("Type") != R[1:-1] + "/" + kind:
                    raise ValueError("docx_story_relationship_refused")
                target = link.get("Target", "")
                target = target[1:] if target.startswith("/word/") else "word/" + target
                if not re.fullmatch(r"word/" + kind + r"[A-Za-z0-9_-]*\.xml", target) or target not in names:
                    raise ValueError("docx_story_target_refused")
                story_refs.append((section_index, kind, mode, target))
                used.add(target)
        if len(story_refs) != sum(1 for e in root.iter() if e.tag in (W + "headerReference", W + "footerReference")):
            raise ValueError("docx_story_scope_refused")
        output = paragraphs(root.find(W + "body"))
        def append(values):
            output.extend(values)
            if len(output) > 20000 or sum(len(t) for t in output) > 5000000:
                raise ValueError("docx_story_text_limit")
        for section_index, kind, mode, target in story_refs:
            story = xml(target)
            if story_reader:
                story_reader(story)
            if story.tag != W + ("hdr" if kind == "header" else "ftr") or any(e.tag in (W + "footnoteReference", W + "endnoteReference") for e in story.iter()):
                raise ValueError("docx_story_root_refused")
            append(f"Section {section_index} {kind} {mode} part={target} paragraph {i}: {text}" for i, text in enumerate(paragraphs(story), 1))
        for kind, ids in note_ids.items():
            target = "word/" + kind + "s.xml"
            if target not in names:
                if ids:
                    raise ValueError("docx_note_missing")
                continue
            note_links = [link for link in links.values() if link.get("Type") == R[1:-1] + "/" + kind + "s"]
            if ids and (len(note_links) != 1 or note_links[0].get("Target") not in (kind + "s.xml", "/" + target)):
                raise ValueError("docx_note_relationship_refused")
            notes_root = xml(target)
            if notes_root.tag != W + kind + "s" or len(notes_root) > 1002:
                raise ValueError("docx_notes_root_refused")
            notes, seen_notes = {}, set()
            for note in notes_root:
                note_id = note.get(W + "id", "")
                if note.tag != W + kind or note_id in seen_notes:
                    raise ValueError("docx_note_id_refused")
                seen_notes.add(note_id)
                if note.get(W + "type") in ("separator", "continuationSeparator"):
                    if any(e.tag == W + "t" and (e.text or "").strip() for e in note.iter()):
                        raise ValueError("docx_note_separator_refused")
                    continue
                if note.get(W + "type", "normal") != "normal":
                    raise ValueError("docx_note_type_refused")
                notes[note_id] = note
            if set(notes) != set(ids):
                raise ValueError("docx_note_mapping_refused")
            for note_id in ids:
                note = notes[note_id]
                if story_reader:
                    story_reader(note)
                for marker in list(note.iter()):
                    if marker.tag == W + kind + "Ref":
                        marker.tag, marker.text = W + "t", ""
                if any(e.tag in (W + "footnoteReference", W + "endnoteReference") for e in note.iter()):
                    raise ValueError("docx_nested_note_refused")
                append(f"{kind} id={note_id} paragraph {i}: {text}" for i, text in enumerate(paragraphs(note), 1))
        if any(re.fullmatch(r"word/(header|footer)[A-Za-z0-9_-]*\.xml", n) and n not in used for n in names):
            raise ValueError("docx_orphan_story_refused")
        if any(n.startswith(("word/footnotes", "word/endnotes")) and n not in ("word/footnotes.xml", "word/endnotes.xml") for n in names):
            raise ValueError("docx_note_part_refused")
        if not output or len(output) > 20000 or sum(len(t) for t in output) > 5000000:
            raise ValueError("docx_story_text_limit")
    return {"binarySha256": hashlib.sha256(data).hexdigest(), "extractor": {"version": version}, "paragraphs": output}
