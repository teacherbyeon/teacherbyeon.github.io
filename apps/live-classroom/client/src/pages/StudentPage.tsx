import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http';
import { socket } from '../api/socket';
import type { Session, SessionStatePayload } from '../types';

function parseOptions(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export function StudentPage() {
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<SessionStatePayload | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onState = (payload: SessionStatePayload) => setState(payload);
    socket.on('session:stateUpdated', onState);
    return () => socket.off('session:stateUpdated', onState);
  }, []);

  const join = async () => {
    const res = await fetch(`/api/sessions/code/${joinCode.toUpperCase()}`);
    if (!res.ok) {
      setMessage('입장 코드를 확인하세요.');
      return;
    }
    const sessionData = (await res.json()) as Session;

    const existingStudentId = Number(localStorage.getItem(`student:${sessionData.id}`)) || undefined;
    const student = await api<any>(`/api/sessions/${sessionData.id}/students/join`, {
      method: 'POST',
      body: JSON.stringify({ name, identifier: identifier || name, existingStudentId })
    });

    setSession(sessionData);
    setStudentId(student.id);
    localStorage.setItem(`student:${sessionData.id}`, String(student.id));
    socket.emit('session:joinRoom', { sessionId: sessionData.id });

    const answerState = await api<{ answers: Array<{ questionId: number; selectedOptionIndex: number }>; submitted: boolean }>(
      `/api/sessions/${sessionData.id}/student/${student.id}/answers`
    );
    const mapped: Record<number, number> = {};
    for (const a of answerState.answers) mapped[a.questionId] = a.selectedOptionIndex;
    setAnswers(mapped);
    setSubmitted(answerState.submitted);
  };

  const saveAnswer = async (questionId: number, selectedOptionIndex: number) => {
    if (!session || !studentId || submitted) return;
    if (state?.session.status !== 'active') {
      setMessage('현재 세션이 풀이 가능 상태가 아닙니다.');
      return;
    }

    await api('/api/questions/answer', {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.id, questionId, studentId, selectedOptionIndex })
    });
    setAnswers((prev) => ({ ...prev, [questionId]: selectedOptionIndex }));
  };

  const submitAll = async () => {
    if (!session || !studentId) return;
    await api(`/api/sessions/${session.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ studentId })
    });
    setSubmitted(true);
    setMessage('제출이 완료되었습니다.');
  };

  const readyCount = useMemo(() => {
    const total = state?.questionSet.length ?? 0;
    if (total === 0) return { done: 0, total: 0 };
    return { done: Object.keys(answers).length, total };
  }, [answers, state]);

  if (!session) {
    return (
      <main className="page student">
        <h1>학생 입장</h1>
        <input placeholder="입장 코드" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="번호(선택)" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        <button onClick={join}>입장하기</button>
        <p>{message}</p>
      </main>
    );
  }

  return (
    <main className="page student">
      <h1>문제 풀이</h1>
      <p>세션 상태: <b>{state?.session.status ?? session.status}</b></p>
      <p>풀이 진행: {readyCount.done} / {readyCount.total}</p>
      {message && <p>{message}</p>}

      {state?.questionSet.map((q) => {
        const options = parseOptions(q.optionsJson);
        return (
          <section key={q.id} className="card">
            <h2>{q.orderInSession}. {q.prompt}</h2>
            {q.imagePath && <img src={q.imagePath} className="question-image" />}
            {options.map((opt, idx) => (
              <button
                key={idx}
                className="big-btn"
                disabled={submitted || state.session.status !== 'active'}
                style={answers[q.id] === idx ? { background: '#16a34a' } : undefined}
                onClick={() => saveAnswer(q.id, idx)}
              >
                {opt}
              </button>
            ))}
          </section>
        );
      })}

      {!submitted ? (
        <button disabled={(state?.session.status !== 'active') || readyCount.done !== readyCount.total} onClick={submitAll}>
          최종 제출
        </button>
      ) : (
        <div className="card"><h2>제출 완료</h2><p>교사가 세션을 마감할 때까지 대기해주세요.</p></div>
      )}
    </main>
  );
}
