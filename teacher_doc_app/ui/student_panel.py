from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable, List

from models.student_model import Student


class StudentPanel(ttk.LabelFrame):
    def __init__(self, master, on_load: Callable, on_pick: Callable[[Student | None], None], **kwargs):
        super().__init__(master, text="학생", **kwargs)
        self.on_load = on_load
        self.on_pick = on_pick
        self.students: List[Student] = []
        self.filtered: List[Student] = []

        ctrl = ttk.Frame(self)
        ctrl.pack(fill="x", padx=6, pady=6)
        ttk.Button(ctrl, text="명단 불러오기", command=self.on_load).pack(side="left")

        search = ttk.Frame(self)
        search.pack(fill="x", padx=6)
        self.grade_var = tk.StringVar()
        self.class_var = tk.StringVar()
        self.number_var = tk.StringVar()
        self.name_var = tk.StringVar()
        for lbl, var in (("학년", self.grade_var), ("반", self.class_var), ("번호", self.number_var), ("이름", self.name_var)):
            ttk.Label(search, text=lbl).pack(side="left")
            ent = ttk.Entry(search, width=5 if lbl != "이름" else 10, textvariable=var)
            ent.pack(side="left", padx=(2, 6))
            ent.bind("<KeyRelease>", lambda _e: self.apply_filter())

        self.tree = ttk.Treeview(self, columns=("g", "c", "n", "name"), show="headings", height=8)
        for key, title, w in (("g", "학년", 55), ("c", "반", 55), ("n", "번호", 60), ("name", "이름", 120)):
            self.tree.heading(key, text=title)
            self.tree.column(key, width=w, anchor="center")
        self.tree.pack(fill="both", expand=True, padx=6, pady=6)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

    def set_students(self, students: List[Student]):
        self.students = students
        self.apply_filter()

    def apply_filter(self):
        grade = self.grade_var.get().strip()
        class_no = self.class_var.get().strip()
        number = self.number_var.get().strip()
        name = self.name_var.get().strip().lower()

        self.filtered = [
            s for s in self.students
            if (not grade or s.grade == grade)
            and (not class_no or s.class_no == class_no)
            and (not number or number in s.number)
            and (not name or name in s.name.lower())
        ]

        self.tree.delete(*self.tree.get_children())
        for idx, s in enumerate(self.filtered):
            self.tree.insert("", "end", iid=str(idx), values=(s.grade, s.class_no, s.number, s.name))

    def _on_select(self, _event):
        items = self.tree.selection()
        if not items:
            self.on_pick(None)
            return
        selected = self.filtered[int(items[0])]
        self.on_pick(selected)
