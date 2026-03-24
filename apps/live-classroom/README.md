# Live Classroom - 문제집 기반 수업 앱

이 버전은 **실시간 단일 문제 진행형**이 아니라, **세션 단위 문제집 풀이형**입니다.

## 핵심 흐름

### 교사
1. 세션 생성
2. 문제집(여러 문항) 편집
3. 세션 시작(`waiting -> active`)
4. 제출 진행 모니터링
5. 세션 마감(`closed`)
6. 결과/CSV 확인

### 학생
1. 입장 코드로 참여
2. 전체 문제집 풀이(문항별 답 저장)
3. 최종 제출
4. 제출 완료 상태

## 폴더 구조

```txt
apps/live-classroom/
├─ client/src/pages/
│  ├─ TeacherPage.tsx
│  ├─ StudentPage.tsx
│  └─ DisplayPage.tsx
├─ server/src/routes/
│  ├─ sessions.ts
│  └─ questions.ts
├─ server/src/sockets/socket.ts
├─ server/src/db.ts
└─ server/src/seed.ts
```

## 데이터 모델(요약)
- sessions: 상태(`waiting|active|closed`) 중심
- questions: 세션 문제집 문항
- responses: 학생의 문항별 응답(수정 저장 가능)
- submissions: 학생 최종 제출 여부
- score_logs: 문항별 점수 기록

## 실행

```bash
cd apps/live-classroom
copy .env.example .env
npm install
npm run seed
npm run dev
```

- 교사: http://localhost:5173/teacher
- 학생: http://localhost:5173/student
- 현황: http://localhost:5173/display

## 주요 API
- `POST /api/sessions`
- `POST /api/sessions/:id/start`
- `POST /api/sessions/:id/close`
- `POST /api/sessions/:id/students/join`
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/export`
- `POST /api/questions`
- `PUT /api/questions/:id`
- `DELETE /api/questions/:id`
- `POST /api/questions/reorder`
- `POST /api/questions/answer`
- `POST /api/sessions/:id/submit`

## 참고
- Poll 기능은 본 제품 방향에서 제거되었습니다.
- 문제 단위 start/reveal/end 라이브 오케스트레이션도 제거되었습니다.
