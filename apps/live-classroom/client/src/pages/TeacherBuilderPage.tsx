import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http';
import { LatexMixedText } from '../components/LatexMixedText';
import type { Question, TeacherState } from '../types';
import { useNavigate } from 'react-router-dom';

function parseOptions(json: string): string[] {
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : []; } catch { return []; }
}

const formulaButtons = [
  { label: '분수', latex: '$\\frac{a}{b}$' },
  { label: '루트', latex: '$\\sqrt{x}$' },
  { label: '제곱', latex: '$x^2$' },
  { label: '아래첨자', latex: '$x_{1}$' },
  { label: '시그마', latex: '$\\sum_{i=1}^{n}$' },
  { label: '적분', latex: '$\\int_a^b f(x)dx$' }
];

type FocusTarget = { kind: 'prompt' } | { kind: 'option'; index: number };

export function TeacherBuilderPage() {
  const navigate = useNavigate();
  const [worksheets, setWorksheets] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<TeacherState | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [error, setError] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [form, setForm] = useState({ prompt: '', options: ['선택지 1', '선택지 2'], correctOptionIndex: 0, weight: 100, timeLimitSeconds: 20 });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pastedImageDataUrl, setPastedImageDataUrl] = useState<string>('');
  const [focusTarget, setFocusTarget] = useState<FocusTarget>({ kind: 'prompt' });

  const imagePreviewUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : pastedImageDataUrl), [imageFile, pastedImageDataUrl]);

  const resetForm = () => {
    setEditingQuestionId(null);
    setForm({ prompt: '', options: ['선택지 1', '선택지 2'], correctOptionIndex: 0, weight: 100, timeLimitSeconds: 20 });
    setImageFile(null);
    setPastedImageDataUrl('');
  };

  const loadWorksheets = async () => setWorksheets(await api<any[]>('/api/sessions'));

  useEffect(() => {
    void loadWorksheets();
  }, []);

  const loadSession = async (id: number) => {
    const data = await api<TeacherState>(`/api/sessions/${id}`);
    setSessionId(id);
    setState(data);
    setError('');
  };

  const createSession = async () => {
    try {
      const s = await api<any>('/api/sessions', { method: 'POST', body: JSON.stringify({ name: sessionName.trim() }) });
      await loadWorksheets();
      await loadSession(s.id);
    } catch (e) {
      setError('동일한 워크시트 이름이 이미 있습니다. 다른 이름을 사용하세요.');
    }
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
    if (pastedImageDataUrl) fd.append('pastedImageDataUrl', pastedImageDataUrl);

    if (editingQuestionId) {
      await fetch(`/api/questions/${editingQuestionId}`, { method: 'PUT', body: fd });
    } else {
      await fetch('/api/questions', { method: 'POST', body: fd });
    }
    await loadSession(sessionId);
    resetForm();
  };

  const beginEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setForm({
      prompt: q.prompt,
      options: parseOptions(q.optionsJson),
      correctOptionIndex: q.correctOptionIndex,
      weight: q.weight,
      timeLimitSeconds: q.timeLimitSeconds
    });
    setImageFile(null);
    setPastedImageDataUrl('');
  };

  const deleteQuestion = async (id: number) => {
    await api(`/api/questions/${id}`, { method: 'DELETE' });
    if (sessionId) await loadSession(sessionId);
  };

  const deleteWorksheet = async (id: number) => {
    await api(`/api/sessions/${id}`, { method: 'DELETE' });
    if (sessionId === id) {
      setSessionId(null);
      setState(null);
    }
    await loadWorksheets();
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

  const insertFormula = (latex: string) => {
    if (focusTarget.kind === 'prompt') {
      setForm((prev) => ({ ...prev, prompt: `${prev.prompt} ${latex}`.trim() }));
      return;
    }
    setForm((prev) => {
      const options = [...prev.options];
      options[focusTarget.index] = `${options[focusTarget.index]} ${latex}`.trim();
      return { ...prev, options };
    });
  };

  const handlePasteImage: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          setImageFile(new File([blob], `paste-${Date.now()}.png`, { type: blob.type || 'image/png' }));
          const reader = new FileReader();
          reader.onload = () => setPastedImageDataUrl(String(reader.result || ''));
          reader.readAsDataURL(blob);
          e.preventDefault();
          return;
        }
      }
    }
  };

  return (
    <main className="page" onPaste={handlePasteImage}>
      <h1>교사 워크시트 빌더</h1>
      <a href="/teacher/live">라이브 진행 화면으로 이동</a>

      <section className="card">
        <h2>워크시트 관리</h2>
        <div className="row">
          <input placeholder="새 워크시트 이름" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
          <button onClick={createSession}>워크시트 생성</button>
          <button onClick={loadWorksheets}>목록 새로고침</button>
        </div>
        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        <ul>
          {worksheets.map((w) => (
            <li key={w.id} className="worksheet-row">
              <button className="worksheet-name-btn" onClick={() => loadSession(w.id)}>
                {w.name} (문항 {w.questionCount})
              </button>
              <button className="inline-btn" onClick={() => navigate(`/teacher/live?sessionId=${w.id}`)}>라이브</button>
              <button className="inline-btn danger-btn" onClick={() => deleteWorksheet(w.id)}>삭제</button>
            </li>
          ))}
        </ul>
      </section>

      {state && (
        <>
          <section className="card">
            <h2>{state.session.name} 문항 편집</h2>
            <small>팁: PC 캡처 이미지를 Ctrl+V로 붙여넣으면 자동 첨부됩니다.</small>
            <textarea
              placeholder="문항 (예: $\\frac{1}{2}x^2$)"
              value={form.prompt}
              onFocus={() => setFocusTarget({ kind: 'prompt' })}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
            <div className="preview-box"><b>문항 미리보기</b><LatexMixedText text={form.prompt} /></div>

            {form.options.map((op, idx) => (
              <div key={idx} className="option-edit">
                <label>선택지 {idx + 1}</label>
                <input
                  value={op}
                  onFocus={() => setFocusTarget({ kind: 'option', index: idx })}
                  onChange={(e) => { const n=[...form.options]; n[idx]=e.target.value; setForm({ ...form, options:n }); }}
                />
                <div className="preview-box"><LatexMixedText text={op} /></div>
              </div>
            ))}

            <div className="formula-panel">
              {formulaButtons.map((f) => <button key={f.label} type="button" onClick={() => insertFormula(f.latex)}>{f.label}</button>)}
            </div>

            <div className="row">
              <button onClick={() => form.options.length < 5 && setForm({ ...form, options: [...form.options, `선택지 ${form.options.length + 1}`] })}>선택지+</button>
              <button onClick={() => form.options.length > 2 && setForm({ ...form, options: form.options.slice(0, -1) })}>선택지-</button>
            </div>

            <label>정답 인덱스 <input type="number" value={form.correctOptionIndex} onChange={(e) => setForm({ ...form, correctOptionIndex: Number(e.target.value) })} /></label>
            <label>배점 <input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} /></label>
            <label>제한시간(초) <input type="number" value={form.timeLimitSeconds} onChange={(e) => setForm({ ...form, timeLimitSeconds: Number(e.target.value) })} /></label>
            {imagePreviewUrl && <img src={imagePreviewUrl} className="question-image" />}
            <div className="row">
              <button onClick={saveQuestion}>{editingQuestionId ? '문항 수정 저장' : '문항 저장'}</button>
              {editingQuestionId && <button onClick={resetForm}>수정 취소</button>}
            </div>
          </section>

          <section className="card">
            <h2>문항 목록</h2>
            {state.questionSet.map((q: Question) => (
              <div className="item" key={q.id}>
                <strong>#{q.orderInSession}</strong>
                <LatexMixedText text={q.prompt} />
                {q.imagePath && <img src={q.imagePath} className="question-image" />}
                <small>배점 {q.weight} / {q.timeLimitSeconds}초</small>
                {parseOptions(q.optionsJson).map((opt, idx) => (
                  <div key={idx}><b>{idx + 1})</b> <LatexMixedText text={opt} /></div>
                ))}
                <div className="row">
                  <button onClick={() => move(q.id, -1)}>위</button>
                  <button onClick={() => move(q.id, 1)}>아래</button>
                  <button onClick={() => beginEditQuestion(q)}>수정</button>
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
