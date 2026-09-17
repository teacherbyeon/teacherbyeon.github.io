from __future__ import annotations

import tkinter as tk
from tkinter import ttk


class TemplatePanel(ttk.LabelFrame):
    def __init__(self, master, on_add, on_select, **kwargs):
        super().__init__(master, text="템플릿", **kwargs)
        self.on_add = on_add
        self.on_select = on_select

        top = ttk.Frame(self)
        top.pack(fill="x", padx=6, pady=6)
        ttk.Button(top, text="템플릿 등록", command=self.on_add).pack(side="left")

        self.listbox = tk.Listbox(self, height=8)
        self.listbox.pack(fill="both", expand=True, padx=6, pady=(0, 6))
        self.listbox.bind("<<ListboxSelect>>", self._handle_select)

        self.template_ids: list[str] = []

    def set_templates(self, items: list[tuple[str, str]]) -> None:
        self.template_ids = [i[0] for i in items]
        self.listbox.delete(0, tk.END)
        for _, label in items:
            self.listbox.insert(tk.END, label)

    def _handle_select(self, _event):
        idx = self.listbox.curselection()
        if not idx:
            return
        template_id = self.template_ids[idx[0]]
        self.on_select(template_id)
