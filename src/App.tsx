import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

type Action = 'charge' | 'shield' | 'blast';
type GameStatus = 'lobby' | 'choosing' | 'revealing' | 'result' | 'gameOver';
type WordMode = 'kids' | 'cowboy';
type Role = 'landing' | 'host-login' | 'host' | 'player-join' | 'player';

type PublicPlayer = {
  playerId: string;
  name: string;
  connected: boolean;
  energy: number;
  score: number;
  hasChoice: boolean;
};

type RoundResult = {
  turn: number;
  playerAId: string;
  playerBId: string;
  playerAName: string;
  playerBName: string;
  scoreAAfter: number;
  scoreBAfter: number;
  energyAAfter: number;
  energyBAfter: number;
  summary: string;
  actionA?: Action;
  actionB?: Action;
};

type HostState = {
  players: PublicPlayer[];
  game: {
    turn: number;
    targetScore: number;
    mode: WordMode;
    status: GameStatus;
    revealAt: number | null;
    lastResult: RoundResult | null;
    history: RoundResult[];
  };
};

type PlayerState = {
  me: PublicPlayer | null;
  other: PublicPlayer | null;
  game: HostState['game'];
};

const actionLabels = {
  kids: {
    charge: '충전',
    shield: '방패',
    blast: '발사',
    chargeDesc: '에너지 +3',
    shieldDesc: '상대 발사를 막아요',
    blastDesc: '에너지 1개 사용'
  },
  cowboy: {
    charge: '장전',
    shield: '방어',
    blast: '빵야',
    chargeDesc: '총알 +3',
    shieldDesc: '상대 빵야를 막아요',
    blastDesc: '총알 1개 사용'
  }
};

const getServerUrl = () => {
  const { protocol, hostname, port } = window.location;
  if (port === '5173') {
    return `${protocol}//${hostname}:3000`;
  }
  return window.location.origin;
};

