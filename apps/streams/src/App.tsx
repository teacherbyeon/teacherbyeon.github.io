import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { GameSettings, StudentInit, TeacherStateInit, TeacherStudentRow, TileValue } from './types';

const socketUrl = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3000`;
const socket = io(socketUrl, { transports: ['websocket'], reconnection: true });

type RolePage = 'select' | 'teacher-login' | 'teacher-setup' | 'teacher-game' | 'student-join' | 'student-game';

const fixedDeckConfig: Record<string, number> = (() => {
  const cfg: Record<string, number> = {};
  for (let i = 1; i <= 10; i += 1) cfg[String(i)] = 1;
  for (let i = 11; i <= 19; i += 1) cfg[String(i)] = 2;
  for (let i = 20; i <= 30; i += 1) cfg[String(i)] = 1;
  cfg.J = 1;
  return cfg;
})();

const initialSettings: GameSettings = {
  boardSize: 20,
  includeJoker: true,
  animationOn: true,
  soundOn: false,
  deckConfig: fixedDeckConfig
};

const tileText = (value: TileValue | null) => (value === null ? '' : value === 'J' ? '🃏' : String(value));

const isNumericHost = /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);
const defaultJoinUrl = localStorage.getItem('streams_join_url') ?? (isNumericHost ? window.location.origin : '');

export function App() {
  const [page, setPage] = useState<RolePage>('select');
  const [error, setError] = useState('');

  const [teacherPin, setTeacherPin] = useState('');
  const [settings, setSettings] = useState<GameSettings>(initialSettings);
  const [teacherState, setTeacherState] = useState<TeacherStateInit | null>(null);
  const [students, setStudents] = useState<TeacherStudentRow[]>([]);
  const [joinUrl, setJoinUrl] = useState(defaultJoinUrl);

  const [studentKey, setStudentKey] = useState(localStorage.getItem('streams_student_key') ?? '');
  const [nickname, setNickname] = useState(localStorage.getItem('streams_student_name') ?? '');
  const [myState, setMyState] = useState<StudentInit | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    socket.on('teacher:login:ok', () => {
      setPage('teacher-setup');
      setError('');
    });

    socket.on('teacher:error', ({ message }) => setError(message));
    socket.on('student:error', ({ message }) => {
      setError(message);
      setPlacing(false);
    });

    socket.on('teacherStateInit', (payload: TeacherStateInit) => {
      setTeacherState(payload);
      setStudents(payload.students);
      if (payload.game.settings) {
        setSettings((prev) => ({ ...prev, ...payload.game.settings, deckConfig: fixedDeckConfig }));
      }
      setPage(payload.game.inProgress ? 'teacher-game' : 'teacher-setup');
    });

    socket.on('studentInit', (payload: StudentInit) => {
      setMyState(payload);
      setPlacing(false);
      setPage('student-game');
    });

    socket.on('myBoardUpdated', ({ board, score, placed, round }: { board: Array<TileValue | null>; score: number; placed: boolean; round: number }) => {
      setMyState((prev) => (prev ? { ...prev, board, score, placed, round } : prev));
      setPlacing(false);
    });

    socket.on('studentPlaced', (payload: { studentKey: string; score: number; placed: boolean; lastSeenAt: number; nickname: string }) => {
      setStudents((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.studentKey === payload.studentKey);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            score: payload.score,
            placed: payload.placed,
            lastSeenAt: payload.lastSeenAt,
            nickname: payload.nickname
          };
        }
        return next.sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'ko'));
      });
    });

    socket.on('studentConnectionChanged', (payload: TeacherStudentRow) => {
      setStudents((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.studentKey === payload.studentKey);
        if (idx >= 0) next[idx] = { ...next[idx], ...payload };
        else next.push(payload);
        return next.sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'ko'));
      });
    });

    socket.on('numberDrawn', ({ round, totalRounds, currentNumber, remainingDraws }: { round: number; totalRounds: number; currentNumber: TileValue | null; remainingDraws: number }) => {
      setTeacherState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          game: {
            ...prev.game,
            inProgress: true,
            round,
            totalRounds,
            currentNumber,
            remainingDraws,
            drawHistory: currentNumber === null ? prev.game.drawHistory : [...prev.game.drawHistory, currentNumber]
          }
        };
      });

      setStudents((prev) => prev.map((s) => ({ ...s, placed: false })));
      setMyState((prev) => (prev ? { ...prev, round, totalRounds, currentNumber, placed: false } : prev));
      setPlacing(false);
    });

    socket.on('roundStatus', ({ round, placed }: { round: number; placed: boolean }) => {
      setMyState((prev) => (prev ? { ...prev, round, placed } : prev));
      setPlacing(false);
    });

    socket.on('roomEnded', () => {
      setTeacherState(null);
      setStudents([]);
      setMyState(null);
      setPage('select');
      setError('게임이 종료되었습니다.');
      setPlacing(false);
    });

    return () => {
      socket.removeAllListeners();
    };
  }, []);

  const qrImageUrl = useMemo(() => {
    const safe = joinUrl.trim();
    if (!safe) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(safe)}`;
  }, [joinUrl]);

  const loginTeacher = () => socket.emit('teacher:login', { pin: teacherPin });

  const joinStudent = () => {
    if (!studentKey.trim()) {
      setError('studentKey(번호-이름)를 입력하세요.');
      return;
    }
    localStorage.setItem('streams_student_key', studentKey.trim());
    localStorage.setItem('streams_student_name', nickname.trim());
    socket.emit('student:join', { studentKey: studentKey.trim(), nickname: nickname.trim() || studentKey.trim() });
  };

  const startOrNewGame = (isNew: boolean) => {
    localStorage.setItem('streams_join_url', joinUrl.trim());
    if (isNew) socket.emit('teacher:newGame', { settings: { ...settings, deckConfig: fixedDeckConfig } });
    else socket.emit('teacher:startGame', { settings: { ...settings, deckConfig: fixedDeckConfig } });
  };

  const placeNumber = (index: number) => {
    if (!myState || placing || myState.placed) return;
    if (myState.board[index] !== null) return;

    setPlacing(true);
    socket.emit(
      'student:place',
      {
        studentKey: myState.studentKey,
        index,
        round: myState.round
      },
      (response: { ok: boolean; message?: string }) => {
        setPlacing(false);
        if (!response.ok) setError(response.message ?? '배치 실패');
      }
    );
  };

  return (
    <main className="page">
      <h1>Streams Classroom</h1>
      {error && <p className="error">{error}</p>}

      {page === 'select' && (
        <section className="panel centered">
          <button onClick={() => setPage('teacher-login')}>진행자</button>
          <button onClick={() => setPage('student-join')}>참가자</button>
        </section>
      )}

      {page === 'teacher-login' && (
        <section className="panel">
          <h2>진행자 PIN 로그인</h2>
          <input type="password" value={teacherPin} onChange={(e) => setTeacherPin(e.target.value)} placeholder="PIN" />
          <div className="row">
            <button onClick={loginTeacher}>로그인</button>
            <button className="ghost" onClick={() => setPage('select')}>뒤로</button>
          </div>
        </section>
      )}

      {(page === 'teacher-setup' || page === 'teacher-game') && (
        <section className="panel">
          <h2>진행자 화면</h2>
          <p>라운드: {teacherState?.game.round ?? 0} / {teacherState?.game.totalRounds ?? 20}</p>
          <p className="big">{tileText(teacherState?.game.currentNumber ?? null) || '대기'}</p>
          <p>남은 숫자: {teacherState?.game.remainingDraws ?? 20}</p>

          <h3>설정</h3>
          <label><input type="checkbox" checked={settings.includeJoker} onChange={(e) => setSettings((p) => ({ ...p, includeJoker: e.target.checked }))} /> 조커 포함</label>

          <h3>학생 접속 URL (숫자 아이피)</h3>
          <input
            value={joinUrl}
            onChange={(e) => setJoinUrl(e.target.value)}
            placeholder="예: http://192.168.0.15:5173"
            style={{ width: '100%', marginBottom: 8 }}
          />
          <div className="qr-wrap">
            <p>{joinUrl || '숫자 아이피 URL을 입력하세요.'}</p>
            {qrImageUrl && <img src={qrImageUrl} alt="학생 접속 QR 코드" width={220} height={220} />}
          </div>

          <div className="row">
            <button onClick={() => startOrNewGame(false)}>게임 시작</button>
            <button onClick={() => socket.emit('teacher:draw')}>뽑기</button>
            <button onClick={() => socket.emit('teacher:rewind')}>되감기</button>
            <button onClick={() => startOrNewGame(true)}>새 게임 시작</button>
            <button className="danger" onClick={() => socket.emit('teacher:endGame')}>게임 끝</button>
          </div>

          <h3>학생 목록 (점수 높은 순)</h3>
          <table>
            <thead>
              <tr><th>학생키</th><th>닉네임</th><th>점수</th><th>연결</th><th>배치</th><th>재접속</th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.studentKey}>
                  <td>{s.studentKey}</td>
                  <td>{s.nickname}</td>
                  <td>{s.score}</td>
                  <td>{s.connected ? '연결됨' : '끊김'}</td>
                  <td>{s.placed ? '완료' : '대기'}</td>
                  <td>{s.reconnectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {page === 'student-join' && (
        <section className="panel">
          <h2>참가자 입장</h2>
          <input value={studentKey} onChange={(e) => setStudentKey(e.target.value)} placeholder="studentKey (예: 2-15-홍길동)" />
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="표시 이름" />
          <div className="row">
            <button onClick={joinStudent}>입장</button>
            <button className="ghost" onClick={() => setPage('select')}>뒤로</button>
          </div>
        </section>
      )}

      {page === 'student-game' && myState && (
        <section className="panel">
          <h2>학생 화면</h2>
          <p className="big">{tileText(myState.currentNumber) || '대기'}</p>
          <p>라운드: {myState.round}/{myState.totalRounds}</p>
          <p>배치 상태: {myState.placed ? '완료' : placing ? '전송 중...' : '대기'}</p>
          <p>현재 점수: {myState.score}</p>
          <div className="board">
            {myState.board.map((value, index) => (
              <button
                key={index}
                className="cell"
                disabled={placing || myState.placed || value !== null}
                onClick={() => placeNumber(index)}
              >
                <span className="cell-index">{index + 1}</span>
                <span className="cell-value">{tileText(value)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
