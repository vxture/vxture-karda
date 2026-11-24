"""Synthetic PDFs only. Owner source material is never needed by CI."""
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, DictionaryObject, DecodedStreamObject

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("extract_pdf", ROOT / "extract-pdf.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def synthetic_pdf(texts, password=None):
    writer = PdfWriter()
    for text in texts:
        page = writer.add_blank_page(width=300, height=300)
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                                 NameObject("/Subtype"): NameObject("/Type1"),
                                 NameObject("/BaseFont"): NameObject("/Helvetica")})
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
        stream = DecodedStreamObject()
        stream.set_data(("BT /F1 12 Tf 20 200 Td (" + text + ") Tj ET").encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    if password:
        writer.encrypt(password)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


class PdfExtractionTests(unittest.TestCase):
    def extract_bytes(self, data):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.pdf"
            target.write_bytes(data)
            return module.extract(target)

    def test_real_parser_preserves_physical_pages_and_blank_pages(self):
        data = synthetic_pdf(["PROJECT-TEST original", "", "Last page"])
        result = self.extract_bytes(data)
        self.assertEqual(result["binarySha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(result["extractor"], {"name": "pypdf", "version": "6.21.4"})
        self.assertEqual([p["page"] for p in result["pages"]], [1, 2, 3])
        self.assertEqual([p["text"] for p in result["pages"]], ["PROJECT-TEST original", "", "Last page"])
        for page in result["pages"]:
            self.assertEqual(page["textSha256"], hashlib.sha256(page["text"].encode()).hexdigest())

    def test_image_only_or_blank_pdf_requires_ocr(self):
        with self.assertRaisesRegex(ValueError, "pdf_ocr_required"):
            self.extract_bytes(synthetic_pdf([""]))

    def test_encrypted_and_non_pdf_input_refused(self):
        with self.assertRaisesRegex(ValueError, "encrypted_pdf_refused"):
            self.extract_bytes(synthetic_pdf(["Secret"], password="test-only"))
        with self.assertRaisesRegex(ValueError, "invalid_pdf_header"):
            self.extract_bytes(b"not a PDF")

    def test_size_and_page_limits(self):
        with self.assertRaisesRegex(ValueError, "pdf_size_limit"):
            self.extract_bytes(b"%PDF-" + b"x" * (20 * 1024 * 1024))
        with self.assertRaisesRegex(ValueError, "pdf_page_limit"):
            self.extract_bytes(synthetic_pdf([""] * 301))

    def test_path_replacement_cannot_mix_binary_and_text(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.pdf"
            first = synthetic_pdf(["PROJECT-TEST original"])
            target.write_bytes(first)

            def replace_before_parse(snapshot, strict):
                target.write_bytes(synthetic_pdf(["Replacement"]))
                return PdfReader(snapshot, strict=strict)

            with patch.object(module.pypdf, "PdfReader", side_effect=replace_before_parse):
                result = module.extract(target)
            self.assertEqual(result["binarySha256"], hashlib.sha256(first).hexdigest())
            self.assertEqual(result["pages"][0]["text"], "PROJECT-TEST original")


if __name__ == "__main__":
    unittest.main()
