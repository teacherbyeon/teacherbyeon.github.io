import { useEffect, useState } from 'react';
import { joinSessionRoom, socket, subscribeSocketStatus } from '../api/socket';
import type { TeacherState } from '../types';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/http';

export function DisplayPage() {
  const [searchParams] = useSearchParams();
  const initialId = Number(searchParams.get('sessionId') || 1);
  const [sessionId, setSessionId] = useState(initialId);
  const [state, setState] = useState<TeacherState | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    setState(await api<TeacherState>(`/api/sessions/${sessionId}`));
  };

  useEffect(() => {
    const onState = (payload: TeacherState) => setState(payload);
    joinSessionRoom({ sessionId, role: 'teacher' });
    socket.on('teacher:stateUpdated', onState);
    const unsub = subscribeSocketStatus((status) => {
      if (status === 'connected') {
        setNotice('다시 연결되었습니다.');
        void refresh();
      }
      if (status === 'reconnecting' || status === 'disconnected') {
        setNotice('연결이 불안정하여 상태를 다시 불러오는 중...');
      }
    });
    void refresh();
    return () => {
      socket.off('teacher:stateUpdated', onState);
      unsub();
    };
  }, [sessionId]);

  return (
    <main className="page display">
      <h1>라이브 스코어 보드</h1>
      <input type="number" value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))} />
      {notice && <p>{notice}</p>}
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
