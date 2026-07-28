import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "expected exactly one file path"}))
        return 2

    target = Path(sys.argv[1]).expanduser()
    if not target.is_file():
        print(json.dumps({"error": "file not found"}))
        return 2

    try:
        from markitdown import MarkItDown
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"error": f"markitdown import failed: {exc}"}))
        return 3

    try:
        result = MarkItDown().convert(str(target))
        markdown = getattr(result, "text_content", None) or getattr(result, "text", None) or ""
        print(json.dumps({"markdown": markdown}))
        return 0
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"error": f"markitdown conversion failed: {exc}"}))
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
