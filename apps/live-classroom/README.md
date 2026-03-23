# Live Classroom (교수-학습 실시간 웹앱)

React + TypeScript + Vite + Node.js + Express + Socket.IO + SQLite(better-sqlite3) 기반 프로젝트입니다.

## 1) 폴더 구조

```txt
apps/live-classroom/
├─ client/src
│  ├─ api/
│  ├─ components/
│  ├─ pages/            # /teacher /student /display
│  ├─ styles/
│  └─ types/
├─ server/
│  ├─ src/
│  │  ├─ lib/           # 채점 로직/세션 유틸
│  │  ├─ routes/        # REST API
│  │  ├─ sockets/       # Socket.IO + 타이머 루프
│  │  ├─ db.ts          # SQLite 스키마 초기화
│  │  ├─ index.ts       # 서버 엔트리
│  │  └─ seed.ts        # 데모 데이터
│  ├─ data/app.db       # 영속 DB 파일
│  ├─ uploads/          # 문제 이미지 저장
│  └─ exports/          # CSV 백업 저장
├─ package.json
├─ .env.example
└─ README.md
```

## 2) DB 스키마

다음 테이블을 자동 생성합니다.
- sessions
- students
- questions
- responses
- polls
- poll_votes
- score_logs

questions / polls 선택지는 JSON 배열(`optionsJson`)로 저장합니다.

## 3) 실행 방법 (Windows 기준)

1. Node.js 20+ 설치
2. 터미널(PowerShell)에서:
   ```bash
   cd apps/live-classroom
   copy .env.example .env
   npm install
   npm run seed
   npm run dev
   ```
3. 접속:
   - 교사: `http://localhost:5173/teacher`
   - 학생: `http://localhost:5173/student`
   - 디스플레이: `http://localhost:5173/display`

### Windows 설치 오류(질문 주신 `better-sqlite3/node-gyp`) 해결

`npm install`에서 `better-sqlite3` 빌드 실패 + `Could not find any Visual Studio installation` 오류가 나면 아래 순서로 해결하세요.

1. **프로젝트 최신 코드 받기**  
   `better-sqlite3`를 Node 24 대응 버전으로 올렸습니다. 먼저 최신 커밋 기준으로 다시 설치하세요.

2. **클린 재설치**
   ```powershell
   rd /s /q node_modules
   del package-lock.json
   npm cache verify
   npm install
   ```

3. **그래도 실패하면 (prebuilt binary 미제공 시) C++ 빌드 도구 설치**
   - Visual Studio 2022 Build Tools 설치
   - 워크로드: **Desktop development with C++**
   - 설치 후 새 PowerShell에서:
   ```powershell
   npm install
   ```

4. **가장 안정적인 권장 버전: Node 22 LTS**
   - Node 24에서도 동작하도록 의존성은 올렸지만, 학교 PC 환경에 따라 Node 22 LTS가 더 안정적입니다.
   - nvm-windows 사용 시:
   ```powershell
   nvm install 22.15.0
   nvm use 22.15.0
   node -v
   npm install
   ```

## 4) 같은 와이파이에서 접속

1. 교사 PC IP 확인: `ipconfig`
2. 예: `192.168.0.25` 라면 학생 안내 URL:
   - `http://192.168.0.25:5173/student`
3. 교사 화면에서 QR 코드로 학생 입장을 안내합니다.

## 5) 핵심 기능

- 문제 상태: `idle -> active -> ended -> revealed`
- 투표 상태: `draft -> active -> ended`
- 서버 시간 기준 채점(반응속도/선착순)
- 중복 제출 방지(UNIQUE + 서버 검증)
- 마감 후 제출 차단
- 학생 재접속 복구(localStorage + existingStudentId)
- 점수 로그(`score_logs`)로 점수 산정 근거 추적
- 세션별 CSV 내보내기 + 파일 백업

## 6) API 요약

- `POST /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/sessions/code/:joinCode`
- `POST /api/sessions/:id/students/join`
- `GET /api/sessions/:id/leaderboard`
- `GET /api/sessions/:id/analysis`
- `GET /api/sessions/:id/export`
- `POST /api/questions`
- `POST /api/questions/:id/start`
- `POST /api/questions/:id/end`
- `POST /api/questions/:id/reveal`
- `POST /api/questions/:id/respond`
- `POST /api/polls`
- `POST /api/polls/:id/start`
- `POST /api/polls/:id/end`
- `POST /api/polls/:id/vote`
- `GET /api/polls/:id/results`

## 7) 향후 확장 포인트

- question `type` 확장(OX/주관식/텍스트)
- 문제은행 분리 테이블
- 학급/학기 단위 장기 성적 관리
- 교사 인증/권한 관리
- Redis 도입으로 멀티 서버 확장

## 8) 현재 버전 한계

- 인증/인가 미구현(학교 내부망 전제)
- 세션 joinCode 기반 조회는 있지만 teacher 조회 UI는 session ID 기반
- 디스플레이 페이지가 수동 sessionId 입력 방식
- 고급 통계(문항 난이도 등) 미구현
