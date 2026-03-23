import { useEffect, useMemo, useState } from 'react';
import { socket } from '../api/socket';
import { LeaderboardChart } from '../components/LeaderboardChart';
import { PollChart } from '../components/PollChart';
import type { Poll, Question, Session } from '../types';

interface StatePayload {
  session: Session;
  currentQuestion: Question | null;
  currentPoll: Poll | null;
  leaderboard: Array<{ id: number; displayName: string; totalScore: number }>;
}

export function DisplayPage() {
  const [sessionId, setSessionId] = useState<number>(1);
  const [state, setState] = useState<StatePayload | null>(null);
  const [counts, setCounts] = useState<Array<{ selectedOptionIndex: number; count: number }>>([]);

  useEffect(() => {
    socket.emit('session:joinRoom', { sessionId });
    socket.on('display:stateUpdated', (payload: StatePayload) => setState(payload));
    socket.on('question:responseCountUpdated', (payload) => setCounts(payload.counts));
    socket.on('poll:resultsUpdated', (payload) => setCounts(payload.counts));
    return () => {
      socket.off('display:stateUpdated');
      socket.off('question:responseCountUpdated');
      socket.off('poll:resultsUpdated');
    };
  }, [sessionId]);

  const options = useMemo(() => {
    if (state?.currentQuestion) return JSON.parse(state.currentQuestion.optionsJson);
    if (state?.currentPoll) return JSON.parse(state.currentPoll.optionsJson);
    return [];
  }, [state]);

  return (
    <main className="page display">
      <h1>디스플레이 화면</h1>
      <label>세션 ID <input type="number" value={sessionId} onChange={(e) => setSessionId(Number(e.target.value))} /></label>
      {state?.currentQuestion && (
        <section className="card">
          <h2>{state.currentQuestion.title}</h2>
          {state.currentQuestion.imagePath && <img src={state.currentQuestion.imagePath} className="display-image" />}
        </section>
      )}
      {(state?.currentQuestion || state?.currentPoll) && <PollChart options={options} counts={counts} />}
      <LeaderboardChart data={state?.leaderboard ?? []} />
    </main>
  );
}
