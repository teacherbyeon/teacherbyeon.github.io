from __future__ import annotations

import os
import shutil
from typing import Dict, List, Optional


class HwpAutomationError(RuntimeError):
    pass


class HwpService:
    def __init__(self) -> None:
        self.win32 = None
        self.pythoncom = None

    def _load_com(self):
        if self.win32 is None:
            try:
                import win32com.client  # type: ignore
                import pythoncom  # type: ignore

                self.win32 = win32com.client
                self.pythoncom = pythoncom
            except ImportError as exc:
                raise HwpAutomationError(
                    "pywin32가 설치되지 않았습니다. `pip install pywin32` 후 다시 시도하세요."
                ) from exc

    def _open_hwp(self, visible: bool = False):
        self._load_com()
        assert self.pythoncom is not None
        assert self.win32 is not None
        self.pythoncom.CoInitialize()
        try:
            hwp = self.win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
        except Exception as exc:
            self.pythoncom.CoUninitialize()
            raise HwpAutomationError(
                "한글(HWP) COM 객체를 생성하지 못했습니다. 한글 설치 상태를 확인하세요."
            ) from exc
        try:
            hwp.XHwpWindows.Item(0).Visible = visible
        except Exception:
            pass
        return hwp

    def _close_hwp(self, hwp):
        try:
            hwp.Quit()
        finally:
            if self.pythoncom:
                self.pythoncom.CoUninitialize()

    def extract_text(self, file_path: str) -> str:
        if not os.path.exists(file_path):
            raise HwpAutomationError(f"템플릿 파일을 찾을 수 없습니다: {file_path}")

        hwp = self._open_hwp(visible=False)
        try:
            ok = hwp.Open(file_path)
            if not ok:
                raise HwpAutomationError("한글 문서를 열지 못했습니다.")

            hwp.Run("MoveDocBegin")
            hwp.InitScan()
            texts = []
            while True:
                state, text = hwp.GetText()
                if text:
                    texts.append(text)
                if state <= 1:
                    break
            hwp.ReleaseScan()
            return "".join(texts)
        except HwpAutomationError:
            raise
        except Exception as exc:
            raise HwpAutomationError(f"문서 내용 추출 중 오류가 발생했습니다: {exc}") from exc
        finally:
            self._close_hwp(hwp)

    def extract_placeholders(self, file_path: str, parser) -> List[str]:
        text = self.extract_text(file_path)
        return parser.parse_placeholders(text)

    def create_filled_hwp(
        self,
        template_path: str,
        output_path: str,
        replace_map: Dict[str, str],
        make_pdf: bool = False,
        pdf_path: Optional[str] = None,
    ) -> str:
        if not os.path.exists(template_path):
            raise HwpAutomationError(f"템플릿 파일을 찾을 수 없습니다: {template_path}")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        shutil.copy2(template_path, output_path)

        hwp = self._open_hwp(visible=False)
        try:
            if not hwp.Open(output_path):
                raise HwpAutomationError("복사된 문서를 열지 못했습니다.")

            for key, value in replace_map.items():
                self._replace_all(hwp, "{{%s}}" % key, str(value))

            hwp.Save()

            if make_pdf:
                if not pdf_path:
                    pdf_path = os.path.splitext(output_path)[0] + ".pdf"
                hwp.SaveAs(pdf_path, "PDF")
            return output_path
        except HwpAutomationError:
            raise
        except Exception as exc:
            raise HwpAutomationError(f"문서 생성 중 오류가 발생했습니다: {exc}") from exc
        finally:
            self._close_hwp(hwp)

    def _replace_all(self, hwp, source: str, target: str) -> None:
        hwp.HAction.GetDefault("AllReplace", hwp.HParameterSet.HFindReplace.HSet)
        hwp.HParameterSet.HFindReplace.FindString = source
        hwp.HParameterSet.HFindReplace.ReplaceString = target
        hwp.HParameterSet.HFindReplace.IgnoreMessage = 1
        hwp.HParameterSet.HFindReplace.FindType = 1
        hwp.HAction.Execute("AllReplace", hwp.HParameterSet.HFindReplace.HSet)
