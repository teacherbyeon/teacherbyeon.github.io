from __future__ import annotations

import os
import tkinter as tk
from tkinter import ttk, messagebox

from ui.main_window import MainWindow


def main():
    root = tk.Tk()
    root.title("교사용 문서 작성 프로그램 (HWP 템플릿 자동입력)")
    root.geometry("1400x860")

    try:
        style = ttk.Style(root)
        if "vista" in style.theme_names():
            style.theme_use("vista")
    except Exception:
        pass

    app_root = os.path.dirname(os.path.abspath(__file__))
    MainWindow(root, app_root)
    root.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        messagebox.showerror("치명적 오류", str(exc))
