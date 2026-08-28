from __future__ import annotations

import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
from typing import Dict, Optional

from models.student_model import Student
from models.template_model import TemplateConfig, TemplateStore, FieldMapping
from services.config_service import ConfigService
from services.export_service import ExportService
from services.hwp_service import HwpService, HwpAutomationError
from services.mapping_service import MappingService, MappingError
from services.student_service import StudentService, StudentDataError
from services.template_parser import TemplateParser
from ui.field_editor import FieldEditor
from ui.student_panel import StudentPanel
from ui.template_panel import TemplatePanel


class MainWindow(ttk.Frame):
    def __init__(self, master, app_root: str):
        super().__init__(master)
        self.pack(fill="both", expand=True)
        self.app_root = app_root
        self.data_dir = os.path.join(app_root, "data")

        self.config_service = ConfigService(self.data_dir)
        self.hwp_service = HwpService()
        self.template_parser = TemplateParser()
        self.student_service = StudentService()
        self.mapping_service = MappingService()
        self.export_service = ExportService()

        self.template_store: TemplateStore = self.config_service.load_templates()
        self.current_template: Optional[TemplateConfig] = None
        self.students: list[Student] = []
        self.selected_student: Optional[Student] = None

        self._build_ui()
        self.refresh_template_list()

    def _build_ui(self):
        root_pane = ttk.PanedWindow(self, orient="horizontal")
        root_pane.pack(fill="both", expand=True)

        left = ttk.Frame(root_pane)
        right = ttk.Frame(root_pane)
        root_pane.add(left, weight=1)
        root_pane.add(right, weight=2)

        self.template_panel = TemplatePanel(left, on_add=self.add_template, on_select=self.select_template)
        self.template_panel.pack(fill="x", padx=8, pady=8)

        self.student_panel = StudentPanel(left, on_load=self.load_students, on_pick=self.on_pick_student)
        self.student_panel.pack(fill="both", expand=True, padx=8, pady=(0, 8))

        self.field_editor = FieldEditor(right, on_change=self.on_field_change)
        self.field_editor.pack(fill="both", expand=True, padx=8, pady=8)

        bottom = ttk.Frame(right)
        bottom.pack(fill="x", padx=8, pady=(0, 8))

        ttk.Label(bottom, text="파일명 규칙").grid(row=0, column=0, sticky="w")
        self.filename_rule_var = tk.StringVar(value="{{template_name}}_{{today}}")
        ttk.Entry(bottom, textvariable=self.filename_rule_var, width=70).grid(row=0, column=1, padx=6, sticky="we")

        self.save_pdf_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(bottom, text="PDF도 생성", variable=self.save_pdf_var).grid(row=1, column=0, sticky="w")

        ttk.Button(bottom, text="설정 저장", command=self.save_current_template).grid(row=1, column=1, sticky="w")
        ttk.Button(bottom, text="문서 생성", command=self.generate_document).grid(row=1, column=1, sticky="e")

        bottom.columnconfigure(1, weight=1)

        self.status_var = tk.StringVar(value="준비됨")
        ttk.Label(self, textvariable=self.status_var, relief="sunken").pack(fill="x", side="bottom")

    def set_status(self, text: str):
        self.status_var.set(text)

    def refresh_template_list(self):
        items = [(t.template_id, f"{t.name} ({os.path.basename(t.template_path)})") for t in self.template_store.templates.values()]
        self.template_panel.set_templates(items)

    def add_template(self):
        path = filedialog.askopenfilename(
            title="HWP 템플릿 선택",
            filetypes=[("HWP File", "*.hwp"), ("All Files", "*.*")],
        )
        if not path:
            return
        name = simpledialog.askstring("템플릿 이름", "템플릿 이름을 입력하세요:")
        if not name:
            return
        try:
            placeholders = self.hwp_service.extract_placeholders(path, self.template_parser)
            if not placeholders:
                messagebox.showwarning("안내", "{{ }} 플레이스홀더를 찾지 못했습니다. 템플릿을 확인하세요.")
            config = self.config_service.create_template(name, path, placeholders)
            self.template_store.templates[config.template_id] = config
            self.config_service.save_templates(self.template_store)
            self.refresh_template_list()
            self.select_template(config.template_id)
            self.set_status(f"템플릿 등록 완료: {name}")
        except HwpAutomationError as exc:
            messagebox.showerror("HWP 오류", str(exc))

    def select_template(self, template_id: str):
        config = self.template_store.get(template_id)
        if not config:
            return
        self.current_template = config
        self.filename_rule_var.set(config.filename_rule)
        self.field_editor.set_fields(config.placeholders, config.mappings, {})
        self.set_status(f"선택됨: {config.name}")

    def load_students(self):
        path = filedialog.askopenfilename(
            title="학생 명단 선택",
            filetypes=[("Spreadsheet", "*.xlsx *.xls *.csv"), ("All Files", "*.*")],
        )
        if not path:
            return
        try:
            students, _cols = self.student_service.load_file(path)
            self.students = students
            self.student_panel.set_students(students)
            self.set_status(f"학생 {len(students)}명 로드")
        except StudentDataError as exc:
            messagebox.showerror("학생 데이터 오류", str(exc))
        except Exception as exc:
            messagebox.showerror("오류", f"학생 명단 로드 실패: {exc}")

    def on_pick_student(self, student: Student | None):
        self.selected_student = student
        self.on_field_change()

    def on_field_change(self):
        if not self.current_template:
            return
        try:
            mappings = self.field_editor.get_mappings()
            manual = self.field_editor.get_manual_values()
            resolved = self.mapping_service.resolve_all(mappings, manual, self.selected_student)
            self.field_editor.set_fields(self.current_template.placeholders, mappings, resolved)
        except MappingError as exc:
            self.set_status(str(exc))

    def save_current_template(self):
        if not self.current_template:
            messagebox.showwarning("안내", "먼저 템플릿을 선택하세요.")
            return
        self.current_template.mappings = self.field_editor.get_mappings()
        self.current_template.filename_rule = self.filename_rule_var.get().strip() or "{{template_name}}_{{today}}"
        self.config_service.save_templates(self.template_store)
        self.set_status("템플릿 설정 저장 완료")

    def generate_document(self):
        if not self.current_template:
            messagebox.showwarning("안내", "템플릿을 먼저 선택하세요.")
            return

        output_dir = filedialog.askdirectory(title="저장 폴더 선택")
        if not output_dir:
            return

        mappings = self.field_editor.get_mappings()
        manual = self.field_editor.get_manual_values()
        try:
            values = self.mapping_service.resolve_all(mappings, manual, self.selected_student)
            filename = self.export_service.build_filename(
                self.filename_rule_var.get().strip() or self.current_template.filename_rule,
                values,
                self.current_template.name,
            )
            output_path = self.export_service.build_output_path(output_dir, filename)
            pdf_path = os.path.splitext(output_path)[0] + ".pdf"
            self.hwp_service.create_filled_hwp(
                self.current_template.template_path,
                output_path,
                values,
                make_pdf=self.save_pdf_var.get(),
                pdf_path=pdf_path,
            )
            messagebox.showinfo("완료", f"문서 생성 완료:\n{output_path}")
            self.set_status("문서 생성 완료")
        except (HwpAutomationError, MappingError) as exc:
            messagebox.showerror("생성 오류", str(exc))
        except Exception as exc:
            messagebox.showerror("생성 오류", f"문서 생성 실패: {exc}")