const url = getServerUrl();
const socket: Socket = io(url, { transports: ['websocket', 'polling'] });

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [role, setRole] = useState<Role>('landing');
  const [hostPin, setHostPin] = useState(sessionStorage.getItem('cowboy_host_pin') || '1234');
  const [joinName, setJoinName] = useState(localStorage.getItem('cowboy_player_name') || '');
  const [hostState, setHostState] = useState<HostState | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);

  const playerIdFromStorage = localStorage.getItem('cowboy_player_id') || '';

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const savedPin = sessionStorage.getItem('cowboy_host_pin');
      if (savedPin) {
        socket.emit('host:login', { pin: savedPin });
      }
      const savedRole = localStorage.getItem('cowboy_role');
      const savedId = localStorage.getItem('cowboy_player_id');
      const savedName = localStorage.getItem('cowboy_player_name');
      if (savedRole === 'player' && savedId && savedName) {
        socket.emit('player:join', { playerId: savedId, name: savedName });
      }
    };

    const onDisconnect = () => setConnected(false);
    const onHostState = (data: HostState) => {
      setHostState(data);
      if (sessionStorage.getItem('cowboy_host_pin')) {
        setRole('host');
      }
    };
    const onPlayerState = (data: PlayerState) => {
      setPlayerState(data);
      if (data.me) {
        localStorage.setItem('cowboy_role', 'player');
        localStorage.setItem('cowboy_player_id', data.me.playerId);
        localStorage.setItem('cowboy_player_name', data.me.name);
        setRole('player');
      }
    };
    const onHostError = (payload: { message: string }) => setError(payload.message);
    const onPlayerError = (payload: { message: string }) => setError(payload.message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('host:state', onHostState);
    socket.on('player:state', onPlayerState);
    socket.on('host:error', onHostError);
    socket.on('player:error', onPlayerError);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('host:state', onHostState);
      socket.off('player:state', onPlayerState);
      socket.off('host:error', onHostError);
      socket.off('player:error', onPlayerError);
    };
  }, []);

  useEffect(() => {
    const revealAt = hostState?.game.revealAt ?? playerState?.game.revealAt;
    if (!revealAt) {
      setCountdown(null);
      return;
    }
    const timer = window.setInterval(() => {
      const left = Math.max(0, revealAt - Date.now());
      setCountdown(Math.ceil(left / 1000));
    }, 100);
    return () => window.clearInterval(timer);
  }, [hostState?.game.revealAt, playerState?.game.revealAt]);

  const networkUrl = useMemo(() => {
    const { protocol, hostname, port } = window.location;
    const p = port === '5173' ? '5173' : '3000';
    return `${protocol}//${hostname}:${p}`;
  }, []);

  const doHostLogin = () => {
    setError('');
    sessionStorage.setItem('cowboy_host_pin', hostPin);
    socket.emit('host:login', { pin: hostPin });
  };

  const doPlayerJoin = () => {
    setError('');
    const trimmed = joinName.trim();
    if (!trimmed) return;
    localStorage.setItem('cowboy_role', 'player');
    localStorage.setItem('cowboy_player_name', trimmed);
    socket.emit('player:join', { playerId: playerIdFromStorage || undefined, name: trimmed });
  };

  const label = (mode: WordMode, action: Action) => actionLabels[mode][action];

  const renderLanding = () => (
    <div className="card landing">
      <h1>🤠 카우보이 에너지 대결</h1>
      <p>노트북 서버를 켜고, 두 사람이 각자 폰으로 몰래 선택합니다.</p>
      <div className="btn-row">
        <button className="primary big" onClick={() => setRole('host-login')}>진행자</button>
        <button className="big" onClick={() => setRole('player-join')}>참가자</button>
      </div>
      <div className="qr-box">
        <QRCodeSVG value={networkUrl} size={160} />
        <div>
          <strong>참가자 접속 QR</strong>
          <p>{networkUrl}</p>
        </div>
      </div>
    </div>
  );

  const renderHostLogin = () => (
    <div className="card login-card">
      <h2>진행자 PIN 입력</h2>
      <input value={hostPin} onChange={(e) => setHostPin(e.target.value)} />
      <div className="btn-row">
        <button className="primary" onClick={doHostLogin}>입장</button>
        <button className="ghost" onClick={() => setRole('landing')}>뒤로</button>
      </div>
    </div>
  );

  const renderPlayerJoin = () => (
    <div className="card login-card">
      <h2>참가자 이름 입력</h2>
      <input value={joinName} onChange={(e) => setJoinName(e.target.value)} maxLength={10} />
      <div className="btn-row">
        <button className="primary" onClick={doPlayerJoin}>참가</button>
        <button className="ghost" onClick={() => setRole('landing')}>뒤로</button>
      </div>
    </div>
  );

  const renderHost = () => {
    if (!hostState) return <div className="card">상태 수신 중...</div>;
    const { players, game } = hostState;

    return (
      <div className="host-grid">
        <section className="card panel">
          <h2>진행자 화면</h2>
          <p className="muted">연결 상태: {connected ? '🟢 연결됨' : '🔴 끊김'}</p>
          <div className="qr-box">
            <QRCodeSVG value={networkUrl} size={120} />
            <div>
              <strong>참가자 접속 URL</strong>
              <p>{networkUrl}</p>
            </div>
          </div>
          <h3>참가자</h3>
          <div className="list">
            {players.map((p) => (
              <div key={p.playerId} className="list-item">
                <strong>{p.name}</strong>
                <span>{p.connected ? '접속중' : '끊김'}</span>
                <span>에너지 {p.energy}</span>
                <span>점수 {p.score}</span>
                <span>{p.hasChoice ? '선택완료' : '선택전'}</span>
              </div>
            ))}
            {players.length === 0 && <div className="list-item">참가자가 없습니다.</div>}
          </div>
        </section>

        <section className="card panel">
          <h3>현재 경기</h3>
          <div className="score-big">{players[0]?.score ?? 0} : {players[1]?.score ?? 0}</div>
          <p>상태: {game.status}</p>
          <p>턴: {game.turn}</p>
          <p>카운트다운: {countdown ?? '-'}</p>
          <div className="result-box">
            {game.lastResult
              ? <>
                  <p>{game.lastResult.playerAName} vs {game.lastResult.playerBName}</p>
                  <p>{game.lastResult.actionA ? `${label(game.mode, game.lastResult.actionA)} / ${label(game.mode, game.lastResult.actionB!)}` : '아직 비공개'}</p>
                  <p>{game.lastResult.summary}</p>
                </>
              : <p>아직 결과가 없습니다.</p>}
          </div>
          <div className="btn-col">
            <button className="primary" onClick={() => socket.emit('host:start')}>게임 시작 / 새 경기</button>
            <button onClick={() => socket.emit('host:nextTurn')} disabled={game.status !== 'result'}>다음 턴</button>
            <button onClick={() => socket.emit('host:reset')}>점수 초기화</button>
            <button className="danger" onClick={() => socket.emit('host:clearPlayers')}>참가자 모두 내보내기</button>
          </div>
          <div className="setting-line">
            <span>승리 점수</span>
            <select value={game.targetScore} onChange={(e) => socket.emit('host:setSettings', { targetScore: Number(e.target.value) })}>
              {[1, 2, 3, 5].map((v) => <option key={v} value={v}>{v}점</option>)}
            </select>
          </div>
          <div className="setting-line">
            <span>표현 모드</span>
            <select value={game.mode} onChange={(e) => socket.emit('host:setSettings', { mode: e.target.value as WordMode })}>
              <option value="kids">충전 / 방패 / 발사</option>
              <option value="cowboy">장전 / 방어 / 빵야</option>
            </select>
          </div>
          <h3>기록</h3>
          <div className="history-list">
            {game.history.slice().reverse().map((h) => (
              <div key={`${h.turn}-${h.playerAId}`} className="history-item">
                {h.turn}턴: {h.playerAName} {label(game.mode, h.actionA!)} vs {h.playerBName} {label(game.mode, h.actionB!)} → {h.summary}
              </div>
            ))}
            {game.history.length === 0 && <div className="history-item">아직 기록이 없습니다.</div>}
          </div>
        </section>
      </div>
    );
  };

  const renderPlayer = () => {
    if (!playerState) return <div className="card">상태 수신 중...</div>;
    const { me, other, game } = playerState;
    if (!me) return <div className="card">플레이어 정보가 없습니다.</div>;

    const choose = (action: Action) => socket.emit('player:choose', { action });
    const canChoose = game.status === 'choosing' && !me.hasChoice;

    return (
      <div className="card player-view">
        <h2>{me.name}</h2>
        <p className="muted">연결 상태: {connected ? '🟢 연결됨' : '🔴 끊김'}</p>
        <div className="stats-grid">
          <div className="stat"><small>내 점수</small><strong>{me.score}</strong></div>
          <div className="stat"><small>내 에너지</small><strong>{me.energy}</strong></div>
          <div className="stat"><small>상대 이름</small><strong>{other?.name ?? '-'}</strong></div>
          <div className="stat"><small>상대 점수</small><strong>{other?.score ?? 0}</strong></div>
          <div className="stat"><small>상대 에너지</small><strong>{other?.energy ?? 0}</strong></div>
          <div className="stat"><small>상대 선택</small><strong>{other?.hasChoice ? '완료' : '대기'}</strong></div>
        </div>

        <div className="choice-area">
          <button className="action-btn charge" disabled={!canChoose} onClick={() => choose('charge')}>
            {actionLabels[game.mode].charge}<span>{actionLabels[game.mode].chargeDesc}</span>
          </button>
          <button className="action-btn shield" disabled={!canChoose} onClick={() => choose('shield')}>
            {actionLabels[game.mode].shield}<span>{actionLabels[game.mode].shieldDesc}</span>
          </button>
          <button className="action-btn blast" disabled={!canChoose || me.energy <= 0} onClick={() => choose('blast')}>
            {actionLabels[game.mode].blast}<span>{actionLabels[game.mode].blastDesc}</span>
          </button>
        </div>

        {me.hasChoice && <div className="selected-panel">선택 완료! 상대에게는 보이지 않습니다.</div>}
        {game.status === 'revealing' && <div className="selected-panel">곧 결과 공개! {countdown ?? ''}</div>}
        {(game.status === 'result' || game.status === 'gameOver') && game.lastResult?.actionA && (
          <div className="result-box">
            <p>{game.lastResult.playerAName} {label(game.mode, game.lastResult.actionA)} vs {game.lastResult.playerBName} {label(game.mode, game.lastResult.actionB!)}</p>
            <p>{game.lastResult.summary}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      {error && <div className="error">{error}</div>}
      {role === 'landing' && renderLanding()}
      {role === 'host-login' && renderHostLogin()}
      {role === 'player-join' && renderPlayerJoin()}
      {role === 'host' && renderHost()}
      {role === 'player' && renderPlayer()}
    </div>
  );
}
