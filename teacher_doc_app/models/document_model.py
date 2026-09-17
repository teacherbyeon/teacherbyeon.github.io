from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Any


@dataclass
class DocumentBuildRequest:
    template_id: str
    template_path: str
    output_path: str
    values: Dict[str, Any] = field(default_factory=dict)
    pdf_output_path: str = ""
