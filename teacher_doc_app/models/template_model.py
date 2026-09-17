from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional


@dataclass
class FieldMapping:
    mode: str = "manual"  # manual|fixed|student|today|date_range_days|expression|snippet
    value: str = ""
    student_key: str = ""
    expression: str = ""
    date_format: str = "%Y-%m-%d"

    def to_dict(self) -> Dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict) -> "FieldMapping":
        return cls(**{k: data.get(k) for k in cls.__annotations__.keys() if k in data})


@dataclass
class TemplateConfig:
    template_id: str
    name: str
    template_path: str
    placeholders: List[str] = field(default_factory=list)
    mappings: Dict[str, FieldMapping] = field(default_factory=dict)
    snippets: Dict[str, List[str]] = field(default_factory=dict)
    filename_rule: str = "{{학년}}학년_{{반}}반_{{번호}}번_{{이름}}_{{template_name}}_{{today}}"

    def to_dict(self) -> Dict:
        return {
            "template_id": self.template_id,
            "name": self.name,
            "template_path": self.template_path,
            "placeholders": self.placeholders,
            "mappings": {k: v.to_dict() for k, v in self.mappings.items()},
            "snippets": self.snippets,
            "filename_rule": self.filename_rule,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "TemplateConfig":
        mappings = {
            k: FieldMapping.from_dict(v if isinstance(v, dict) else {})
            for k, v in data.get("mappings", {}).items()
        }
        return cls(
            template_id=data.get("template_id", ""),
            name=data.get("name", ""),
            template_path=data.get("template_path", ""),
            placeholders=data.get("placeholders", []),
            mappings=mappings,
            snippets=data.get("snippets", {}),
            filename_rule=data.get("filename_rule", "{{template_name}}_{{today}}"),
        )


@dataclass
class TemplateStore:
    templates: Dict[str, TemplateConfig] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {"templates": {k: v.to_dict() for k, v in self.templates.items()}}

    @classmethod
    def from_dict(cls, data: Dict) -> "TemplateStore":
        items = {
            k: TemplateConfig.from_dict(v if isinstance(v, dict) else {})
            for k, v in data.get("templates", {}).items()
        }
        return cls(templates=items)

    def get(self, template_id: str) -> Optional[TemplateConfig]:
        return self.templates.get(template_id)
