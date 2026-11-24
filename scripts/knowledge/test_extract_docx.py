"""Safety and reproducibility checks for the offline corpus importer."""
import importlib.util
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("extract_docx", ROOT / "extract-docx.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExtractionTests(unittest.TestCase):
    def altered(self, xml):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.docx"
            with zipfile.ZipFile(target, "w") as z:
                z.writestr("word/document.xml", xml)
            return module.extract(target)

    def document(self, text="Snapshot one"):
        return ('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>')

    def test_utf8_bom_preserves_binary_and_xml_hashes(self):
        xml = b"\xef\xbb\xbf" + ('<?xml version="1.0" encoding="UTF-8"?>' + self.document()).encode()
        output = self.altered(xml)
        self.assertEqual(output["documentXmlSha256"], hashlib.sha256(xml).hexdigest())
        self.assertEqual(output["paragraphs"], ["Snapshot one"])

    def test_non_utf8_documents_and_disguised_declarations_refused(self):
        for encoding in ("utf-16", "utf-16-le", "utf-16-be", "utf-32", "utf-32-le", "utf-32-be"):
            for prefix in ("", '<!DOCTYPE a [<!ENTITY x "hidden">]>'):
                with self.subTest(encoding=encoding, dtd=bool(prefix)):
                    with self.assertRaisesRegex(ValueError, "attachment_xml_encoding_refused"):
                        self.altered((prefix + self.document()).encode(encoding))
        for declaration in ("UTF-16", "ISO-8859-1"):
            with self.subTest(declaration=declaration):
                with self.assertRaisesRegex(ValueError, "attachment_xml_encoding_refused"):
                    self.altered(('<?xml version="1.0" encoding="' + declaration + '"?>' + self.document()).encode())
        with self.assertRaisesRegex(ValueError, "attachment_xml_encoding_refused"):
            self.altered(self.document().encode() + b"\xff")

    def test_replaced_path_cannot_mix_hash_and_paragraph_snapshots(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.docx"
            first_xml = self.document().encode()
            with zipfile.ZipFile(target, "w") as archive:
                archive.writestr("word/document.xml", first_xml)
            first = target.read_bytes()
            replacement = io.BytesIO()
            with zipfile.ZipFile(replacement, "w") as archive:
                archive.writestr("word/document.xml", self.document("Snapshot two"))
            original_zip = zipfile.ZipFile

            def replace_before_unpack(argument):
                target.write_bytes(replacement.getvalue())
                return original_zip(argument)

            with patch.object(module.zipfile, "ZipFile", side_effect=replace_before_unpack):
                output = module.extract(target)
            self.assertEqual(output["binarySha256"], hashlib.sha256(first).hexdigest())
            self.assertEqual(output["documentXmlSha256"], hashlib.sha256(first_xml).hexdigest())
            self.assertEqual(output["paragraphs"], ["Snapshot one"])
            self.assertNotEqual(target.read_bytes(), first)

    def test_real_documents(self):
        for name in ("qa", "confirmation"):
            output = module.extract(ROOT / "corpus" / ("tju-" + name + "-20261124.docx"))
            self.assertIn("TDQT202600081", "".join(output["paragraphs"]))
            self.assertEqual(len(output["binarySha256"]), 64)

    def test_dtd_refused(self):
        with self.assertRaisesRegex(ValueError, "attachment_dtd_refused"):
            self.altered(b'<!DOCTYPE a [<!ENTITY x "hidden">]><a/>')

    def test_unsupported_content(self):
        for tag in ("tbl", "del", "ins", "altChunk", "drawing", "pict", "fldSimple", "instrText"):
            with self.subTest(tag=tag), self.assertRaisesRegex(ValueError, "unsupported_attachment_content"):
                self.altered(('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:' + tag + '/></w:body></w:document>').encode())

    def test_header_not_silently_omitted(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.docx"
            with zipfile.ZipFile(target, "w") as z:
                z.writestr("word/header1.xml", "<a/>")
            with self.assertRaisesRegex(ValueError, "unsupported_attachment_parts"):
                module.extract(target)

    def test_large_input(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.docx"
            target.write_bytes(b"x" * (2 * 1024 * 1024 + 1))
            with self.assertRaisesRegex(ValueError, "attachment_size_limit"):
                module.extract(target)


if __name__ == "__main__":
    unittest.main()
