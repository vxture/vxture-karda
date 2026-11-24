"""Bounded offline text snapshot; no OCR, table reconstruction or active PDF actions."""
import hashlib
import io
import json
from pathlib import Path
import sys
import pypdf


def extract(path):
    with Path(path).open("rb") as handle:
        data = handle.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise ValueError("pdf_size_limit")
    if not data.startswith(b"%PDF-"):
        raise ValueError("invalid_pdf_header")
    reader = pypdf.PdfReader(io.BytesIO(data), strict=True)
    if reader.is_encrypted:
        raise ValueError("encrypted_pdf_refused")
    if not 1 <= len(reader.pages) <= 300:
        raise ValueError("pdf_page_limit")
    pages, total = [], 0
    for number, page in enumerate(reader.pages, 1):
        text = (page.extract_text() or "").replace("\r\n", "\n").replace("\r", "\n").strip()
        total += len(text)
        if len(text) > 200000 or total > 5000000 or "\x00" in text:
            raise ValueError("pdf_text_limit")
        pages.append({"page": number, "text": text,
                      "textSha256": hashlib.sha256(text.encode("utf-8")).hexdigest()})
    if not any(page["text"] for page in pages):
        raise ValueError("pdf_ocr_required")
    return {"formatVersion": 1, "binarySha256": hashlib.sha256(data).hexdigest(),
            "extractor": {"name": "pypdf", "version": pypdf.__version__}, "pages": pages}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise ValueError("usage: extract-pdf.py saved-pdf")
    print(json.dumps(extract(sys.argv[1]), ensure_ascii=True))
