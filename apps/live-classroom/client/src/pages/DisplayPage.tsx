import { useEffect, useState } from 'react';
import { socket } from '../api/socket';
import type { SessionStatePayload } from '../types';

export function DisplayPage() {
  const [sessionId, setSessionId] = useState<number>(1);
  const [state, setState] = useState<SessionStatePayload | null>(null);

  useEffect(() => {
    const onState = (payload: SessionStatePayload) => setState(payload);
    socket.emit('session:joinRoom', { sessionId });
    socket.on('session:stateUpdated', onState);
    return () => socket.off('session:stateUpdated', onState);
  }, [sessionId]);

  return (
    <main className="page display">
      <h1>수업 현황 화면</h1>
      <label>세션 ID <input type="number" value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))} /></label>
      <p>세션 상태: {state?.session.status ?? '-'}</p>
      <p>제출 진행: {state?.progress.submittedStudents ?? 0} / {state?.progress.totalStudents ?? 0}</p>
      <div className="card">
        <h2>상위 점수</h2>
        <ol>
          {(state?.leaderboard ?? []).slice(0, 5).map((s) => <li key={s.id}>{s.displayName} - {s.totalScore}점</li>)}
        </ol>
      </div>
    </main>
  );
}
