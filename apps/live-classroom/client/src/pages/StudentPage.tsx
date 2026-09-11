import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http';
import { joinSessionRoom, socket, subscribeSocketStatus } from '../api/socket';
import { LatexMixedText } from '../components/LatexMixedText';
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
  const [joining, setJoining] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');

  const resyncLiveState = async (nextSessionId: number, nextStudentId: number) => {
    const live = await api<StudentLiveState>(`/api/sessions/${nextSessionId}/live?studentId=${nextStudentId}`);
    setState(live);
    if (import.meta.env.DEV) console.log('[student] session state resynced', { nextSessionId, nextStudentId });
  };

  useEffect(() => {
    const onLive = (payload: StudentLiveState) => setState(payload);
    socket.on('student:liveStateUpdated', onLive);
    const unsub = subscribeSocketStatus((status) => {
      setConnectionStatus(status);
      if (status === 'reconnecting' || status === 'disconnected') {
        setMessage('연결이 불안정하여 상태를 다시 불러오는 중...');
      }
      if (status === 'connected' && session && studentId) {
        setMessage('다시 연결되었습니다.');
        joinSessionRoom({ sessionId: session.id, role: 'student', studentId });
        void resyncLiveState(session.id, studentId);
      }
    });
    return () => {
      socket.off('student:liveStateUpdated', onLive);
      unsub();
    };
  }, [session, studentId]);

  const join = async () => {
    setJoining(true);
    setMessage('');
    try {
      const r = await fetch(`/api/sessions/code/${joinCode.toUpperCase()}`);
      if (!r.ok) {
        setMessage('입장 코드가 올바르지 않습니다.');
        return;
      }
      const s = (await r.json()) as Session;
      const saved = localStorage.getItem(`student:${s.id}`);
      let parsed: { studentId?: number; rejoinToken?: string } = {};
      if (saved) {
        try { parsed = JSON.parse(saved) as { studentId?: number; rejoinToken?: string }; } catch { parsed = {}; }
      }
      const student = await api<any>(`/api/sessions/${s.id}/students/join`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          identifier: identifier.trim(),
          existingStudentId: parsed.studentId,
          rejoinToken: parsed.rejoinToken
        })
      });
      setSession(s);
      setStudentId(student.id);
      localStorage.setItem(`student:${s.id}`, JSON.stringify({ studentId: student.id, rejoinToken: student.rejoinToken }));
      joinSessionRoom({ sessionId: s.id, role: 'student', studentId: student.id });
      await resyncLiveState(s.id, student.id);
      setMessage('입장 완료');
    } catch (e: any) {
      const text = String(e?.message || '');
      if (text.includes('DUPLICATE_IDENTIFIER') || text.includes('identifier already in use')) {
        setMessage('이미 사용 중인 번호입니다. 번호를 다시 확인하세요.');
      } else if (text.includes('INVALID_IDENTIFIER') || text.includes('identifier must be numeric')) {
        setMessage('번호는 숫자만 입력할 수 있습니다.');
      } else {
        setMessage('입장에 실패했습니다. 잠시 후 다시 시도하세요.');
      }
    } finally {
      setJoining(false);
    }
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
      await resyncLiveState(session.id, studentId);
    } catch (e) {
      setMessage('이미 제출함 또는 응답 시간이 종료됨');
    }
  };

  if (!session) {
    return (
      <main className="page student">
        <h1>학생 입장</h1>
        <input placeholder="입장 코드" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="번호(필수)" value={identifier} onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, ''))} />
        <button onClick={join} disabled={joining || !joinCode.trim() || !identifier.trim()}>{joining ? '입장 처리 중...' : '입장'}</button>
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
        <p>{connectionStatus === 'connected' ? '아직 문제가 공개되지 않음' : '연결이 불안정하여 상태를 다시 불러오는 중'}</p>
        <p>세션 상태: {state?.session.status}</p>
        <p>{message}</p>
      </main>
    );
  }

  const q = state.currentQuestion;
  const options = parseOptions(q.optionsJson);
  const answered = state.alreadyAnswered || localAnsweredQuestionId === q.id;
  const timeOver = remainingSeconds <= 0;
  const canSubmit = !answered && !timeOver && state.session.questionState === 'revealed' && connectionStatus === 'connected';
  const submitBlockedReason = answered
    ? '이미 제출함'
    : timeOver
      ? '응답 시간이 종료됨'
      : connectionStatus !== 'connected'
        ? '연결이 불안정하여 상태를 다시 불러오는 중'
        : '';

  return (
    <main className="page student">
      <h1>문항 {q.orderInSession}</h1>
      <p>남은 시간: {remainingSeconds}초</p>
      {submitBlockedReason && <p>{submitBlockedReason}</p>}
      <section className="card">
        <LatexMixedText text={q.prompt} />
        {q.imagePath && <img src={q.imagePath} className="question-image" />}
        {options.map((opt, idx) => (
          <button key={idx} className="big-btn" disabled={!canSubmit} onClick={() => submit(idx)}>
            <b>{idx + 1}) </b><LatexMixedText text={opt} />
          </button>
        ))}
        {answered && <p>✅ 제출 완료. 다음 문제를 기다려 주세요.</p>}
      </section>
      <p>{message}</p>
    </main>
  );
}
