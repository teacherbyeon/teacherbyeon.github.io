import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/http';
import { socket } from '../api/socket';
import type { Question, Session, SessionStatePayload, Student } from '../types';

function parseOptions(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export function TeacherPage() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionState, setSessionState] = useState<SessionStatePayload | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [message, setMessage] = useState('');

  const [newSessionName, setNewSessionName] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [form, setForm] = useState({ prompt: '', options: ['선택지 1', '선택지 2'], correctOptionIndex: 0, weight: 100 });
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    const onState = (payload: SessionStatePayload) => setSessionState(payload);
    socket.on('session:stateUpdated', onState);
    return () => {
      socket.off('session:stateUpdated', onState);
    };
  }, []);

  const loadSession = async (id: number) => {
    const data = await api<any>(`/api/sessions/${id}`);
    setSessionId(id);
    setStudents(data.students);
    setSessionState({ session: data.session, questionSet: data.questionSet, progress: data.progress, leaderboard: data.leaderboard });
    socket.emit('session:joinRoom', { sessionId: id });
  };

  const createSession = async () => {
    const created = await api<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name: newSessionName })
    });
    await loadSession(created.id);
    setMessage(`세션 생성 완료: ${created.name} (${created.joinCode})`);
  };

  const saveQuestion = async () => {
    if (!sessionId) return;
    const fd = new FormData();
    fd.append('sessionId', String(sessionId));
    fd.append('prompt', form.prompt);
    fd.append('options', JSON.stringify(form.options));
    fd.append('correctOptionIndex', String(form.correctOptionIndex));
    fd.append('weight', String(form.weight));
    if (imageFile) fd.append('image', imageFile);

    if (editingQuestion) {
      const res = await fetch(`/api/questions/${editingQuestion.id}`, { method: 'PUT', body: fd });
      if (!res.ok) throw new Error(await res.text());
      setMessage('문항 수정 완료');
    } else {
      const res = await fetch('/api/questions', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      setMessage('문항 추가 완료');
    }

    setEditingQuestion(null);
    setForm({ prompt: '', options: ['선택지 1', '선택지 2'], correctOptionIndex: 0, weight: 100 });
    setImageFile(null);
    await loadSession(sessionId);
  };

  const editQuestion = (q: Question) => {
    setEditingQuestion(q);
    setForm({
      prompt: q.prompt,
      options: parseOptions(q.optionsJson),
      correctOptionIndex: q.correctOptionIndex,
      weight: q.weight
    });
  };

  const deleteQuestion = async (id: number) => {
    await api(`/api/questions/${id}`, { method: 'DELETE' });
    setMessage('문항 삭제 완료');
    if (sessionId) await loadSession(sessionId);
  };

  const reorder = async (questionIds: number[]) => {
    if (!sessionId) return;
    await api('/api/questions/reorder', {
      method: 'POST',
      body: JSON.stringify({ sessionId, questionIds })
    });
    await loadSession(sessionId);
  };

  const moveQuestion = (id: number, direction: -1 | 1) => {
    const list = [...(sessionState?.questionSet ?? [])];
    const index = list.findIndex((q) => q.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    void reorder(list.map((x) => x.id));
  };

  const startSession = async () => {
    if (!sessionId) return;
    await api(`/api/sessions/${sessionId}/start`, { method: 'POST' });
    setMessage('세션 시작: 학생들이 문제집을 풀이할 수 있습니다.');
  };

  const closeSession = async () => {
    if (!sessionId) return;
    await api(`/api/sessions/${sessionId}/close`, { method: 'POST' });
    setMessage('세션 마감 완료');
  };

  const reopenSession = async () => {
    if (!sessionId) return;
    await api(`/api/sessions/${sessionId}/reopen`, { method: 'POST' });
    setMessage('세션 재개 완료');
  };

  const analysis = useMemo(() => {
    const totalStudents = sessionState?.progress.totalStudents ?? 0;
    return (sessionState?.questionSet ?? []).map((q) => {
      const totalAnswered = students.length === 0 ? 0 : students.length;
      return { q, totalAnswered, totalStudents };
    });
  }, [sessionState, students]);

  return (
    <main className="page">
      <h1>교사용 문제집 관리</h1>
      {message && <p className="notice">{message}</p>}

      <section className="card">
        <h2>세션 생성 / 불러오기</h2>
        <input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="예: 중3 함수 형성평가" />
        <button onClick={createSession}>새 세션 만들기</button>
        <input type="number" placeholder="세션 ID 입력 후 Enter" onKeyDown={(e) => e.key === 'Enter' && loadSession(Number((e.target as HTMLInputElement).value))} />
      </section>

      {sessionState && (
        <>
          <section className="card">
            <h2>B. 세션 제어 / 진행 현황</h2>
            <p>세션명: <b>{sessionState.session.name}</b></p>
            <p>입장코드: <b>{sessionState.session.joinCode}</b></p>
            <p>상태: <b>{sessionState.session.status}</b></p>
            <p>제출 진행: {sessionState.progress.submittedStudents} / {sessionState.progress.totalStudents}</p>
            <p>미제출 학생: {sessionState.progress.notSubmitted.map((s) => s.displayName).join(', ') || '없음'}</p>
            <div className="row">
              <button onClick={startSession}>세션 시작</button>
              <button onClick={closeSession}>세션 마감</button>
              <button onClick={reopenSession}>세션 재개</button>
              <button onClick={() => window.open(`/api/sessions/${sessionState.session.id}/export`, '_blank')}>CSV 내보내기</button>
            </div>
            <QRCodeSVG value={`${window.location.origin}/student`} size={120} />
          </section>

          <section className="grid2">
            <div className="card">
              <h2>A. 문제집 편집기</h2>
              <textarea placeholder="문항(문제)" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
              {form.options.map((opt, idx) => (
                <input
                  key={idx}
                  value={opt}
                  onChange={(e) => {
                    const next = [...form.options];
                    next[idx] = e.target.value;
                    setForm({ ...form, options: next });
                  }}
                />
              ))}
              <div className="row">
                <button onClick={() => form.options.length < 5 && setForm({ ...form, options: [...form.options, `선택지 ${form.options.length + 1}`] })}>선택지 +</button>
                <button onClick={() => form.options.length > 2 && setForm({ ...form, options: form.options.slice(0, -1) })}>선택지 -</button>
              </div>
              <label>정답 인덱스 <input type="number" value={form.correctOptionIndex} onChange={(e) => setForm({ ...form, correctOptionIndex: Number(e.target.value) })} /></label>
              <label>배점 <input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} /></label>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              <button onClick={saveQuestion}>{editingQuestion ? '문항 수정 저장' : '문항 추가'}</button>
            </div>

            <div className="card">
              <h2>문항 목록</h2>
              {sessionState.questionSet.map((q) => (
                <div key={q.id} className="item">
                  <strong>#{q.orderInSession} {q.prompt}</strong>
                  <small>배점 {q.weight}점</small>
                  <div className="row">
                    <button onClick={() => moveQuestion(q.id, -1)}>위로</button>
                    <button onClick={() => moveQuestion(q.id, 1)}>아래로</button>
                    <button onClick={() => editQuestion(q)}>수정</button>
                    <button onClick={() => deleteQuestion(q.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>C. 결과 / 리뷰</h2>
            <h3>학생 점수</h3>
            <ul>
              {sessionState.leaderboard.map((row) => (
                <li key={row.id}>{row.displayName}: {row.totalScore}점</li>
              ))}
            </ul>
            <h3>문항별 검토</h3>
            <ul>
              {analysis.map((a) => (
                <li key={a.q.id}>문항 #{a.q.orderInSession} - 응답자 {a.totalAnswered} / 등록학생 {a.totalStudents}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
