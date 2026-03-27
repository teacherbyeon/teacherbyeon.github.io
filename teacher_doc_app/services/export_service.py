from __future__ import annotations

import os
from datetime import datetime
from typing import Dict

from utils.text_utils import sanitize_filename


class ExportService:
    def build_filename(self, rule: str, values: Dict[str, str], template_name: str, ext: str = ".hwp") -> str:
        base = rule
        merged = dict(values)
        merged["template_name"] = template_name
        merged["today"] = datetime.now().strftime("%Y-%m-%d")
        for key, value in merged.items():
            base = base.replace("{{%s}}" % key, str(value or ""))
        base = sanitize_filename(base) or "output"
        if not base.lower().endswith(ext):
            base += ext
        return base

    def build_output_path(self, output_dir: str, filename: str) -> str:
        os.makedirs(output_dir, exist_ok=True)
        return os.path.join(output_dir, filename)
