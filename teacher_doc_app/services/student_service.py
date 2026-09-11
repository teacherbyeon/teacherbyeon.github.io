from __future__ import annotations

import os
from typing import Dict, List, Tuple

import pandas as pd

from models.student_model import Student


class StudentDataError(RuntimeError):
    pass


class StudentService:
    COLUMN_ALIASES = {
        "grade": ["학년", "grade"],
        "class_no": ["반", "class", "class_no"],
        "number": ["번호", "num", "number"],
        "name": ["이름", "성명", "name"],
        "guardian_name": ["보호자성명", "보호자", "guardian", "guardian_name"],
        "contact": ["연락처", "전화", "contact", "phone"],
    }

    def load_file(self, path: str, mapping: Dict[str, str] | None = None) -> Tuple[List[Student], List[str]]:
        if not os.path.exists(path):
            raise StudentDataError(f"학생 파일을 찾을 수 없습니다: {path}")

        ext = os.path.splitext(path)[1].lower()
        if ext == ".csv":
            df = pd.read_csv(path)
        elif ext in (".xlsx", ".xlsm", ".xls"):
            df = pd.read_excel(path)
        else:
            raise StudentDataError("csv 또는 xlsx 파일만 지원합니다.")

        cols = [str(c).strip() for c in df.columns]
        df.columns = cols

        resolved = self._resolve_columns(cols, mapping or {})
        students: List[Student] = []
        for _, row in df.iterrows():
            payload = {k: self._safe_str(row.get(col, "")) for k, col in resolved.items() if col}
            extra = {c: self._safe_str(row.get(c, "")) for c in cols if c not in resolved.values()}
            students.append(Student(extra=extra, **payload))
        return students, cols

    def _resolve_columns(self, columns: List[str], user_mapping: Dict[str, str]) -> Dict[str, str]:
        resolved: Dict[str, str] = {}
        for key, aliases in self.COLUMN_ALIASES.items():
            if key in user_mapping and user_mapping[key] in columns:
                resolved[key] = user_mapping[key]
                continue
            found = ""
            for c in columns:
                cl = c.lower()
                if c in aliases or cl in [a.lower() for a in aliases]:
                    found = c
                    break
            resolved[key] = found

        if not resolved.get("name"):
            raise StudentDataError("학생 이름 컬럼을 찾지 못했습니다. 컬럼 매핑을 확인하세요.")
        return resolved

    @staticmethod
    def _safe_str(v) -> str:
        if pd.isna(v):
            return ""
        return str(v).strip()

    def filter_students(
        self,
        students: List[Student],
        grade: str = "",
        class_no: str = "",
        number: str = "",
        name: str = "",
    ) -> List[Student]:
        def include(s: Student) -> bool:
            return (
                (not grade or s.grade == grade)
                and (not class_no or s.class_no == class_no)
                and (not number or number in s.number)
                and (not name or name.lower() in s.name.lower())
            )

        return [s for s in students if include(s)]
