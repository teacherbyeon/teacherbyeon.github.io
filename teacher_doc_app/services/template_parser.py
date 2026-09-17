from __future__ import annotations

from typing import List

from utils.text_utils import extract_placeholders


class TemplateParser:
    def parse_placeholders(self, text: str) -> List[str]:
        return extract_placeholders(text)
