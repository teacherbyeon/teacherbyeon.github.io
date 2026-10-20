# 오늘의 시간표·급식 — NAS 연동 규격 v1

공개 주소: https://teacherbyeon.github.io/apps/classroom-board/

## 현재 구조

홈페이지는 정적 HTML 안의 도구 목록을 검색·태그 필터로 그립니다. 이 앱은 독립적인 HTML/CSS/JavaScript 모듈이며 별도 빌드나 라이브러리가 필요 없습니다. 페이지는 같은 경로의 `data/board.json`만 읽습니다. NAS, 컴시간, 나이스 API에 학교 브라우저가 직접 접속하지 않습니다.

현재 JSON은 **2026-10-19~2026-10-23의 가상 예시**이며 3학년 3반과 4반 전환을 체험할 수 있습니다. 시계·오늘 날짜는 실제 한국 시간입니다. 다른 날짜에서 열면 날짜 선택으로 예시 주간을 볼 수 있습니다. 예시 날짜를 실제 오늘로 바꾸거나 실제 시간표처럼 표시하지 않습니다.

## NAS가 생성할 파일

- 저장소 상대 경로: `apps/classroom-board/data/board.json`
- UTF-8, 유효한 JSON 객체 하나. `schemaVersion`은 숫자 `1`.
- 날짜: `YYYY-MM-DD`, 날짜/시각: `2026-10-20T08:00:00+09:00`처럼 시간대 필수. `timezone`은 `Asia/Seoul`.
- 실제 수집 자료 연결 시 `isSample`을 `false`로 변경합니다.
- 완성된 파일 전체를 한 커밋으로 교체합니다. 인증 정보·NAS 주소·학생 정보는 넣지 않습니다. 이름과 메뉴 등 공개 가능한 자료만 포함합니다. 저장소 인증 토큰은 NAS에서 관리하며 JSON이나 프론트엔드에 넣지 않습니다.

### 최상위 필드

| 필드 | 타입 / 내용 |
| --- | --- |
| schemaVersion | 정수 1 |
| isSample | boolean, 예시 자료이면 true |
| timezone | 문자열 Asia/Seoul |
| generatedAt | JSON 생성 시각, ISO 8601 |
| school.name | 학교 표시 이름 |
| defaults.grade / defaults.classNumber | 기본 학년·반, 양의 정수. 해당 학급 자료가 있어야 함 |
| staleAfterMinutes.timetable / .meals | 자료별 경고 기준(분), 양수. 예시: 180 / 1440 |
| timetable.updatedAt | 시간표를 마지막으로 **정상 수집한** 시각 |
| timetable.validFrom / .validTo | 포함하는 시간표 시작·종료 날짜 |
| timetable.classes | 학급 목록 |
| meals.updatedAt | 급식을 마지막으로 **정상 수집한** 시각 |
| meals.days | 날짜별 중식 목록, 학교 공통 |

### 시간표 학급/날짜/교시

`classes[]`는 `{ "grade": 3, "classNumber": 3, "days": [...] }`입니다. 학년과 반 조합은 중복되지 않아야 합니다. 학년·반 선택란은 이 목록에서 자동으로 구성됩니다.

`days[]`는 `{ "date": "2026-10-20", "status": "scheduled", "lessons": [...] }`입니다. 선택적 문자열 `note`로 학사 안내를 표시할 수 있습니다.

교시 예시:

```json
{
  "period": 2,
  "subject": "수학",
  "teacher": "담당교사",
  "start": "09:45",
  "end": "10:30",
  "changed": true,
  "original": { "subject": "영어", "teacher": "원래 담당교사" },
  "note": "수업 교환"
}
```

- `period`: 1~20 정수. 한 날짜 안에서 중복 금지. `subject`, `teacher`: 일반 문자열. 교사 정보가 없으면 빈 문자열.
- `start`, `end`: 선택적 `HH:mm` 문자열. 학교 실제 시정표를 NAS에서 넣습니다.
- `changed`: 필수 boolean. 컴시간에서 확인한 변경 사항을 전달합니다. `true`일 때 `original.subject`, `original.teacher` 필수. 과목이나 교사가 변경되었음을 색상과 텍스트로 표시합니다.
- `note`: 선택적 일반 문자열. HTML은 넣지 않습니다.
- 휴업일: `status: "no-school"`, `lessons: []`, `note: "학교 재량휴업일"`.
- 조회 실패·미수집 날짜는 `days`에서 생략합니다. ‘수업 없음’으로 위장하지 않습니다. 누락 교시는 ‘—’, 누락 날짜는 ‘자료 없음’으로 표시합니다.

### 급식 날짜

```json
{
  "date": "2026-10-20",
  "status": "available",
  "menu": ["잡곡밥", "미역국", "두부조림", "배추김치"],
  "note": "알레르기 정보는 학교 급식 안내를 확인하세요."
}
```

- `menu`: 음식 하나당 문자열 하나. 나이스의 `<br/>`는 NAS에서 배열로 분리하고 HTML 태그는 제거합니다. 알레르기 번호를 표시하려면 메뉴 문자열에 함께 넣습니다. 프론트엔드는 문자열을 HTML로 해석하지 않습니다.
- 중식 미운영이 확인된 날: `status: "no-meal"`, `menu: []`, 선택적 `note`.
- 조회 실패·미수집 날짜는 목록에서 생략합니다. 급식 없음과 자료 없음을 구분합니다.
- 날짜는 목록 안에서 중복 금지. 시간표는 월~금 및 필요한 다음 주까지 포함하는 것을 권장합니다. 급식은 월 단위로 넣어도 됩니다.

## 갱신 및 오류 처리

브라우저가 처음 열릴 때, 5분 간격, 탭을 다시 볼 때 JSON을 `cache: no-store`로 조회합니다. 한국 날짜가 바뀌면 오늘 화면도 넘어갑니다. 네트워크·규격 오류가 나면 경고하고 이미 읽은 화면은 남깁니다. 없는 날짜에 다른 날 수업을 대신 표시하지 않습니다.

오래됨 판정은 JSON 생성 시각이 아닌 각 자료의 `updatedAt` 기준입니다. NAS 수집이 실패했을 때 해당 자료의 `updatedAt`은 이전 정상 수집 시각으로 유지해야 합니다. 페이지 전체에 공개되므로 담당교사 공개 범위는 학교에서 결정합니다.

## 확인

`node work/classroom-board/test-core.mjs`로 날짜·검증·경고 동작을, `node work/classroom-board/test-board.mjs`로 화면 렌더링·학급 전환·통신 실패 처리를 확인합니다. 웹 서버로 실행해야 모듈과 JSON을 불러올 수 있습니다 (`file://`로 열지 않음). GitHub Pages에는 기존 방식으로 정적 파일을 게시합니다.

