"""Raster only: bounded local PDF pages for the Atlas OCR provider."""
import io
import json
import subprocess
import sys
from pathlib import Path
import pypdf

data = Path(sys.argv[1]).read_bytes()
if not data.startswith(b"%PDF-") or len(data) > 8 * 1024 * 1024:
    raise ValueError("ocr_invalid_pdf")
reader = pypdf.PdfReader(io.BytesIO(data), strict=True)
if reader.is_encrypted or not 1 <= len(reader.pages) <= 20:
    raise ValueError("ocr_pdf_limit")
folder = Path(sys.argv[2])
for index in range(len(reader.pages)):
    # A bounded raster; never execute PDF links, scripts or embedded files.
    subprocess.run(["pdftoppm", "-f", str(index + 1), "-l", str(index + 1),
                    "-singlefile", "-scale-to", "1600", "-png", sys.argv[1],
                    str(folder / ("page-" + str(index)))],
                   check=True, timeout=15, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)
print(json.dumps({"pages": len(reader.pages)}))
