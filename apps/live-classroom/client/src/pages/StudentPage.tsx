import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http';
import { socket } from '../api/socket';
import type { Poll, Question, Session } from '../types';

interface StatePayload {
  session: Session;
  currentQuestion: Question | null;
  currentPoll: Poll | null;
  leaderboard: Array<{ id: number; displayName: string; totalScore: number }>;
}

export function StudentPage() {
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [studentId, setStudentId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const connected = socket.connected;

  useEffect(() => {
    socket.on('display:stateUpdated', (payload: StatePayload) => setState(payload));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      socket.off('display:stateUpdated');
      clearInterval(timer);
    };
  }, []);

  const join = async () => {
    const sessionRes = await fetch(`/api/sessions/code/${joinCode.toUpperCase()}`);
    let session: Session | null = null;
    if (sessionRes.ok) session = await sessionRes.json();
    if (!session) {
      setMessage('입장 코드를 확인해 주세요.');
      return;
    }
    const existingStudentId = Number(localStorage.getItem(`student:${session.id}`)) || undefined;
    const student = await api<any>(`/api/sessions/${session.id}/students/join`, {
      method: 'POST',
      body: JSON.stringify({ name, identifier: identifier || name, existingStudentId })
    });
    setStudentId(student.id);
    setSessionId(session.id);
    localStorage.setItem(`student:${session.id}`, String(student.id));
    socket.emit('session:joinRoom', { sessionId: session.id });
  };

  const submitAnswer = async (optionIndex: number) => {
    if (!state?.currentQuestion || !studentId) return;
    await api(`/api/questions/${state.currentQuestion.id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ studentId, selectedOptionIndex: optionIndex })
    });
    setMessage('제출 완료!');
  };

  const submitVote = async (optionIndex: number) => {
    if (!state?.currentPoll || !studentId) return;
    await api(`/api/polls/${state.currentPoll.id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ studentId, selectedOptionIndex: optionIndex })
    });
    setMessage('투표 완료!');
  };

  const remainSeconds = useMemo(() => {
    if (!state?.currentQuestion?.startedAt) return 0;
    const end = new Date(state.currentQuestion.startedAt).getTime() + state.currentQuestion.timeLimitSeconds * 1000;
    return Math.max(0, Math.ceil((end - now) / 1000));
  }, [state, now]);

  const myScore = useMemo(() => {
    if (!studentId) return 0;
    return state?.leaderboard.find((x) => x.id === studentId)?.totalScore ?? 0;
  }, [state, studentId]);

  if (!sessionId) {
    return (
      <main className="page student">
        <h1>학생 입장</h1>
        <input placeholder="입장 코드" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="번호(선택)" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <button onClick={join}>입장</button>
        <small>{message}</small>
      </main>
    );
  }

  const currentQuestion = state?.currentQuestion;
  const currentPoll = state?.currentPoll;

  return (
    <main className="page student">
      <h1>학생 화면</h1>
      <p>연결 상태: {connected ? '온라인' : '재연결 중'}</p>
      <p>내 점수: {myScore}</p>
      {message && <p>{message}</p>}

      {currentQuestion && (
        <section className="card">
          <h2>{currentQuestion.title}</h2>
          <p>남은 시간: {remainSeconds}s</p>
          {currentQuestion.imagePath && <img src={currentQuestion.imagePath} className="question-image" />}
          {JSON.parse(currentQuestion.optionsJson).map((opt: string, idx: number) => (
            <button key={idx} className="big-btn" disabled={currentQuestion.status !== 'active'} onClick={() => submitAnswer(idx)}>
              {opt}
            </button>
          ))}
        </section>
      )}

      {currentPoll && (
        <section className="card">
          <h2>{currentPoll.title}</h2>
          {JSON.parse(currentPoll.optionsJson).map((opt: string, idx: number) => (
            <button key={idx} className="big-btn" disabled={currentPoll.status !== 'active'} onClick={() => submitVote(idx)}>
              {opt}
            </button>
          ))}
        </section>
      )}

      {!currentQuestion && !currentPoll && <p>교사가 문제/투표를 시작하면 여기에 표시됩니다.</p>}
    </main>
  );
}
