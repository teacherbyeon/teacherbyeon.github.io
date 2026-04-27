# 🤠 카우보이 에너지 대결

React + TypeScript + Vite + Node.js + Express + Socket.IO 기반 실시간 2인용 게임입니다.

## 실행 방법

1. 의존성 설치

```bash
npm install
```

2. 개발 모드 실행

```bash
npm run dev
```

3. 개발 모드 접속
- 노트북: http://localhost:5173
- 폰: http://노트북IP:5173

4. 실전 모드

```bash
npm run build
npm run start
```

- 접속: http://노트북IP:3000

5. 기본 PIN
- `1234`

6. 폰 접속이 안 될 때
- 노트북과 폰이 같은 Wi-Fi인지 확인
- Windows 방화벽에서 Node.js 허용
- 공용 Wi-Fi는 기기 간 통신을 막을 수 있음

## 주요 기능
- 진행자/참가자 역할 분리
- 참가자 2명 제한 및 재접속 복구(localStorage)
- 진행자 PIN 로그인(sessionStorage)
- 비밀 선택(상대 choice 비공개), 선택 완료 여부만 공유
- 서버 자동 턴 진행(3,2,1,선택! 카운트다운 → 선택 → 즉시 판정 → 2초 결과 표시 후 자동 다음 턴)
- 진행자 일시정지/계속하기/새 경기 제어
- 승리 점수(1/2/3/5) 설정, 표현 모드(아이용/카우보이용) 설정
- 누적 기록 표시
- Express 정적 서빙 + Socket.IO 단일 서버 운영

## 이벤트 구조
- 진행자: `host:login`, `host:setSettings`, `host:start`, `host:newMatch`, `host:pause`, `host:resume`, `host:clearPlayers`
- 참가자: `player:join`, `player:choose`
- 서버→클라이언트: `host:state`, `player:state`, `host:error`, `player:error`, `server:hello`
