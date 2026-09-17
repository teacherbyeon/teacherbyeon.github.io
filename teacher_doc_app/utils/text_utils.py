from __future__ import annotations

import re
from typing import List

PLACEHOLDER_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def extract_placeholders(text: str) -> List[str]:
    seen = set()
    ordered = []
    for match in PLACEHOLDER_RE.finditer(text or ""):
        key = match.group(1).strip()
        if key and key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


def sanitize_filename(name: str) -> str:
    invalid = '<>:"/\\|?*'
    result = "".join("_" if c in invalid else c for c in name)
    return " ".join(result.split()).strip("._ ")
