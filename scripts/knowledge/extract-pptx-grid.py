"""Versioned slide text and logical table anchors; no geometry or rendering."""
from pathlib import Path
import runpy


def extract(path):
    reader = runpy.run_path(str(Path(__file__).with_name("extract-pptx.py")))["extract"]
    return reader(path, merged=True)
