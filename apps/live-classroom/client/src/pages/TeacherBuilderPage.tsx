import { useState } from 'react';
import { api } from '../api/http';
import type { Question, TeacherState } from '../types';

function parseOptions(json: string): string[] {
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : []; } catch { return []; }
}

export function TeacherBuilderPage() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<TeacherState | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [form, setForm] = useState({ prompt: '', options: ['선택지 1', '선택지 2'], correctOptionIndex: 0, weight: 100, timeLimitSeconds: 20 });
  const [imageFile, setImageFile] = useState<File | null>(null);

  const loadSession = async (id: number) => {
    const data = await api<TeacherState>(`/api/sessions/${id}`);
    setSessionId(id);
    setState(data);
  };

  const createSession = async () => {
    const s = await api<any>('/api/sessions', { method: 'POST', body: JSON.stringify({ name: sessionName }) });
    await loadSession(s.id);
  };

  const saveQuestion = async () => {
    if (!sessionId) return;
    const fd = new FormData();
    fd.append('sessionId', String(sessionId));
    fd.append('prompt', form.prompt);
    fd.append('options', JSON.stringify(form.options));
    fd.append('correctOptionIndex', String(form.correctOptionIndex));
    fd.append('weight', String(form.weight));
    fd.append('timeLimitSeconds', String(form.timeLimitSeconds));
    if (imageFile) fd.append('image', imageFile);
    await fetch('/api/questions', { method: 'POST', body: fd });
    await loadSession(sessionId);
    setForm({ prompt: '', options: ['선택지 1', '선택지 2'], correctOptionIndex: 0, weight: 100, timeLimitSeconds: 20 });
  };

  const deleteQuestion = async (id: number) => {
    await api(`/api/questions/${id}`, { method: 'DELETE' });
    if (sessionId) await loadSession(sessionId);
  };

  const move = async (id: number, d: -1 | 1) => {
    const list = [...(state?.questionSet ?? [])];
    const i = list.findIndex((q) => q.id === id);
    const t = i + d;
    if (i < 0 || t < 0 || t >= list.length) return;
    [list[i], list[t]] = [list[t], list[i]];
    await api('/api/questions/reorder', { method: 'POST', body: JSON.stringify({ sessionId, questionIds: list.map((x) => x.id) }) });
    if (sessionId) await loadSession(sessionId);
  };

  return (
    <main className="page">
      <h1>교사 워크시트 빌더</h1>
      <a href="/teacher/live">라이브 진행 화면으로 이동</a>
      <section className="card">
        <h2>워크시트 생성/불러오기</h2>
        <input placeholder="워크시트 이름" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
        <button onClick={createSession}>워크시트 생성</button>
        <input type="number" placeholder="세션 ID (Enter)" onKeyDown={(e) => e.key === 'Enter' && loadSession(Number((e.target as HTMLInputElement).value))} />
      </section>

      {state && (
        <>
          <section className="card">
            <h2>문항 추가</h2>
            <textarea placeholder="문항" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            {form.options.map((op, idx) => (
              <input key={idx} value={op} onChange={(e) => { const n=[...form.options]; n[idx]=e.target.value; setForm({ ...form, options:n}); }} />
            ))}
            <div className="row">
              <button onClick={() => form.options.length < 5 && setForm({ ...form, options: [...form.options, `선택지 ${form.options.length + 1}`] })}>선택지+</button>
              <button onClick={() => form.options.length > 2 && setForm({ ...form, options: form.options.slice(0,-1) })}>선택지-</button>
            </div>
            <label>정답 인덱스 <input type="number" value={form.correctOptionIndex} onChange={(e)=>setForm({...form,correctOptionIndex:Number(e.target.value)})} /></label>
            <label>배점 <input type="number" value={form.weight} onChange={(e)=>setForm({...form,weight:Number(e.target.value)})} /></label>
            <label>제한시간(초) <input type="number" value={form.timeLimitSeconds} onChange={(e)=>setForm({...form,timeLimitSeconds:Number(e.target.value)})} /></label>
            <input type="file" accept="image/*" onChange={(e)=>setImageFile(e.target.files?.[0] ?? null)} />
            <button onClick={saveQuestion}>문항 저장</button>
          </section>

          <section className="card">
            <h2>문항 목록</h2>
            {state.questionSet.map((q: Question) => (
              <div className="item" key={q.id}>
                <strong>#{q.orderInSession} {q.prompt}</strong>
                <small>배점 {q.weight} / {q.timeLimitSeconds}초</small>
                <small>선택지: {parseOptions(q.optionsJson).join(' / ')}</small>
                <div className="row">
                  <button onClick={() => move(q.id, -1)}>위</button>
                  <button onClick={() => move(q.id, 1)}>아래</button>
                  <button onClick={() => deleteQuestion(q.id)}>삭제</button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
