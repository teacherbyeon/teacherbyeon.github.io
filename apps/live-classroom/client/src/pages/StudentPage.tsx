import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http';
import { socket } from '../api/socket';
import type { Session, StudentLiveState } from '../types';

function parseOptions(json: string) {
  try { const p = JSON.parse(json); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
}

export function StudentPage() {
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [state, setState] = useState<StudentLiveState | null>(null);
  const [message, setMessage] = useState('');
  const [localAnsweredQuestionId, setLocalAnsweredQuestionId] = useState<number | null>(null);

  useEffect(() => {
    const onLive = (payload: StudentLiveState) => setState(payload);
    socket.on('student:liveStateUpdated', onLive);
    return () => socket.off('student:liveStateUpdated', onLive);
  }, []);

  const join = async () => {
    const r = await fetch(`/api/sessions/code/${joinCode.toUpperCase()}`);
    if (!r.ok) return setMessage('입장 코드가 올바르지 않습니다.');
    const s = (await r.json()) as Session;
    const existingStudentId = Number(localStorage.getItem(`student:${s.id}`)) || undefined;
    const student = await api<any>(`/api/sessions/${s.id}/students/join`, {
      method: 'POST',
      body: JSON.stringify({ name, identifier: identifier || name, existingStudentId })
    });
    setSession(s);
    setStudentId(student.id);
    localStorage.setItem(`student:${s.id}`, String(student.id));
    socket.emit('session:joinRoom', { sessionId: s.id, role: 'student', studentId: student.id });
    const live = await api<StudentLiveState>(`/api/sessions/${s.id}/live?studentId=${student.id}`);
    setState(live);
  };

  const remainingSeconds = useMemo(() => {
    if (!state?.session.questionDeadlineAt) return 0;
    return Math.max(0, Math.ceil((new Date(state.session.questionDeadlineAt).getTime() - Date.now()) / 1000));
  }, [state]);

  const submit = async (selectedOptionIndex: number) => {
    if (!session || !studentId || !state?.currentQuestion) return;
    try {
      await api('/api/questions/respond', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.id, studentId, selectedOptionIndex })
      });
      setLocalAnsweredQuestionId(state.currentQuestion.id);
      setMessage('답안 제출 완료! 다음 문항을 기다려 주세요.');
    } catch (e) {
      setMessage('제출 실패(중복 제출 또는 시간 종료)');
    }
  };

  if (!session) {
    return (
      <main className="page student">
        <h1>학생 입장</h1>
        <input placeholder="입장 코드" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="번호(선택)" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <button onClick={join}>입장</button>
        <p>{message}</p>
      </main>
    );
  }

  if (state?.session.status === 'finished') {
    return (
      <main className="page student">
        <h1>세션 종료</h1>
        <p>수업이 종료되었습니다.</p>
        <ul>{(state.leaderboard ?? []).slice(0, 5).map((s, idx) => <li key={s.id}>{idx + 1}. {s.displayName} - {s.totalScore}점</li>)}</ul>
      </main>
    );
  }

  const waiting = !state?.currentQuestion || state.session.questionState !== 'revealed';
  if (waiting) {
    return (
      <main className="page student">
        <h1>대기 중</h1>
        <p>선생님이 문제를 공개하면 자동으로 표시됩니다.</p>
        <p>세션 상태: {state?.session.status}</p>
      </main>
    );
  }

  const q = state.currentQuestion;
  const options = parseOptions(q.optionsJson);
  const answered = state.alreadyAnswered || localAnsweredQuestionId === q.id;

  return (
    <main className="page student">
      <h1>문항 {q.orderInSession}</h1>
      <p>남은 시간: {remainingSeconds}초</p>
      <section className="card">
        <h2>{q.prompt}</h2>
        {q.imagePath && <img src={q.imagePath} className="question-image" />}
        {options.map((opt, idx) => (
          <button key={idx} className="big-btn" disabled={answered || remainingSeconds <= 0} onClick={() => submit(idx)}>{opt}</button>
        ))}
        {answered && <p>✅ 제출 완료. 다음 문제를 기다려 주세요.</p>}
      </section>
      <p>{message}</p>
    </main>
  );
}
