from __future__ import annotations

import os
import uuid
from typing import Dict

from models.template_model import TemplateConfig, TemplateStore, FieldMapping
from utils.file_utils import load_json, save_json, ensure_dir


class ConfigService:
    def __init__(self, data_dir: str) -> None:
        self.data_dir = data_dir
        ensure_dir(data_dir)
        self.templates_file = os.path.join(data_dir, "templates.json")

    def load_templates(self) -> TemplateStore:
        raw = load_json(self.templates_file, {"templates": {}})
        return TemplateStore.from_dict(raw)

    def save_templates(self, store: TemplateStore) -> None:
        save_json(self.templates_file, store.to_dict())

    def create_template(self, name: str, path: str, placeholders: list[str]) -> TemplateConfig:
        tid = str(uuid.uuid4())
        mappings: Dict[str, FieldMapping] = {p: FieldMapping(mode="manual") for p in placeholders}
        return TemplateConfig(
            template_id=tid,
            name=name,
            template_path=path,
            placeholders=placeholders,
            mappings=mappings,
        )
