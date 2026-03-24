# Live Classroom (교사 주도 라이브 퀴즈)

## 화면 구조
- `/teacher/builder`: 워크시트(문제집) 저작
- `/teacher/live`: 라이브 수업 진행(문항 1개씩 공개)
- `/student`: 학생 참여/응답 (현재 공개 문항만 표시)
- `/display`: 공개용 레이스 보드

## 라이브 진행 모델
1. 교사가 워크시트를 미리 작성
2. 라이브 세션 시작
3. `다음 문항 공개`로 문항 1개 공개
4. 학생은 현재 공개 문항만 응답
5. 시간 만료 시 자동 종료
6. 교사가 다음 문항을 수동 공개
7. 세션 종료 후 결과/CSV 확인

## 상태 모델
- session.status: `waiting | active | finished`
- session.questionState: `waiting | revealed | closed`
- session.currentQuestionOrder: 현재 공개 순번

## 실행
```bash
cd apps/live-classroom
copy .env.example .env
npm install
npm run seed
npm run dev
```

## 주요 API
- `POST /api/sessions`
- `POST /api/sessions/:id/start`
- `POST /api/sessions/:id/reveal-next`
- `POST /api/sessions/:id/close-current`
- `POST /api/sessions/:id/finish`
- `POST /api/sessions/:id/students/join`
- `GET /api/sessions/:id/live`
- `POST /api/questions`
- `PUT /api/questions/:id`
- `DELETE /api/questions/:id`
- `POST /api/questions/reorder`
- `POST /api/questions/respond`
- `GET /api/sessions/:id/export`

## 제거 사항
- Poll 기능 전체 제거
- 학생 전체 문제 선공개/일괄풀이 흐름 제거
