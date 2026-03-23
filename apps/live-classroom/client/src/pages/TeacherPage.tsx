import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/http';
import { socket } from '../api/socket';
import { LeaderboardChart } from '../components/LeaderboardChart';
import { PollChart } from '../components/PollChart';
import type { Poll, Question, Session, Student } from '../types';

interface StatePayload {
  session: Session;
  currentQuestion: Question | null;
  currentPoll: Poll | null;
  leaderboard: Array<{ id: number; displayName: string; totalScore: number }>;
}

export function TeacherPage() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Array<{ selectedOptionIndex: number; count: number }>>([]);
  const [pollCounts, setPollCounts] = useState<Array<{ selectedOptionIndex: number; count: number }>>([]);

  const [newSessionName, setNewSessionName] = useState('');
  const [questionForm, setQuestionForm] = useState({
    title: '',
    body: '',
    options: ['선택지 1', '선택지 2'],
    correctOptionIndex: 0,
    timeLimitSeconds: 20,
    baseScore: 100,
    speedBonusEnabled: true,
    firstCorrectBonusEnabled: true,
    firstBonus1: 20,
    firstBonus2: 10,
    firstBonus3: 5
  });
  const [pollForm, setPollForm] = useState({ title: '', options: ['찬성', '반대'], isAnonymous: true, isLiveResultVisible: true });
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    socket.on('display:stateUpdated', (payload: StatePayload) => {
      setState(payload);
    });
    socket.on('question:responseCountUpdated', (payload) => setQuestionCounts(payload.counts));
    socket.on('poll:resultsUpdated', (payload) => setPollCounts(payload.counts));
    return () => {
      socket.off('display:stateUpdated');
      socket.off('question:responseCountUpdated');
      socket.off('poll:resultsUpdated');
    };
  }, []);

  const loadSession = async (id: number) => {
    const data = await api<{ session: Session; students: Student[]; questions: Question[]; polls: Poll[] }>(`/api/sessions/${id}`);
    setSessionId(id);
    setStudents(data.students);
    setQuestions(data.questions);
    setPolls(data.polls);
    socket.emit('session:joinRoom', { sessionId: id });
  };

  const createSession = async () => {
    const created = await api<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name: newSessionName, randomNicknameEnabled: true })
    });
    await loadSession(created.id);
  };

  const createQuestion = async () => {
    if (!sessionId) return;
    const form = new FormData();
    form.append('sessionId', String(sessionId));
    form.append('title', questionForm.title);
    form.append('body', questionForm.body);
    form.append('options', JSON.stringify(questionForm.options));
    form.append('correctOptionIndex', String(questionForm.correctOptionIndex));
    form.append('timeLimitSeconds', String(questionForm.timeLimitSeconds));
    form.append('baseScore', String(questionForm.baseScore));
    form.append('speedBonusEnabled', String(questionForm.speedBonusEnabled));
    form.append('firstCorrectBonusEnabled', String(questionForm.firstCorrectBonusEnabled));
    form.append('firstBonus1', String(questionForm.firstBonus1));
    form.append('firstBonus2', String(questionForm.firstBonus2));
    form.append('firstBonus3', String(questionForm.firstBonus3));
    if (imageFile) form.append('image', imageFile);

    await fetch('/api/questions', { method: 'POST', body: form });
    await loadSession(sessionId);
  };

  const createPoll = async () => {
    if (!sessionId) return;
    await api('/api/polls', {
      method: 'POST',
      body: JSON.stringify({ ...pollForm, sessionId })
    });
    await loadSession(sessionId);
  };

  const currentQuestionOptions = useMemo(
    () => (state?.currentQuestion ? JSON.parse(state.currentQuestion.optionsJson) : []),
    [state]
  );

  return (
    <main className="page">
      <h1>교사용 대시보드</h1>

      <section className="grid2">
        <div className="card">
          <h2>세션 생성</h2>
          <input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="예: 3-2 수학 1교시" />
          <button onClick={createSession}>세션 만들기</button>
          {state?.session && (
            <div className="mt8">
              <p>입장 코드: <strong>{state.session.joinCode}</strong></p>
              <p>학생 URL: {window.location.origin}/student</p>
              <QRCodeSVG value={`${window.location.origin}/student`} size={120} />
            </div>
          )}
        </div>

        <div className="card">
          <h2>세션 불러오기</h2>
          <input type="number" placeholder="session id" onKeyDown={(e) => e.key === 'Enter' && loadSession(Number((e.target as HTMLInputElement).value))} />
          <p>학생 수: {students.length}</p>
          <ul>{students.map((s) => <li key={s.id}>{s.displayName}</li>)}</ul>
        </div>
      </section>

      {sessionId && (
        <>
          <section className="grid2">
            <div className="card">
              <h2>문제 생성</h2>
              <input placeholder="제목" value={questionForm.title} onChange={(e) => setQuestionForm({ ...questionForm, title: e.target.value })} />
              <textarea placeholder="문제 설명" value={questionForm.body} onChange={(e) => setQuestionForm({ ...questionForm, body: e.target.value })} />
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              {questionForm.options.map((opt, idx) => (
                <input key={idx} value={opt} onChange={(e) => {
                  const next = [...questionForm.options]; next[idx] = e.target.value; setQuestionForm({ ...questionForm, options: next });
                }} />
              ))}
              <div className="row">
                <button onClick={() => questionForm.options.length < 5 && setQuestionForm({ ...questionForm, options: [...questionForm.options, `선택지 ${questionForm.options.length + 1}`] })}>선택지 추가</button>
                <button onClick={() => questionForm.options.length > 2 && setQuestionForm({ ...questionForm, options: questionForm.options.slice(0, -1) })}>선택지 제거</button>
              </div>
              <label>정답 인덱스 <input type="number" value={questionForm.correctOptionIndex} onChange={(e) => setQuestionForm({ ...questionForm, correctOptionIndex: Number(e.target.value) })} /></label>
              <label>시간(초) <input type="number" value={questionForm.timeLimitSeconds} onChange={(e) => setQuestionForm({ ...questionForm, timeLimitSeconds: Number(e.target.value) })} /></label>
              <button onClick={createQuestion}>문제 저장</button>
            </div>

            <div className="card">
              <h2>문제 목록</h2>
              {questions.map((q) => (
                <div key={q.id} className="item">
                  <strong>#{q.orderInSession} {q.title || '무제'}</strong>
                  <small>상태: {q.status}</small>
                  <div className="row">
                    <button onClick={() => api(`/api/questions/${q.id}/start`, { method: 'POST' })}>시작</button>
                    <button onClick={() => api(`/api/questions/${q.id}/end`, { method: 'POST' })}>종료</button>
                    <button onClick={() => api(`/api/questions/${q.id}/reveal`, { method: 'POST' })}>정답 공개</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid2">
            <div className="card">
              <h2>투표 생성</h2>
              <input value={pollForm.title} onChange={(e) => setPollForm({ ...pollForm, title: e.target.value })} placeholder="투표 제목" />
              {pollForm.options.map((opt, idx) => (
                <input key={idx} value={opt} onChange={(e) => {
                  const next = [...pollForm.options]; next[idx] = e.target.value; setPollForm({ ...pollForm, options: next });
                }} />
              ))}
              <label><input type="checkbox" checked={pollForm.isAnonymous} onChange={(e) => setPollForm({ ...pollForm, isAnonymous: e.target.checked })} /> 익명</label>
              <button onClick={createPoll}>투표 저장</button>
              <h3>투표 목록</h3>
              {polls.map((p) => (
                <div key={p.id} className="item">
                  <strong>{p.title}</strong>
                  <small>{p.status}</small>
                  <div className="row">
                    <button onClick={() => api(`/api/polls/${p.id}/start`, { method: 'POST' })}>시작</button>
                    <button onClick={() => api(`/api/polls/${p.id}/end`, { method: 'POST' })}>종료</button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <LeaderboardChart data={state?.leaderboard ?? []} />
              {state?.currentQuestion && <PollChart options={currentQuestionOptions} counts={questionCounts} />}
              {state?.currentPoll && <PollChart options={JSON.parse(state.currentPoll.optionsJson)} counts={pollCounts} />}
              <button onClick={() => window.open(`/api/sessions/${sessionId}/export`, '_blank')}>CSV 내보내기</button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
