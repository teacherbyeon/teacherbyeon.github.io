import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api/http';
import { socket } from '../api/socket';
import { LatexMixedText } from '../components/LatexMixedText';
import type { TeacherState } from '../types';
import { useSearchParams } from 'react-router-dom';

export function TeacherLivePage() {
  const [searchParams] = useSearchParams();
  const initialId = Number(searchParams.get('sessionId') || 1);
  const [sessionId, setSessionId] = useState<number>(initialId);
  const [state, setState] = useState<TeacherState | null>(null);

  useEffect(() => {
    const onState = (payload: TeacherState) => setState(payload);
    socket.emit('session:joinRoom', { sessionId, role: 'teacher' });
    socket.on('teacher:stateUpdated', onState);
    return () => socket.off('teacher:stateUpdated', onState);
  }, [sessionId]);

  const refresh = async () => setState(await api<TeacherState>(`/api/sessions/${sessionId}`));

  const remain = useMemo(() => {
    if (!state?.session.questionDeadlineAt) return 0;
    return Math.max(0, Math.ceil((new Date(state.session.questionDeadlineAt).getTime() - Date.now()) / 1000));
  }, [state]);

  return (
    <main className="page">
      <h1>교사 라이브 진행 화면</h1>
      <a href="/teacher/builder">워크시트 빌더로 이동</a>
      <div className="row">
        <input type="number" value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))} />
        <button className="inline-btn" onClick={refresh}>불러오기</button>
        <button
          className="inline-btn"
          onClick={() => window.open(`/display?sessionId=${sessionId}`, 'raceBoard', 'width=1200,height=800')}
        >
          레이스 보드 팝업
        </button>
      </div>

      {state && (
        <>
          <section className="card">
            <h2>세션 제어</h2>
            <p>세션명: <b>{state.session.name}</b></p>
            <p>코드: <b>{state.session.joinCode}</b></p>
            <p>상태: <b>{state.session.status}</b></p>
            <p>현재 문항: {state.session.currentQuestionOrder || '-'} / {state.questionSet.length}</p>
            <p>문항 상태: {state.session.questionState} {state.session.questionState === 'revealed' && `(남은 ${remain}s)`}</p>
            <p>참여/응답: {state.progress.joinedStudents}명 / 현재문항 응답 {state.progress.respondedCurrent}명</p>
            <div className="row">
              <button onClick={() => api(`/api/sessions/${sessionId}/start`, { method: 'POST' })}>세션 시작</button>
              <button onClick={() => api(`/api/sessions/${sessionId}/reveal-next`, { method: 'POST' })}>다음 문항 공개</button>
              <button onClick={() => api(`/api/sessions/${sessionId}/close-current`, { method: 'POST' })}>현재 문항 종료</button>
              <button onClick={() => api(`/api/sessions/${sessionId}/finish`, { method: 'POST' })}>세션 종료</button>
            </div>
            <QRCodeSVG value={`${window.location.origin}/student`} size={120} />
          </section>

          <section className="card">
            <h2>현재 공개 문항</h2>
            {state.currentQuestion ? (
              <>
                <LatexMixedText text={state.currentQuestion.prompt} />
                {state.currentQuestion.imagePath && <img src={state.currentQuestion.imagePath} className="question-image" />}
              </>
            ) : <p>아직 공개된 문항이 없습니다.</p>}
            <p>미응답: {state.progress.notResponded.map((s) => s.displayName).join(', ') || '없음'}</p>
          </section>

          <section className="card">
            <h2>실시간 레이스 보드</h2>
            {(state.leaderboard ?? []).map((s, idx) => (
              <div key={s.id} className="race-row">
                <span>{idx + 1}. {s.displayName}</span>
                <div className="race-track"><div className="race-runner" style={{ width: `${Math.min(100, s.totalScore / 10)}%` }}>🏇 {s.totalScore}</div></div>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
