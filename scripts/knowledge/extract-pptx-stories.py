"""Explicit authored groups and linked speaker notes, never master/geometry text."""
from pathlib import Path
import re
import runpy

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"


class AuthoredStories:
    def __init__(self):
        self.count = 0
        self.used_notes = set()

    def shapes(self, tree, prefix="", depth=0):
        if depth > 4:
            raise ValueError("pptx_group_depth_limit")
        if depth and (len(tree.findall(P + "nvGrpSpPr")) != 1 or len(tree.findall(P + "grpSpPr")) != 1):
            raise ValueError("pptx_group_structure_refused")
        for index, shape in enumerate(tree, 1):
            self.count += 1
            if self.count > 10000:
                raise ValueError("pptx_shape_count_limit")
            path = f"{prefix}/{index}" if prefix else str(index)
            if shape.tag == P + "grpSp":
                if any(e.get("hidden") in ("1", "true") for e in shape.iter()):
                    raise ValueError("pptx_hidden_content_refused")
                yield from self.shapes(shape, path, depth + 1)
            else:
                yield path, shape

    def relationships(self, name, names, xml):
        if name not in names:
            return []
        root = xml(name)
        if root.tag != REL + "Relationships":
            raise ValueError("pptx_note_relationship_refused")
        seen = set()
        for link in root:
            if link.tag != REL + "Relationship" or not link.get("Id") or link.get("Id") in seen or link.get("TargetMode", "Internal") != "Internal":
                raise ValueError("pptx_note_relationship_refused")
            seen.add(link.get("Id"))
        return list(root)

    def notes(self, number, slide, names, xml, text_paragraph):
        links = self.relationships("ppt/slides/_rels/" + Path(slide).name + ".rels", names, xml)
        notes = [e for e in links if e.get("Type") == R + "notesSlide"]
        if not notes:
            return []
        if len(notes) != 1:
            raise ValueError("pptx_note_relationship_refused")
        target = notes[0].get("Target", "")
        if target.startswith("../notesSlides/"):
            target = "ppt/notesSlides/" + target[len("../notesSlides/"):]
        elif target.startswith("/ppt/notesSlides/"):
            target = target[1:]
        else:
            raise ValueError("pptx_note_target_refused")
        if not re.fullmatch(r"ppt/notesSlides/[A-Za-z0-9_-]+\.xml", target) or target not in names or target in self.used_notes:
            raise ValueError("pptx_note_target_refused")
        self.used_notes.add(target)
        back = [e for e in self.relationships("ppt/notesSlides/_rels/" + Path(target).name + ".rels", names, xml) if e.get("Type") == R + "slide"]
        if len(back) != 1 or back[0].get("Target") not in ("../slides/" + Path(slide).name, "/" + slide):
            raise ValueError("pptx_note_backlink_refused")
        root = xml(target)
        tree = root.find(P + "cSld/" + P + "spTree")
        if root.tag != P + "notes" or tree is None or any(e.tag in (P + "timing", P + "oleObj", P + "contentPart", "{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent") for e in root.iter()):
            raise ValueError("pptx_note_content_refused")
        output, seen_body, consumed = [], False, set()
        for index, shape in enumerate(tree, 1):
            self.count += 1
            if self.count > 10000:
                raise ValueError("pptx_shape_count_limit")
            if shape.tag in (P + "nvGrpSpPr", P + "grpSpPr"):
                continue
            if shape.tag != P + "sp" or any(e.get("hidden") in ("1", "true") for e in shape.iter()):
                raise ValueError("pptx_note_shape_refused")
            placeholders = list(shape.iter(P + "ph"))
            if len(placeholders) != 1:
                raise ValueError("pptx_note_placeholder_refused")
            kind = placeholders[0].get("type", "obj")
            if kind in ("sldImg", "sldNum"):
                # Only a known slide-number field may carry a discarded cached value.
                fields = list(shape.iter(A + "fld"))
                cached = {id(t) for field in fields for t in field.iter(A + "t")}
                if (fields and (kind != "sldNum" or any(e.get("type") != "slidenum" for e in fields))) or any((e.text or "").strip() and id(e) not in cached for e in shape.iter(A + "t")):
                    raise ValueError("pptx_note_placeholder_text_refused")
                consumed.update(cached)
                continue
            if kind != "body" or seen_body:
                raise ValueError("pptx_note_placeholder_refused")
            seen_body = True
            body = shape.find(P + "txBody")
            if body is None or any(e.tag not in (A + "bodyPr", A + "lstStyle", A + "p") for e in body):
                raise ValueError("pptx_note_body_refused")
            if any(e.tag in (A + "tbl", A + "blip", A + "graphic", A + "extLst") for e in shape.iter()):
                raise ValueError("pptx_note_content_refused")
            for ordinal, paragraph in enumerate(body.findall(A + "p"), 1):
                text = text_paragraph(paragraph)
                consumed.update(id(t) for t in paragraph.iter(A + "t"))
                if text:
                    output.append(f"Slide {number} speaker notes part={target} shape {index} paragraph {ordinal}: {text}")
        if any((e.text or "").strip() and id(e) not in consumed for e in root.iter(A + "t")):
            raise ValueError("pptx_note_unmapped_text_refused")
        return output

    def finish(self, names, xml):
        for name in names:
            if name.startswith("ppt/notesSlides/") and name.endswith(".xml") and name not in self.used_notes:
                raise ValueError("pptx_orphan_notes_refused")


def extract(path):
    reader = runpy.run_path(str(Path(__file__).with_name("extract-pptx.py")))["extract"]
    return reader(path, merged=True, stories=AuthoredStories())
