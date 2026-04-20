import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  GameSettings,
  HostStateView,
  ParticipantStateView,
  TileValue,
  ServerEventMap,
  ClientEventMap
} from './types';

const defaultDeckConfig: Record<string, number> = (() => {
  const cfg: Record<string, number> = {};
  for (let i = 1; i <= 10; i += 1) cfg[String(i)] = 1;
  for (let i = 11; i <= 19; i += 1) cfg[String(i)] = 2;
  for (let i = 20; i <= 30; i += 1) cfg[String(i)] = 1;
  cfg.J = 1;
  return cfg;
})();

const emptySettings: GameSettings = {
  boardSize: 20,
  includeJoker: true,
  animationOn: true,
  soundOn: false,
  deckConfig: defaultDeckConfig
};

type Role = 'select' | 'host-login' | 'host-setup' | 'host-game' | 'participant-join' | 'participant-game';

const socketUrl = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3000`;
const getSocket = (): Socket<ServerEventMap, ClientEventMap> =>
  io(socketUrl, { transports: ['websocket'], autoConnect: true, reconnection: true });

const isNumericHost = /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);
const defaultJoinUrl = localStorage.getItem('streams_join_url') ?? (isNumericHost ? window.location.origin : '');

export function App() {
  const [socket] = useState(getSocket);
  const [role, setRole] = useState<Role>('select');
  const [pin, setPin] = useState('');
  const [nickname, setNickname] = useState('');
  const [participantId, setParticipantId] = useState(localStorage.getItem('streams_pid') ?? '');
  const [joinUrl, setJoinUrl] = useState(defaultJoinUrl);
  const [settings, setSettings] = useState<GameSettings>(emptySettings);
  const [hostState, setHostState] = useState<HostStateView | null>(null);
  const [participantState, setParticipantState] = useState<ParticipantStateView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    socket.on('host:login:ok', () => {
      setRole('host-setup');
      setError('');
    });
    socket.on('host:login:error', ({ message }) => setError(message));
    socket.on('state:host', (s) => {
      setHostState(s);
      if (s.game.settings) setSettings(s.game.settings);
      setRole('host-game');
    });
    socket.on('state:participant', (s) => {
      setParticipantState(s);
      setRole('participant-game');
    });
    socket.on('participant:join:ok', ({ participantId: id }) => {
      setParticipantId(id);
      localStorage.setItem('streams_pid', id);
      setError('');
    });
    socket.on('participant:join:error', ({ message }) => setError(message));
    socket.on('room:ended', () => {
      setHostState(null);
      setParticipantState(null);
      setRole('select');
      setError('게임이 종료되었습니다.');
    });
    socket.on('server:error', ({ message }) => setError(message));

    return () => socket.removeAllListeners();
  }, [socket]);

  const participantsDeckTotal = useMemo(
    () => Object.entries(settings.deckConfig).reduce((sum, [key, count]) => {
      if (key === 'J' && !settings.includeJoker) return sum;
      return sum + Math.max(0, count);
    }, 0),
    [settings.deckConfig, settings.includeJoker]
  );

  const qrImageUrl = useMemo(() => {
    const safe = joinUrl.trim();
    if (!safe) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(safe)}`;
  }, [joinUrl]);

  const handleHostLogin = () => {
    setError('');
    socket.emit('host:login', { pin });
  };

  const startHostGame = (isNew = false) => {
    localStorage.setItem('streams_join_url', joinUrl.trim());
    if (isNew) socket.emit('host:new-game', { settings });
    else socket.emit('host:start-game', { settings });
  };

  const joinParticipant = () => {
    setError('');
    socket.emit('participant:join', { nickname, participantId: participantId || undefined });
  };

  const tileLabel = (v: TileValue | null) => (v === null ? '' : v === 'J' ? '🃏' : String(v));

  return (
    <main className="page">
      <h1>Streams Classroom</h1>
      {error && <p className="error">{error}</p>}

      {role === 'select' && (
        <section className="panel centered">
          <button onClick={() => setRole('host-login')}>진행자</button>
          <button onClick={() => setRole('participant-join')}>참가자</button>
        </section>
      )}

      {role === 'host-login' && (
        <section className="panel">
          <h2>진행자 PIN 로그인</h2>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN 입력" />
          <div className="row">
            <button onClick={handleHostLogin}>로그인</button>
            <button className="ghost" onClick={() => setRole('select')}>뒤로</button>
          </div>
        </section>
      )}

      {role === 'host-setup' && (
        <section className="panel">
          <h2>게임 설정 (20칸 고정)</h2>
          <h3>조커 포함 여부</h3>
          <label>
            <input
              type="checkbox"
              checked={settings.includeJoker}
              onChange={(e) => setSettings((p) => ({ ...p, includeJoker: e.target.checked }))}
            /> 조커 포함 (기본 ON)
          </label>
          <label><input type="checkbox" checked={settings.animationOn} onChange={(e) => setSettings((p) => ({ ...p, animationOn: e.target.checked }))} /> 숫자 뽑기 애니메이션 ON</label>
          <label><input type="checkbox" checked={settings.soundOn} onChange={(e) => setSettings((p) => ({ ...p, soundOn: e.target.checked }))} /> 숫자 뽑기 사운드 ON</label>

          <h3>참가자 접속 URL (숫자 IP 권장)</h3>
          <input
            value={joinUrl}
            onChange={(e) => setJoinUrl(e.target.value)}
            placeholder="예: http://192.168.0.15:5173"
            style={{ width: '100%', marginBottom: 8 }}
          />

          <div className="deck-grid">
            {Object.keys(settings.deckConfig).map((k) => (
              <label key={k}>{k}
                <input
                  type="number"
                  min={0}
                  value={settings.deckConfig[k]}
                  disabled={k === 'J' && !settings.includeJoker}
                  onChange={(e) => setSettings((p) => ({
                    ...p,
                    deckConfig: { ...p.deckConfig, [k]: Math.max(0, Number(e.target.value) || 0) }
                  }))}
                />
              </label>
            ))}
          </div>
          <p>실제 사용 덱 수: {participantsDeckTotal} {settings.includeJoker ? '(조커 포함 가능)' : '(조커 제외)'}</p>
          <button onClick={() => startHostGame(false)}>게임 시작</button>
        </section>
      )}

      {role === 'host-game' && hostState && (
        <section className="panel">
          <h2>진행자 화면</h2>
          <p>라운드: {hostState.game.round} / {hostState.game.totalRounds}</p>
          <p>조커 옵션: {hostState.game.settings?.includeJoker ? '포함' : '미포함'}</p>
          <label>
            <input
              type="checkbox"
              checked={settings.includeJoker}
              onChange={(e) => setSettings((p) => ({ ...p, includeJoker: e.target.checked }))}
            /> 다음 새 게임에 조커 포함
          </label>
          <p className="big">{tileLabel(hostState.game.currentNumber) || '대기'}</p>
          <p>남은 숫자: {hostState.game.remainingDraws}</p>

          <div className="qr-wrap">
            <div>
              <strong>학생 접속 URL</strong>
              <p>{joinUrl || '숫자 IP URL을 설정하세요.'}</p>
            </div>
            {qrImageUrl && <img src={qrImageUrl} alt="학생 접속 QR 코드" width={220} height={220} />}
          </div>

          <div className="row">
            <button onClick={() => socket.emit('host:draw')}>뽑기</button>
            <button onClick={() => socket.emit('host:rewind')}>되감기</button>
            <button onClick={() => startHostGame(true)}>새 게임 시작</button>
            <button className="danger" onClick={() => socket.emit('host:end-room')}>게임 끝</button>
          </div>
          <h3>접속자 목록 (점수 높은 순)</h3>
          <table>
            <thead><tr><th>닉네임</th><th>점수</th><th>연결</th><th>배치</th><th>재접속</th><th>최근활동</th></tr></thead>
            <tbody>
              {hostState.participants.map((p) => (
                <tr key={p.id}>
                  <td>{p.nickname}</td><td>{p.score}</td><td>{p.connected ? '연결됨' : '끊김'}</td>
                  <td>{p.submitted ? '배치완료' : p.hasTempPlacement ? '임시배치' : '대기'}</td>
                  <td>{p.reconnectCount}</td><td>{new Date(p.lastSeenAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {role === 'participant-join' && (
        <section className="panel">
          <h2>참가자 입장</h2>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="별명" />
          <div className="row">
            <button onClick={joinParticipant}>입장</button>
            <button className="ghost" onClick={() => setRole('select')}>뒤로</button>
          </div>
        </section>
      )}

      {role === 'participant-game' && participantState && (
        <section className="panel">
          <h2>참가자 화면</h2>
          <p className="big">{tileLabel(participantState.game.currentNumber) || '대기'}</p>
          <p>남은 칸 수: {participantState.game.remainingSlots}</p>
          <p>라운드: {participantState.game.round}/{participantState.game.totalRounds}</p>
          <p>연결 상태: {participantState.connected ? '연결됨' : '재접속 중'}</p>
          <p>상태: {participantState.game.submitted ? '배치 완료' : participantState.game.tempPlacementIndex !== null ? '임시 배치 중' : '대기'}</p>
          <div className="board">
            {participantState.game.board.map((value, index) => (
              <button
                className={`cell ${participantState.game.tempPlacementIndex === index ? 'temp' : ''}`}
                key={index}
                onClick={() => socket.emit('participant:place-temp', { participantId: participantState.participantId, index })}
              >
                <span className="cell-index">{index + 1}</span>
                <span className="cell-value">{tileLabel(value)}</span>
              </button>
            ))}
          </div>
          <p>{participantState.game.message}</p>
          <p>현재 점수: {participantState.game.score}</p>
        </section>
      )}
    </main>
  );
}
