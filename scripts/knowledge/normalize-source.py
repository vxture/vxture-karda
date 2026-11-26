"""Runtime adapter for the owned, bounded offline extractors; stdout is data only."""
import json
from pathlib import Path
import runpy
import sys

if sys.platform != "win32":
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))

mime, source = sys.argv[1:]
if mime == "application/pdf":
    import pypdf
    if pypdf.__version__ != "6.21.4":
        raise ValueError("source_parser_version_mismatch")
    script = "extract-pdf.py"
elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    script = "extract-docx-numbering.py"
elif mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    script = "extract-xlsx-ranges.py"
elif mime == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    script = "extract-pptx-stories.py"
else:
    raise ValueError("source_format_unsupported")
module = runpy.run_path(str(Path(__file__).with_name(script)))
result = module["extract"](source, tables=True) if script == "extract-docx.py" else module["extract"](source)
print(json.dumps(result, ensure_ascii=True))
