from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any

from models.student_model import Student
from models.template_model import FieldMapping
from utils.date_utils import today, days_between


class MappingError(RuntimeError):
    pass


@dataclass
class EvalContext:
    student: Student | None
    manual_values: Dict[str, str]


class MappingService:
    STUDENT_KEYS = {
        "학년": "grade",
        "반": "class_no",
        "번호": "number",
        "이름": "name",
        "보호자성명": "guardian_name",
        "연락처": "contact",
    }

    def resolve_all(
        self,
        mappings: Dict[str, FieldMapping],
        manual_values: Dict[str, str],
        student: Student | None,
    ) -> Dict[str, str]:
        context = EvalContext(student=student, manual_values=manual_values)
        values: Dict[str, str] = {}
        for field, mapping in mappings.items():
            values[field] = self.resolve_field(field, mapping, context, values)

        for field, value in manual_values.items():
            values.setdefault(field, value)
        return values

    def resolve_field(
        self,
        field: str,
        mapping: FieldMapping,
        context: EvalContext,
        resolved: Dict[str, str],
    ) -> str:
        mode = mapping.mode
        if mode == "manual":
            return context.manual_values.get(field, "")
        if mode == "fixed":
            return mapping.value
        if mode == "student":
            return self._student_value(context.student, mapping.student_key or field)
        if mode == "today":
            return today(mapping.date_format or "%Y-%m-%d")
        if mode == "date_range_days":
            start = context.manual_values.get("시작일", "")
            end = context.manual_values.get("끝일", "")
            if not start or not end:
                return ""
            return days_between(start, end, mapping.date_format or "%Y-%m-%d")
        if mode == "expression":
            return self._eval_expression(mapping.expression, context, resolved)
        if mode == "snippet":
            return context.manual_values.get(field, mapping.value)
        return context.manual_values.get(field, "")

    def _student_value(self, student: Student | None, key: str) -> str:
        if not student:
            return ""
        attr = self.STUDENT_KEYS.get(key, key)
        if hasattr(student, attr):
            return str(getattr(student, attr) or "")
        return str((student.extra or {}).get(key, ""))

    def _eval_expression(
        self,
        expression: str,
        context: EvalContext,
        resolved: Dict[str, str],
    ) -> str:
        safe_vars: Dict[str, Any] = {
            "manual": dict(context.manual_values),
            "resolved": dict(resolved),
            "student": context.student.to_dict() if context.student else {},
            "today": today,
            "int": int,
            "str": str,
            "len": len,
        }
        try:
            value = eval(expression, {"__builtins__": {}}, safe_vars)
            return str(value)
        except Exception as exc:
            raise MappingError(f"계산식 평가 실패({expression}): {exc}") from exc
