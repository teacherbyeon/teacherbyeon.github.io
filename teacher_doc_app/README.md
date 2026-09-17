# 교사용 문서 작성 프로그램 (HWP 템플릿 자동입력)

학교에서 쓰는 기존 `.hwp` 서식을 그대로 템플릿으로 사용하고, `{{항목명}}` 플레이스홀더를 자동으로 추출하여 값만 넣은 새 한글 문서를 생성하는 Windows용 Python 데스크톱 앱입니다.

## 1) 핵심 기능

- HWP 템플릿 등록 (`.hwp` 선택 + 템플릿 이름 저장)
- `{{...}}` 플레이스홀더 자동 추출 (문서 등장 순서 유지, 중복 제거)
- 플레이스홀더 기반 입력 UI 자동 생성
- 필드별 입력 방식 매핑
  - 수동 입력
  - 고정값
  - 학생정보 자동입력
  - 오늘 날짜
  - 시작일~끝일 일수 계산
  - 계산식(expression)
  - 최근 문구(기본 동작)
- 학생 명단 업로드 (`xlsx/csv`) + 검색/선택
- 원본 템플릿 손상 없이 복사본 생성 후 치환
- 파일명 규칙 커스터마이징
- PDF 저장 옵션
- 템플릿별 설정(JSON) 저장/복원

## 2) 폴더 구조

```text
teacher_doc_app/
  main.py
  requirements.txt
  README.md
  ui/
    main_window.py
    template_panel.py
    student_panel.py
    field_editor.py
  services/
    hwp_service.py
    template_parser.py
    student_service.py
    mapping_service.py
    export_service.py
    config_service.py
  models/
    template_model.py
    student_model.py
    document_model.py
  utils/
    date_utils.py
    file_utils.py
    text_utils.py
  data/
    templates.json
    students.json
    snippets.json
```

## 3) 실행 환경 (Windows 전제)

- OS: Windows 10/11
- Python: 3.10 이상 권장
- 한글(HWP) 설치 필요 (COM 자동화 사용)
- pywin32 필요

## 4) 설치 및 실행

```bash
cd teacher_doc_app
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

## 5) 사용 흐름

1. **템플릿 등록**: HWP 파일 선택
2. 자동 추출된 플레이스홀더 확인
3. 필드별 매핑 모드 설정
4. 학생 명단(`xlsx/csv`) 불러오기
5. 학생 선택 후 자동 값 확인/수정
6. 저장 폴더 선택 후 **문서 생성**
7. 필요시 PDF 동시 생성

## 6) 매핑 모드 예시

- `{{학년}}` -> mode=`student`, student_key=`학년`
- `{{반}}` -> mode=`student`, student_key=`반`
- `{{번호}}` -> mode=`student`, student_key=`번호`
- `{{이름}}` -> mode=`student`, student_key=`이름`
- `{{작성일}}` -> mode=`today`, date_format=`%Y-%m-%d`
- `{{일수}}` -> mode=`date_range_days` (`시작일`, `끝일` 기준)
- `{{광려중학교장귀하}}` -> mode=`fixed`, value=`광려중학교장 귀하`

### 계산식 예시(expression)

- `int(resolved.get('일수','0')) + 1`
- `f"{manual.get('시작일','')}~{manual.get('끝일','')}"`

## 7) 예외 처리

다음 상황에서 사용자 메시지 박스로 안내합니다.

- pywin32 미설치
- 한글(HWP) 미설치/COM 객체 생성 실패
- 템플릿 열기 실패
- 플레이스홀더 미검출
- 학생 컬럼 불일치 (특히 이름 컬럼 누락)
- 저장 실패 / PDF 변환 실패

## 8) 템플릿 설정 저장

`data/templates.json` 에 템플릿별로 저장됩니다.

- 플레이스홀더 목록
- 필드 매핑
- 파일명 규칙

앱 재실행 후 같은 템플릿을 선택하면 설정이 복원됩니다.

## 9) PyInstaller로 EXE 배포

```bash
cd teacher_doc_app
pip install pyinstaller
pyinstaller --noconfirm --onefile --windowed --name TeacherHwpAuto main.py
```

생성물: `dist/TeacherHwpAuto.exe`

> 배포 대상 PC에도 **한글 프로그램 설치**가 필요합니다(COM 자동화 의존).

## 10) HWP 자동화 실패 시 대체 전략

현장 PC 정책/버전 문제로 COM 자동화가 실패할 수 있습니다. 이 경우 단계적 우회:

1. 한글 버전/보안모듈/권한(관리자 실행) 점검
2. 템플릿 본문 텍스트를 한글에서 TXT로 내보내 `{{}}` 추출 보조 단계 제공
3. 치환은 한글 매크로 또는 수동 치환 체크리스트 출력 기능과 결합

현재 코드는 **COM 자동화 우선** 구조이며, 실패 시 오류 메시지를 통해 원인을 안내하도록 구현되어 있습니다.
