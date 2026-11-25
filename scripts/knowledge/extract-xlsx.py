"""Bounded XLSX literal-cell extraction; no formulas, execution or formatting guesses."""
import hashlib
import io
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

W = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
P = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def position(ref):
    match = re.fullmatch(r"([A-Z]{1,3})([1-9][0-9]{0,6})", ref)
    if not match:
        raise ValueError("xlsx_range_refused")
    column = 0
    for letter in match[1]:
        column = column * 26 + ord(letter) - 64
    row = int(match[2])
    if column > 16384 or row > 1048576:
        raise ValueError("xlsx_range_refused")
    return row, column


def merge_ranges(root):
    groups = root.findall(W + "mergeCells")
    if len(groups) > 1 or sum(1 for e in root.iter(W + "mergeCells")) != len(groups):
        raise ValueError("xlsx_merge_scope_refused")
    if not groups:
        if any(e.tag == W + "mergeCell" for e in root.iter()):
            raise ValueError("xlsx_merge_scope_refused")
        return [], {}
    group = groups[0]
    if len(group) > 1000 or any(e.tag != W + "mergeCell" or len(e) or set(e.attrib) != {"ref"} for e in group):
        raise ValueError("xlsx_merge_limit")
    count = group.get("count")
    if count is not None and (not re.fullmatch(r"[0-9]{1,4}", count) or int(count) != len(group)):
        raise ValueError("xlsx_merge_count_refused")
    if sum(1 for e in root.iter(W + "mergeCell")) != len(group):
        raise ValueError("xlsx_merge_scope_refused")
    ranges, covered = [], {}
    for item in group:
        ref = item.get("ref", "")
        parts = ref.split(":")
        if len(parts) != 2:
            raise ValueError("xlsx_range_refused")
        start, end = position(parts[0]), position(parts[1])
        if start[0] > end[0] or start[1] > end[1] or start == end:
            raise ValueError("xlsx_range_refused")
        area = (end[0] - start[0] + 1) * (end[1] - start[1] + 1)
        if len(covered) + area > 20000:
            raise ValueError("xlsx_merge_area_limit")
        for row in range(start[0], end[0] + 1):
            for column in range(start[1], end[1] + 1):
                if (row, column) in covered:
                    raise ValueError("xlsx_merge_overlap_refused")
                covered[(row, column)] = start
        ranges.append((start, end, ref, parts[0]))
    return sorted(ranges), covered


