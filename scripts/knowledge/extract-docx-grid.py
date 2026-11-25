"""Bounded logical DOCX cell grids, including explicit merges and nested tables.

No rendered geometry, numbering/style inference or duplicated merged-cell text.
The v3 story reader retains package validation and provenance outside tables.
"""
import json
from pathlib import Path
import re
import runpy
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class CellGrids:
    def __init__(self):
        self.tables = self.rows = self.cells = self.characters = 0
        self.visible_text = False

    def bounded(self, text):
        self.characters += len(text)
        if self.characters > 5000000:
            raise ValueError("docx_grid_text_limit")
        return text

    def paragraph(self, tree):
        text = "".join((e.text or "") if e.tag == W + "t" else " " for e in tree.iter() if e.tag in (W + "t", W + "tab", W + "br"))
        return " ".join(text.split())

    def table(self, table, path, depth):
        self.tables += 1
        if depth > 4 or self.tables > 100:
            raise ValueError("docx_grid_table_limit")
        if any(e.tag not in (W + "tblPr", W + "tblGrid", W + "tr") for e in table):
            raise ValueError("docx_grid_structure_refused")
        grids = table.findall(W + "tblGrid")
        if len(grids) > 1:
            raise ValueError("docx_grid_structure_refused")
        width = None
        if grids:
            if any(c.tag != W + "gridCol" for c in grids[0]):
                raise ValueError("docx_grid_structure_refused")
            width = len(grids[0])
            if not 1 <= width <= 50:
                raise ValueError("docx_grid_width_refused")
        rows, anchors, active = table.findall(W + "tr"), [], {}
        if not rows:
            raise ValueError("docx_grid_structure_refused")
        for row_index, row in enumerate(rows, 1):
            self.rows += 1
            if self.rows > 2000:
                raise ValueError("docx_grid_row_limit")
            if any(e.tag not in (W + "trPr", W + "tblPrEx", W + "tc") for e in row):
                raise ValueError("docx_grid_structure_refused")
            column, next_active = 1, {}
            cells = row.findall(W + "tc")
            if not cells or len(cells) > 50:
                raise ValueError("docx_grid_width_refused")
            for cell in cells:
                self.cells += 1
                if self.cells > 20000 or any(e.tag not in (W + "tcPr", W + "p", W + "tbl") for e in cell):
                    raise ValueError("docx_grid_cell_limit")
                properties = cell.findall(W + "tcPr")
                if len(properties) > 1:
                    raise ValueError("docx_grid_structure_refused")
                spans = properties[0].findall(W + "gridSpan") if properties else []
                merges = properties[0].findall(W + "vMerge") if properties else []
                if len(spans) > 1 or len(merges) > 1:
                    raise ValueError("docx_grid_merge_refused")
                span = spans[0].get(W + "val", "") if spans else "1"
                if not re.fullmatch(r"[1-9][0-9]?", span) or int(span) > 50:
                    raise ValueError("docx_grid_merge_refused")
                span = int(span)
                mode = merges[0].get(W + "val", "continue") if merges else None
                if mode not in (None, "restart", "continue") or column + span - 1 > 50:
                    raise ValueError("docx_grid_merge_refused")
                # A continuation cannot carry hidden text, drawings or a nested grid.
                if mode == "continue":
                    prior = active.get(column)
                    if prior is None or prior["columns"] != span or any(e.tag == W + "tbl" or (e.tag == W + "t" and (e.text or "").strip()) for e in cell.iter()):
                        raise ValueError("docx_grid_continuation_refused")
                    prior["rows"] += 1
                    next_active[column] = prior
                else:
                    anchor = {"row": row_index, "column": column, "rows": 1, "columns": span, "blocks": []}
                    nested = 0
                    for block in cell:
                        if block.tag == W + "p":
                            value = self.paragraph(block)
                            if value:
                                anchor["blocks"].append(self.bounded(json.dumps(value, ensure_ascii=False)))
                        elif block.tag == W + "tbl":
                            nested += 1
                            anchor["blocks"].extend(self.table(block, f"{path}/R{row_index}C{column}/table{nested}", depth + 1))
                    anchors.append(anchor)
                    if mode == "restart":
                        next_active[column] = anchor
                column += span
            if width is None:
                width = column - 1
            if column - 1 != width:
                raise ValueError("docx_grid_width_refused")
            active = next_active
        output = [self.bounded(f"Table {path} grid rows={len(rows)} columns={width}")]
        for anchor in anchors:
            label = f"Table {path} R{anchor['row']}C{anchor['column']} rows={anchor['rows']} columns={anchor['columns']}"
            output.append(self.bounded(label + ": " + (anchor["blocks"][0] if anchor["blocks"] else '""')))
            for index, text in enumerate(anchor["blocks"][1:], 2):
                output.append(self.bounded(label + f" block={index}: " + text))
        return output

    def replace(self, tree):
        forbidden = {W + tag for tag in ("hMerge", "gridBefore", "gridAfter", "tblPrChange", "trPrChange", "tcPrChange", "tblGridChange", "cellMerge", "cellIns", "cellDel")}
        if any(e.tag in forbidden for e in tree.iter()):
            raise ValueError("docx_grid_structure_refused")
        self.visible_text = self.visible_text or any(e.tag == W + "t" and (e.text or "").strip() for e in tree.iter())
        allowed_parents = {"gridSpan": {"tcPr"}, "vMerge": {"tcPr"}, "tcPr": {"tc"}, "tc": {"tr"},
                           "tr": {"tbl"}, "tblGrid": {"tbl"}, "gridCol": {"tblGrid"}}
        for parent in tree.iter():
            for child in parent:
                valid = allowed_parents.get(child.tag.removeprefix(W))
                if valid is not None and parent.tag not in {W + name for name in valid}:
                    raise ValueError("docx_grid_scope_refused")
        # Top-level table order is local to each story; the story reader labels it.
        index = 0
        children = []
        for block in tree:
            if block.tag != W + "tbl":
                if any(e.tag == W + "tbl" for e in block.iter()):
                    raise ValueError("docx_grid_scope_refused")
                children.append(block)
                continue
            index += 1
            for text in self.table(block, str(index), 1):
                p = ET.Element(W + "p")
                ET.SubElement(ET.SubElement(p, W + "r"), W + "t").text = text
                children.append(p)
        tree[:] = children
        return tree


def extract(path):
    reader = runpy.run_path(str(Path(__file__).with_name("extract-docx-stories.py")))["extract"]
    grids = CellGrids()
    result = reader(path, table_reader=grids.replace, version="docx-cell-grid-v4")
    if not grids.visible_text:
        raise ValueError("attachment_text_missing")
    return result
