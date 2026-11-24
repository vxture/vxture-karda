"""Safety and reproducibility checks for the offline corpus importer."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
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
