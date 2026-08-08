from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable, Dict

from models.template_model import FieldMapping


MODES = [
    ("manual", "수동 입력"),
    ("fixed", "고정값"),
    ("student", "학생정보"),
    ("today", "오늘 날짜"),
    ("date_range_days", "시작일~끝일 일수"),
    ("expression", "계산식"),
    ("snippet", "최근 문구"),
]


class FieldRow(ttk.Frame):
    def __init__(self, master, name: str, mapping: FieldMapping, value: str, on_change: Callable):
        super().__init__(master)
        self.name = name
        self.on_change = on_change

        ttk.Label(self, text=name, width=16).grid(row=0, column=0, sticky="w")

        self.mode_var = tk.StringVar(value=mapping.mode)
        self.mode = ttk.Combobox(self, width=14, state="readonly", textvariable=self.mode_var)
        self.mode["values"] = [m[0] for m in MODES]
        self.mode.grid(row=0, column=1, padx=4)
        self.mode.bind("<<ComboboxSelected>>", lambda _e: self._emit())

        self.value_var = tk.StringVar(value=value or mapping.value)
        self.value_entry = ttk.Entry(self, textvariable=self.value_var, width=24)
        self.value_entry.grid(row=0, column=2, padx=4)
        self.value_entry.bind("<KeyRelease>", lambda _e: self._emit())

        self.student_key_var = tk.StringVar(value=mapping.student_key)
        self.student_key_entry = ttk.Entry(self, textvariable=self.student_key_var, width=12)
        self.student_key_entry.grid(row=0, column=3, padx=4)
        self.student_key_entry.bind("<KeyRelease>", lambda _e: self._emit())

        self.expr_var = tk.StringVar(value=mapping.expression)
        self.expr_entry = ttk.Entry(self, textvariable=self.expr_var, width=22)
        self.expr_entry.grid(row=0, column=4, padx=4)
        self.expr_entry.bind("<KeyRelease>", lambda _e: self._emit())

    def get_mapping(self) -> FieldMapping:
        return FieldMapping(
            mode=self.mode_var.get(),
            value=self.value_var.get(),
            student_key=self.student_key_var.get(),
            expression=self.expr_var.get(),
        )

    def get_manual_value(self) -> str:
        return self.value_var.get()

    def _emit(self):
        self.on_change()


class FieldEditor(ttk.LabelFrame):
    def __init__(self, master, on_change: Callable, **kwargs):
        super().__init__(master, text="필드 매핑/입력", **kwargs)
        self.on_change = on_change

        header = ttk.Frame(self)
        header.pack(fill="x", padx=6, pady=(6, 2))
        for i, text in enumerate(["항목", "모드", "값", "학생키", "계산식"]):
            ttk.Label(header, text=text).grid(row=0, column=i, padx=4, sticky="w")

        self.canvas = tk.Canvas(self, height=320)
        self.scroll = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self.scroll.set)
        self.canvas.pack(side="left", fill="both", expand=True, padx=(6, 0), pady=6)
        self.scroll.pack(side="right", fill="y", padx=(0, 6), pady=6)

        self.inner = ttk.Frame(self.canvas)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.inner.bind("<Configure>", self._on_frame_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)

        self.rows: Dict[str, FieldRow] = {}

    def _on_frame_configure(self, _event):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, event):
        self.canvas.itemconfigure(self.canvas_window, width=event.width)

    def set_fields(self, placeholders: list[str], mappings: Dict[str, FieldMapping], values: Dict[str, str]):
        for child in self.inner.winfo_children():
            child.destroy()
        self.rows.clear()

        for i, ph in enumerate(placeholders):
            mapping = mappings.get(ph, FieldMapping())
            row = FieldRow(self.inner, ph, mapping, values.get(ph, ""), self.on_change)
            row.pack(fill="x", pady=2)
            self.rows[ph] = row

    def get_mappings(self) -> Dict[str, FieldMapping]:
        return {k: row.get_mapping() for k, row in self.rows.items()}

    def get_manual_values(self) -> Dict[str, str]:
        return {k: row.get_manual_value() for k, row in self.rows.items()}