def extract(path, merged=False):
    with Path(path).open("rb") as handle:
        data = handle.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError("xlsx_binary_limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        if len(entries) > 500 or len(set(names)) != len(names) or sum(e.file_size for e in entries) > 32 * 1024 * 1024:
            raise ValueError("xlsx_archive_limit")
        if any(n.startswith("/") or ".." in n.split("/") or "\\" in n for n in names):
            raise ValueError("xlsx_path_refused")
        if any(any(part in n.lower() for part in ("vbaproject", "externallinks/", "drawings/", "comments", "embeddings/", "connections.xml", "pivot", "querytables/")) for n in names):
            raise ValueError("xlsx_unsupported_parts")

        def xml(name):
            entry = archive.getinfo(name)
            if entry.file_size > 4 * 1024 * 1024:
                raise ValueError("xlsx_xml_limit")
            text = archive.read(entry).decode("utf-8-sig")
            declaration = re.match(r"<\?xml\s+[^?]*\bencoding\s*=\s*(['\"])([^'\"]+)\1", text, re.IGNORECASE)
            if "\x00" in text or (declaration and declaration.group(2).lower() != "utf-8") or "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
                raise ValueError("xlsx_xml_refused")
            return ET.fromstring(text)

        for name in names:
            if name.endswith(".rels"):
                if any(e.get("TargetMode") == "External" for e in xml(name)):
                    raise ValueError("xlsx_external_relationship")
        workbook = xml("xl/workbook.xml")
        defined = workbook.find(W + "definedNames")
        if workbook.tag != W + "workbook" or (defined is not None and len(defined)):
            raise ValueError("xlsx_workbook_refused")
        sheets = workbook.find(W + "sheets")
        if sheets is None or not 1 <= len(sheets) <= 20:
            raise ValueError("xlsx_sheet_limit")
        links = {}
        for link in xml("xl/_rels/workbook.xml.rels"):
            if link.tag != P + "Relationship" or not link.get("Id") or link.get("Id") in links:
                raise ValueError("xlsx_relationship_refused")
            links[link.get("Id")] = link
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = xml("xl/sharedStrings.xml")
            if root.tag != W + "sst" or len(root) > 20000:
                raise ValueError("xlsx_string_limit")
            for item in root:
                if item.tag != W + "si" or any(e.tag not in {W + tag for tag in ("si", "t", "r", "rPr", "b", "i", "sz", "color", "rFont", "family", "scheme", "u", "vertAlign", "strike")} for e in item.iter()):
                    raise ValueError("xlsx_string_refused")
                shared.append("".join(e.text or "" for e in item.iter(W + "t")))
        formats = ["0"]
        if "xl/styles.xml" in names:
            cell_formats = xml("xl/styles.xml").find(W + "cellXfs")
            if cell_formats is None or len(cell_formats) > 1000:
                raise ValueError("xlsx_style_refused")
            formats = [e.get("numFmtId", "0") for e in cell_formats]
        paragraphs = []
        seen_names, seen_targets = set(), set()
        cells_count = rows_count = chars = merged_area = merged_count = literal_rows = 0
        for sheet in sheets:
            name = sheet.get("name", "")
            link = links.get(sheet.get(R + "id"))
            if sheet.tag != W + "sheet" or not name or len(name) > 128 or name in seen_names or sheet.get("state", "visible") != "visible" or link is None or not link.get("Type", "").endswith("/worksheet"):
                raise ValueError("xlsx_sheet_refused")
            target = link.get("Target", "")
            target = target[1:] if target.startswith("/xl/") else "xl/" + target
            if not re.fullmatch(r"xl/worksheets/[A-Za-z0-9_-]+\.xml", target) or target in seen_targets:
                raise ValueError("xlsx_sheet_target_refused")
            seen_names.add(name)
            seen_targets.add(target)
            root = xml(target)
            if root.tag != W + "worksheet" or any(e.tag in {W + tag for tag in ("f", "hyperlinks", "drawing", "legacyDrawing", "tableParts", "extLst", "oleObjects", "controls")} or (not merged and e.tag in (W + "mergeCells", W + "mergeCell")) or e.get("hidden") in ("1", "true") or
                (e.tag == W + "col" and "style" in e.attrib) or (e.tag == W + "row" and ("s" in e.attrib or "customFormat" in e.attrib)) for e in root.iter()):
                raise ValueError("xlsx_content_refused")
            body = root.find(W + "sheetData")
            if body is None or (merged and sum(1 for e in root.iter(W + "sheetData")) != 1):
                raise ValueError("xlsx_sheet_data_missing")
            ranges, covered = merge_ranges(root) if merged else ([], {})
            merged_area += len(covered)
            merged_count += len(ranges)
            if merged_area > 20000 or merged_count > 1000:
                raise ValueError("xlsx_merge_budget")
            for start, end, ref, anchor in ranges:
                text = f"Sheet {json.dumps(name, ensure_ascii=False)} merged {ref} anchor={anchor} rows={end[0]-start[0]+1} columns={end[1]-start[1]+1}"
                chars += len(text)
                paragraphs.append(text)
            previous_row = 0
            for row in body:
                row_number = int(row.get("r", "0"))
                rows_count += 1
                if row.tag != W + "row" or not previous_row < row_number <= 1048576 or rows_count > 10000:
                    raise ValueError("xlsx_row_limit")
                previous_row = row_number
                values, previous_column = [], 0
                for cell in row:
                    ref = cell.get("r", "")
                    match = re.fullmatch(r"([A-Z]{1,3})([1-9][0-9]{0,6})", ref)
                    if cell.tag != W + "c" or not match or int(match[2]) != row_number or any(k not in ("r", "s", "t") for k in cell.attrib):
                        raise ValueError("xlsx_cell_refused")
                    column = 0
                    for letter in match[1]:
                        column = column * 26 + ord(letter) - 64
                    cells_count += 1
                    if not previous_column < column <= 16384 or cells_count > 20000 or any(e.tag not in (W + "v", W + "is") for e in cell):
                        raise ValueError("xlsx_cell_limit")
                    previous_column = column
                    kind = cell.get("t", "n")
                    if len(cell.findall(W + "v")) > 1 or len(cell.findall(W + "is")) > 1 or (kind != "inlineStr" and cell.find(W + "is") is not None):
                        raise ValueError("xlsx_cell_refused")
                    raw = cell.findtext(W + "v")
                    if kind == "inlineStr":
                        inline = cell.find(W + "is")
                        if inline is None or any(e.tag not in (W + "is", W + "t") for e in inline.iter()):
                            raise ValueError("xlsx_inline_refused")
                        value, kind = "".join(e.text or "" for e in inline.iter(W + "t")), "text"
                    elif raw is None:
                        continue
                    elif kind == "s":
                        if not re.fullmatch(r"[0-9]+", raw) or int(raw) >= len(shared):
                            raise ValueError("xlsx_shared_refused")
                        value, kind = shared[int(raw)], "text"
                    elif kind == "b" and raw in ("0", "1"):
                        value, kind = raw == "1", "boolean"
                    elif kind == "n" and re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?", raw):
                        style = int(cell.get("s", "0"))
                        if style < 0 or style >= len(formats) or formats[style] != "0":
                            raise ValueError("xlsx_number_format_refused")
                        value, kind = raw, "number(raw)"
                    else:
                        raise ValueError("xlsx_value_refused")
                    if isinstance(value, str) and (len(value) > 32767 or "\x00" in value):
                        raise ValueError("xlsx_value_limit")
                    anchor = covered.get((row_number, column))
                    if anchor is not None and anchor != (row_number, column):
                        if value != "":
                            raise ValueError("xlsx_covered_value_refused")
                        continue
                    values.append(f"{ref} ({kind})={json.dumps(value, ensure_ascii=False)}")
                if values:
                    literal_rows += 1
                    text = f"Sheet {json.dumps(name, ensure_ascii=False)} row {row_number}: " + " | ".join(values)
                    chars += len(text)
                    if chars > 5000000:
                        raise ValueError("xlsx_text_limit")
                    paragraphs.append(text)
        if not paragraphs or (merged and not literal_rows):
            raise ValueError("xlsx_text_missing")
    return {"binarySha256": hashlib.sha256(data).hexdigest(), "extractor": {"version": "xlsx-cell-ranges-v2" if merged else "xlsx-literal-cells-v1"}, "paragraphs": paragraphs}
