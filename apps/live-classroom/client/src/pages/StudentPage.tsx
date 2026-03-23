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

function safeOptions(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x));
  } catch {
    return [];
  }
}

export function StudentPage() {
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [studentId, setStudentId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [message, setMessage] = useState('');
  const [debug, setDebug] = useState('');
  const [now, setNow] = useState(Date.now());
  const [submittedQuestionId, setSubmittedQuestionId] = useState<number | null>(null);
  const [submittedOptionIndex, setSubmittedOptionIndex] = useState<number | null>(null);
  const [submittedPollId, setSubmittedPollId] = useState<number | null>(null);
  const connected = socket.connected;

  useEffect(() => {
    const onStateUpdated = (payload: StatePayload) => {
      console.log('[학생] state 수신', payload);
      setState(payload);
      setDebug(`state 수신 완료: q=${payload.currentQuestion?.id ?? '-'}, p=${payload.currentPoll?.id ?? '-'}`);
    };

    socket.on('display:stateUpdated', onStateUpdated);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      socket.off('display:stateUpdated', onStateUpdated);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const checkSubmission = async () => {
      if (!studentId || !state?.currentQuestion) return;
      try {
        const result = await api<{ submitted: boolean; selectedOptionIndex?: number }>(
          `/api/questions/${state.currentQuestion.id}/submission/${studentId}`
        );
        if (result.submitted) {
          setSubmittedQuestionId(state.currentQuestion.id);
          setSubmittedOptionIndex(result.selectedOptionIndex ?? null);
          setMessage('이미 제출한 문제입니다. 결과를 기다려 주세요.');
        } else {
          setSubmittedQuestionId(null);
          setSubmittedOptionIndex(null);
        }
      } catch (error) {
        console.error('[학생] 제출 상태 확인 실패', error);
      }
    };

    void checkSubmission();
  }, [studentId, state?.currentQuestion?.id]);

  const join = async () => {
    try {
      setMessage('');
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
      setDebug('세션 room join 요청 완료');
    } catch (error) {
      console.error('[학생] 입장 실패', error);
      setMessage('입장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const submitAnswer = async (optionIndex: number) => {
    if (!state?.currentQuestion || !studentId) return;
    try {
      const result = await api<{ ok: boolean; score: number }>(`/api/questions/${state.currentQuestion.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ studentId, selectedOptionIndex: optionIndex })
      });
      console.log('[학생] 응답 제출 성공', result);
      setSubmittedQuestionId(state.currentQuestion.id);
      setSubmittedOptionIndex(optionIndex);
      setMessage(`제출 완료! (+${result.score}점)`);
    } catch (error: unknown) {
      const raw = String(error ?? '');
      console.error('[학생] 응답 제출 실패', raw);
      if (raw.includes('already submitted')) {
        setSubmittedQuestionId(state.currentQuestion.id);
        setMessage('이미 제출한 문제입니다.');
      } else if (raw.includes('time over')) {
        setMessage('제한 시간이 종료되어 제출할 수 없습니다.');
      } else if (raw.includes('question is not active')) {
        setMessage('아직 시작되지 않았거나 이미 종료된 문제입니다.');
      } else {
        setMessage('답안 제출에 실패했습니다. 네트워크 상태를 확인해 주세요.');
      }
    }
  };

  const submitVote = async (optionIndex: number) => {
    if (!state?.currentPoll || !studentId) return;
    try {
      await api(`/api/polls/${state.currentPoll.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ studentId, selectedOptionIndex: optionIndex })
      });
      setSubmittedPollId(state.currentPoll.id);
      setMessage('투표 완료!');
    } catch (error) {
      console.error('[학생] 투표 실패', error);
      setMessage('투표 제출에 실패했습니다.');
    }
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

  const questionOptions = useMemo(() => safeOptions(state?.currentQuestion?.optionsJson), [state?.currentQuestion?.optionsJson]);
  const pollOptions = useMemo(() => safeOptions(state?.currentPoll?.optionsJson), [state?.currentPoll?.optionsJson]);

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
  const canAnswer =
    !!currentQuestion &&
    currentQuestion.status === 'active' &&
    submittedQuestionId !== currentQuestion.id &&
    questionOptions.length > 0;

  return (
    <main className="page student">
      <h1>학생 화면</h1>
      <p>연결 상태: {connected ? '온라인' : '재연결 중'}</p>
      <p>내 점수: {myScore}</p>
      {message && <p>{message}</p>}
      <small style={{ color: '#64748b' }}>디버그: {debug} / options={questionOptions.length}</small>

      {currentQuestion && (
        <section className="card">
          <h2>{currentQuestion.title || '퀴즈 문제'}</h2>
          <p>상태: {currentQuestion.status} / 남은 시간: {remainSeconds}s</p>
          {currentQuestion.imagePath && <img src={currentQuestion.imagePath} className="question-image" />}

          {questionOptions.length === 0 && <p>선택지를 불러오지 못했습니다.</p>}

          {questionOptions.map((opt: string, idx: number) => {
            const isSelected = submittedOptionIndex === idx && submittedQuestionId === currentQuestion.id;
            return (
              <button
                key={idx}
                className="big-btn"
                disabled={!canAnswer}
                onClick={() => submitAnswer(idx)}
                style={isSelected ? { background: '#16a34a' } : undefined}
              >
                {opt}
              </button>
            );
          })}

          {!canAnswer && currentQuestion.status === 'active' && submittedQuestionId === currentQuestion.id && (
            <p>✅ 제출 완료 상태입니다.</p>
          )}
        </section>
      )}

      {currentPoll && (
        <section className="card">
          <h2>{currentPoll.title}</h2>
          <p>상태: {currentPoll.status}</p>
          {pollOptions.map((opt: string, idx: number) => (
            <button
              key={idx}
              className="big-btn"
              disabled={currentPoll.status !== 'active' || submittedPollId === currentPoll.id}
              onClick={() => submitVote(idx)}
            >
              {opt}
            </button>
          ))}
          {submittedPollId === currentPoll.id && <p>✅ 투표 제출 완료</p>}
        </section>
      )}

      {!currentQuestion && !currentPoll && <p>교사가 문제/투표를 시작하면 여기에 표시됩니다.</p>}
    </main>
  );
}
