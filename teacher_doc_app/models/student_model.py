from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, Any


@dataclass
class Student:
    grade: str = ""
    class_no: str = ""
    number: str = ""
    name: str = ""
    guardian_name: str = ""
    contact: str = ""
    extra: Dict[str, Any] = None

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["extra"] = self.extra or {}
        return payload

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Student":
        return cls(
            grade=str(data.get("grade", "")),
            class_no=str(data.get("class_no", "")),
            number=str(data.get("number", "")),
            name=str(data.get("name", "")),
            guardian_name=str(data.get("guardian_name", "")),
            contact=str(data.get("contact", "")),
            extra=data.get("extra", {}) or {},
        )
