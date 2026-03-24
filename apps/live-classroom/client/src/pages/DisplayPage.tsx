import { useEffect, useState } from 'react';
import { socket } from '../api/socket';
import type { TeacherState } from '../types';

export function DisplayPage() {
  const [sessionId, setSessionId] = useState(1);
  const [state, setState] = useState<TeacherState | null>(null);

  useEffect(() => {
    const onState = (payload: TeacherState) => setState(payload);
    socket.emit('session:joinRoom', { sessionId, role: 'teacher' });
    socket.on('teacher:stateUpdated', onState);
    return () => socket.off('teacher:stateUpdated', onState);
  }, [sessionId]);

  return (
    <main className="page display">
      <h1>라이브 스코어 보드</h1>
      <input type="number" value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))} />
      <p>상태: {state?.session.status} / 문항 {state?.session.currentQuestionOrder}</p>
      <div className="card">
        {(state?.leaderboard ?? []).map((s, idx) => (
          <div key={s.id} className="race-row">
            <span>{idx + 1}. {s.displayName}</span>
            <div className="race-track"><div className="race-runner" style={{ width: `${Math.min(100, s.totalScore / 10)}%` }}>🐎 {s.totalScore}</div></div>
          </div>
        ))}
      </div>
    </main>
  );
}
