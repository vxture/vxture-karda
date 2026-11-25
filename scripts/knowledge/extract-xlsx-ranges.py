"""Versioned XLSX literal cells and explicit merge ranges; never execute formulas."""
from pathlib import Path
import runpy


def extract(path):
    reader = runpy.run_path(str(Path(__file__).with_name("extract-xlsx.py")))["extract"]
    return reader(path, merged=True)
