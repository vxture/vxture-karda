"""Bounded authored DOCX numbering; no rendered pages or font glyph inference."""
import copy
from pathlib import Path
import re
import runpy
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"


def integer(value, maximum=999999):
    if not isinstance(value, str) or not re.fullmatch(r"0|[1-9][0-9]{0,8}", value) or int(value) > maximum:
        raise ValueError("docx_numbering_integer_refused")
    return int(value)


def one(parent, name, required=False):
    items = parent.findall(W + name)
    if len(items) > 1 or (required and not items):
        raise ValueError("docx_numbering_structure_refused")
    return items[0] if items else None


def value(parent, name, default=None):
    element = one(parent, name)
    return element.get(W + "val") if element is not None else default


def formatted(number, kind):
    if kind == "decimal":
        return str(number)
    if kind == "decimalZero":
        return str(number).zfill(2)
    if kind in ("lowerLetter", "upperLetter"):
        result = ""
        while number:
            number, digit = divmod(number - 1, 26)
            result = chr(65 + digit) + result
        return result.lower() if kind == "lowerLetter" else result
    if kind in ("lowerRoman", "upperRoman"):
        if not 1 <= number <= 3999:
            raise ValueError("docx_numbering_value_limit")
        result = ""
        for amount, token in [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
            while number >= amount:
                result += token
                number -= amount
        return result.lower() if kind == "lowerRoman" else result
    if kind == "chineseCounting":
        if not 1 <= number <= 9999:
            raise ValueError("docx_numbering_value_limit")
        digits, units = "\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d", ["", "\u5341", "\u767e", "\u5343"]
        result, gap = "", False
        for power in range(3, -1, -1):
            digit = number // (10 ** power) % 10
            if digit:
                if gap:
                    result += digits[0]
                result += ("" if digit == 1 and power == 1 and not result else digits[digit]) + units[power]
                gap = False
            elif result and number % (10 ** power):
                gap = True
        return result
    raise ValueError("docx_numbering_format_refused")


class Numbering:
    def __init__(self, xml, names, links):
        self.styles, self.abstracts, self.nums = {}, {}, {}
        self.default_style = None
        if "word/styles.xml" in names:
            root = xml("word/styles.xml")
            if root.tag != W + "styles" or len(root) > 2000:
                raise ValueError("docx_numbering_styles_refused")
            defaults = root.find(W + "docDefaults")
            if defaults is not None and any(e.tag == W + "numPr" for e in defaults.iter()):
                raise ValueError("docx_numbering_styles_refused")
            for style in root.findall(W + "style"):
                if style.get(W + "type") != "paragraph":
                    continue
                sid = style.get(W + "styleId")
                if not sid or sid in self.styles:
                    raise ValueError("docx_numbering_styles_refused")
                self.styles[sid] = style
                if style.get(W + "default") in ("1", "true", "on"):
                    if self.default_style is not None:
                        raise ValueError("docx_numbering_styles_refused")
                    self.default_style = sid
        if "word/numbering.xml" not in names:
            return
        numbering_links = [link for link in links.values() if link.get("Type") == R + "numbering"]
        if len(numbering_links) != 1 or numbering_links[0].get("Target") not in ("numbering.xml", "/word/numbering.xml"):
            raise ValueError("docx_numbering_relationship_refused")
        root = xml("word/numbering.xml")
        if root.tag != W + "numbering" or len(root) > 1000:
            raise ValueError("docx_numbering_definitions_limit")
        for item in root:
            if item.tag == W + "abstractNum":
                aid = integer(item.get(W + "abstractNumId"))
                if aid in self.abstracts:
                    raise ValueError("docx_numbering_duplicate")
                self.abstracts[aid] = item
            elif item.tag == W + "num":
                nid = integer(item.get(W + "numId"))
                if nid == 0 or nid in self.nums:
                    raise ValueError("docx_numbering_duplicate")
                self.nums[nid] = item
            elif item.tag not in (W + "numIdMacAtCleanup",):
                raise ValueError("docx_numbering_structure_refused")

    def properties(self, properties):
        num = one(properties, "numPr") if properties is not None else None
        if num is None:
            return {}
        if any(child.tag not in (W + "ilvl", W + "numId") for child in num):
            raise ValueError("docx_numbering_properties_refused")
        return {name: integer(value(num, name), 8 if name == "ilvl" else 999999) for name in ("ilvl", "numId") if one(num, name) is not None}

    def style_properties(self, sid, seen=None):
        if sid is None:
            return {}
        seen = set() if seen is None else seen
        if sid in seen or len(seen) >= 20 or sid not in self.styles:
            raise ValueError("docx_numbering_style_chain_refused")
        seen.add(sid)
        style = self.styles[sid]
        return {**self.style_properties(value(style, "basedOn"), seen), **self.properties(one(style, "pPr"))}

    def levels(self, nid):
        num = self.nums.get(nid)
        if num is None:
            raise ValueError("docx_numbering_missing")
        aid = integer(value(num, "abstractNumId"))
        abstract = self.abstracts.get(aid)
        if abstract is None or any(abstract.find(W + name) is not None for name in ("numStyleLink", "styleLink")):
            raise ValueError("docx_numbering_linked_style_refused")
        if any(key.endswith("restartNumberingAfterBreak") and val not in ("0", "false", "off") for key, val in abstract.attrib.items()):
            raise ValueError("docx_numbering_restart_refused")
        levels = {}
        for level in abstract.findall(W + "lvl"):
            index = integer(level.get(W + "ilvl"), 8)
            if index in levels:
                raise ValueError("docx_numbering_duplicate")
            levels[index] = copy.deepcopy(level)
        overrides = set()
        for override in num.findall(W + "lvlOverride"):
            index = integer(override.get(W + "ilvl"), 8)
            if index in overrides:
                raise ValueError("docx_numbering_duplicate")
            overrides.add(index)
            replacement = one(override, "lvl")
            if replacement is not None:
                if integer(replacement.get(W + "ilvl"), 8) != index:
                    raise ValueError("docx_numbering_structure_refused")
                levels[index] = copy.deepcopy(replacement)
            if index not in levels:
                raise ValueError("docx_numbering_missing")
            start = one(override, "startOverride")
            if start is not None:
                existing = one(levels[index], "start")
                if existing is not None:
                    levels[index].remove(existing)
                levels[index].append(ET.Element(W + "start", {W + "val": start.get(W + "val", "")}))
        for index, level in levels.items():
            integer(value(level, "lvlRestart", str(index)), index)
        return levels

    def __call__(self, tree):
        # Numbering instances are independent in each authored story/note part.
        states, definitions = {}, {}
        for p in tree.iter(W + "p"):
            props = one(p, "pPr")
            sid = value(props, "pStyle", self.default_style) if props is not None else self.default_style
            settings = {**self.style_properties(sid), **self.properties(props)}
            if not settings or settings.get("numId") == 0:
                if props is not None:
                    num = one(props, "numPr")
                    if num is not None:
                        props.remove(num)
                continue
            nid, index = settings.get("numId"), settings.get("ilvl", 0)
            if nid is None:
                raise ValueError("docx_numbering_missing")
            if nid not in definitions:
                definitions[nid] = self.levels(nid)
            levels = definitions[nid]
            if index not in levels:
                raise ValueError("docx_numbering_missing")
            level = levels[index]
            if one(level, "isLgl") is not None or one(level, "lvlPicBulletId") is not None:
                raise ValueError("docx_numbering_format_refused")
            start = integer(value(level, "start", "1"))
            if start < 1:
                raise ValueError("docx_numbering_start_refused")
            counters = states.setdefault(nid, {})
            counters[index] = counters.get(index, start - 1) + 1
            if counters[index] > 999999:
                raise ValueError("docx_numbering_value_limit")
            for deeper in list(counters):
                if deeper <= index:
                    continue
                restart = integer(value(levels[deeper], "lvlRestart", str(deeper)), deeper)
                if restart != 0 and index <= restart - 1:
                    del counters[deeper]
            kind, text = value(level, "numFmt"), value(level, "lvlText")
            if kind not in ("decimal", "decimalZero", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman", "chineseCounting", "bullet"):
                raise ValueError("docx_numbering_format_refused")
            if not text or len(text) > 128 or value(level, "suff", "tab") not in ("tab", "space", "nothing"):
                raise ValueError("docx_numbering_label_refused")
            if kind == "bullet":
                if "%" in text or len(text) > 8 or any(0xE000 <= ord(c) <= 0xF8FF for c in text):
                    raise ValueError("docx_numbering_bullet_refused")
                label = text
            else:
                def token(match):
                    target = int(match.group(1)) - 1
                    if target > index or target not in levels:
                        raise ValueError("docx_numbering_reference_refused")
                    target_level = levels[target]
                    return formatted(counters.get(target, integer(value(target_level, "start", "1"))), value(target_level, "numFmt"))
                if re.search(r"%(?![1-9])", text):
                    raise ValueError("docx_numbering_reference_refused")
                label = re.sub(r"%([1-9])", token, text)
            # A literal source annotation preserves numbering identity without
            # claiming rendered indentation/font/page geometry.
            prefix = f"[list numId={nid} level={index + 1} label={label}] "
            run, node = ET.Element(W + "r"), ET.Element(W + "t")
            node.text = prefix
            run.append(node)
            p.insert(1 if props is not None else 0, run)
            if props is not None:
                num = one(props, "numPr")
                if num is not None:
                    props.remove(num)
        # numPr outside paragraph properties is not silently ignored.
        if any(e.tag == W + "numPr" for e in tree.iter()):
            raise ValueError("docx_numbering_scope_refused")
        return tree


def extract(path):
    grids = runpy.run_path(str(Path(__file__).with_name("extract-docx-grid.py")))["CellGrids"]()
    reader = runpy.run_path(str(Path(__file__).with_name("extract-docx-stories.py")))["extract"]
    result = reader(path, table_reader=grids.replace, story_factory=Numbering, version="docx-numbered-stories-v5")
    if not grids.visible_text:
        raise ValueError("attachment_text_missing")
    return result
