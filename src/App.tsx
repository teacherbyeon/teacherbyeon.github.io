import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

type Action = 'charge' | 'shield' | 'blast';
type GameStatus = 'lobby' | 'countdown' | 'choosing' | 'revealing' | 'result' | 'paused' | 'gameOver';
type WordMode = 'kids' | 'cowboy';
type Role = 'landing' | 'host-login' | 'host' | 'player-join' | 'player';

type PublicPlayer = {
  playerId: string;
  name: string;
  connected: boolean;
  energy: number;
  score: number;
  hasChoice: boolean;
  consecutiveShield: number;
  pierceTokens: number;
};

type RoundResult = {
  turn: number;
  playerAName: string;
  playerBName: string;
  summary: string;
  notes: string[];
  actionA?: Action;
  actionB?: Action;
};

type SharedGame = {
  turn: number;
  targetScore: number;
  mode: WordMode;
  status: GameStatus;
  countdownEndAt: number | null;
  resultEndAt: number | null;
  lastResult: RoundResult | null;
  history: RoundResult[];
};

type HostState = { players: PublicPlayer[]; game: SharedGame };
type PlayerState = { me: PublicPlayer | null; other: PublicPlayer | null; game: SharedGame };

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

const statusLabel: Record<GameStatus, string> = {
  lobby: '대기',
  countdown: '카운트다운',
  choosing: '선택 중',
  revealing: '결과 판정 중',
  result: '결과 공개',
  paused: '일시정지',
  gameOver: '경기 종료'
};

const getServerUrl = () => {
  const { protocol, hostname, port } = window.location;
  if (port === '5173') return `${protocol}//${hostname}:3000`;
  return window.location.origin;
};

const socket: Socket = io(getServerUrl(), { transports: ['websocket', 'polling'] });

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [role, setRole] = useState<Role>('landing');
  const [hostPin, setHostPin] = useState(sessionStorage.getItem('cowboy_host_pin') || '1234');
  const [joinName, setJoinName] = useState(localStorage.getItem('cowboy_player_name') || '');
  const [hostState, setHostState] = useState<HostState | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [error, setError] = useState('');
  const [countdownText, setCountdownText] = useState('');

  const playerIdFromStorage = localStorage.getItem('cowboy_player_id') || '';

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const savedPin = sessionStorage.getItem('cowboy_host_pin');
      if (savedPin) socket.emit('host:login', { pin: savedPin });

      const savedRole = localStorage.getItem('cowboy_role');
      const savedId = localStorage.getItem('cowboy_player_id');
      const savedName = localStorage.getItem('cowboy_player_name');
      if (savedRole === 'player' && savedId && savedName) {
        socket.emit('player:join', { playerId: savedId, name: savedName });
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', () => setConnected(false));
    socket.on('host:state', (data: HostState) => {
      setHostState(data);
      if (sessionStorage.getItem('cowboy_host_pin')) setRole('host');
    });
    socket.on('player:state', (data: PlayerState) => {
      setPlayerState(data);
      if (data.me) {
        localStorage.setItem('cowboy_role', 'player');
        localStorage.setItem('cowboy_player_id', data.me.playerId);
        localStorage.setItem('cowboy_player_name', data.me.name);
        setRole('player');
      }
    });
    socket.on('host:error', (payload: { message: string }) => setError(payload.message));
    socket.on('player:error', (payload: { message: string }) => setError(payload.message));

    if (socket.connected) onConnect();

    return () => {
      socket.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    const game = hostState?.game ?? playerState?.game;
    if (!game) return;

    const timer = window.setInterval(() => {
      if (game.status === 'countdown' && game.countdownEndAt) {
        const leftMs = Math.max(0, game.countdownEndAt - Date.now());
        const n = Math.ceil(leftMs / 1000);
        setCountdownText(leftMs <= 250 ? '선택!' : String(n));
        return;
      }
      if (game.status === 'result' && game.resultEndAt) {
        const left = Math.max(0, game.resultEndAt - Date.now());
        setCountdownText(`다음 턴까지 ${Math.ceil(left / 1000)}초`);
        return;
      }
      setCountdownText('');
    }, 100);

    return () => window.clearInterval(timer);
  }, [hostState?.game, playerState?.game]);

  const networkUrl = useMemo(() => {
    const { protocol, hostname, port } = window.location;
    const p = port === '5173' ? '5173' : '3000';
    return `${protocol}//${hostname}:${p}`;
  }, []);

  const label = (mode: WordMode, action: Action) => actionLabels[mode][action];

  const loginHost = () => {
    setError('');
    sessionStorage.setItem('cowboy_host_pin', hostPin);
    socket.emit('host:login', { pin: hostPin });
  };

  const joinPlayer = () => {
    setError('');
    const name = joinName.trim();
    if (!name) return;
    localStorage.setItem('cowboy_role', 'player');
    localStorage.setItem('cowboy_player_name', name);
    socket.emit('player:join', { playerId: playerIdFromStorage || undefined, name });
  };

  const renderLanding = () => (
    <div className="card landing">
      <h1>🤠 카우보이 에너지 대결</h1>
      <p>노트북 서버를 켜고, 두 사람이 각자 폰으로 몰래 선택합니다.</p>
      <div className="btn-row">
        <button className="primary big" onClick={() => setRole('host-login')}>진행자</button>
        <button className="big" onClick={() => setRole('player-join')}>참가자</button>
      </div>
      <div className="qr-box">
        <QRCodeSVG value={networkUrl} size={150} />
        <div>
          <strong>참가자 접속 QR</strong>
          <p>{networkUrl}</p>
        </div>
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
          <p className="muted">현재 상태: {statusLabel[game.status]}</p>
          <div className="qr-box">
            <QRCodeSVG value={networkUrl} size={110} />
            <div>
              <strong>참가자 접속 URL</strong>
              <p>{networkUrl}</p>
            </div>
          </div>

          <h3>참가자 목록</h3>
          <div className="list">
            {players.map((p) => (
              <div className="list-item" key={p.playerId}>
                <strong>{p.name}</strong>
                <span>{p.connected ? '접속중' : '끊김'}</span>
                <span>에너지 {p.energy} / 점수 {p.score}</span>
                <span>⭐ 관통권 {p.pierceTokens} / 🛡 연속방어 {p.consecutiveShield}</span>
                <span>{p.hasChoice ? '선택 완료' : '선택 전'}</span>
              </div>
            ))}
            {players.length === 0 && <div className="list-item">참가자가 없습니다.</div>}
          </div>
        </section>

        <section className="card panel">
          <h3>경기 진행</h3>
          <div className="score-big">{players[0]?.score ?? 0} : {players[1]?.score ?? 0}</div>
          <p>턴: {game.turn}</p>
          <p className="countdown">{countdownText || '-'}</p>

          <div className="result-box">
            {game.lastResult?.actionA
              ? <>
                  <p>{game.lastResult.playerAName} {label(game.mode, game.lastResult.actionA)} vs {game.lastResult.playerBName} {label(game.mode, game.lastResult.actionB!)}</p>
                  <p>{game.lastResult.summary}</p>
                  {game.lastResult.notes.map((note, idx) => <p key={idx}>• {note}</p>)}
                </>
              : <p>결과 대기 중</p>}
          </div>

          <div className="btn-col">
            <button className="primary" onClick={() => socket.emit('host:start')}>게임 시작</button>
            <button onClick={() => socket.emit('host:pause')} disabled={!['countdown', 'choosing', 'revealing', 'result'].includes(game.status)}>일시정지</button>
            <button onClick={() => socket.emit('host:resume')} disabled={game.status !== 'paused'}>계속하기</button>
            <button onClick={() => socket.emit('host:newMatch')}>새 경기</button>
            <button className="danger" onClick={() => socket.emit('host:clearPlayers')}>참가자 모두 내보내기</button>
          </div>

          <div className="setting-line">
            <span>승리 점수</span>
            <select value={game.targetScore} onChange={(e) => socket.emit('host:setSettings', { targetScore: Number(e.target.value) })}>
              {[1, 2, 3, 5].map((n) => <option value={n} key={n}>{n}점</option>)}
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
            {game.history.slice().reverse().map((h, idx) => (
              <div className="history-item" key={`${h.turn}-${idx}`}>
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
    if (!playerState?.me) return <div className="card">상태 수신 중...</div>;
    const { me, other, game } = playerState;

    const canChoose = game.status === 'choosing' && !me.hasChoice;

    return (
      <div className="card player-view">
        <h2>{me.name}</h2>
        <p className="muted">연결 상태: {connected ? '🟢 연결됨' : '🔴 끊김'}</p>
        <p className="muted">현재 상태: {statusLabel[game.status]}</p>
        {countdownText && <div className="countdown-banner">{countdownText}</div>}

        <div className="stats-grid">
          <div className="stat"><small>내 점수</small><strong>{me.score}</strong></div>
          <div className="stat"><small>내 에너지</small><strong>{me.energy}</strong></div>
          <div className="stat"><small>⭐ 내 관통권</small><strong>{me.pierceTokens}</strong></div>
          <div className="stat"><small>🛡 내 연속방어</small><strong>{me.consecutiveShield}</strong></div>
          <div className="stat"><small>상대 점수</small><strong>{other?.score ?? 0}</strong></div>
          <div className="stat"><small>상대 에너지</small><strong>{other?.energy ?? 0}</strong></div>
          <div className="stat"><small>⭐ 상대 관통권</small><strong>{other?.pierceTokens ?? 0}</strong></div>
          <div className="stat"><small>상대 선택</small><strong>{other?.hasChoice ? '완료' : '대기'}</strong></div>
        </div>

        <div className="choice-area">
          <button className="action-btn charge" disabled={!canChoose} onClick={() => socket.emit('player:choose', { action: 'charge' })}>
            {actionLabels[game.mode].charge}<span>{actionLabels[game.mode].chargeDesc}</span>
          </button>
          <button className="action-btn shield" disabled={!canChoose} onClick={() => socket.emit('player:choose', { action: 'shield' })}>
            {actionLabels[game.mode].shield}<span>{actionLabels[game.mode].shieldDesc}</span>
          </button>
          <button className="action-btn blast" disabled={!canChoose || me.energy <= 0} onClick={() => socket.emit('player:choose', { action: 'blast' })}>
            {actionLabels[game.mode].blast}<span>{actionLabels[game.mode].blastDesc}</span>
          </button>
        </div>

        {me.hasChoice && game.status === 'choosing' && <div className="selected-panel">선택 완료! 상대에게는 보이지 않습니다.</div>}

        {(game.status === 'result' || game.status === 'gameOver') && game.lastResult?.actionA && (
          <div className="result-box">
            <p>{game.lastResult.playerAName} {label(game.mode, game.lastResult.actionA)} vs {game.lastResult.playerBName} {label(game.mode, game.lastResult.actionB!)}</p>
            <p>{game.lastResult.summary}</p>
            {game.lastResult.notes.map((note, idx) => <p key={idx}>• {note}</p>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      {error && <div className="error">{error}</div>}
      {role === 'landing' && renderLanding()}
      {role === 'host-login' && (
        <div className="card login-card">
          <h2>진행자 PIN 입력</h2>
          <input value={hostPin} onChange={(e) => setHostPin(e.target.value)} />
          <div className="btn-row">
            <button className="primary" onClick={loginHost}>입장</button>
            <button className="ghost" onClick={() => setRole('landing')}>뒤로</button>
          </div>
        </div>
      )}
      {role === 'player-join' && (
        <div className="card login-card">
          <h2>참가자 이름 입력</h2>
          <input value={joinName} onChange={(e) => setJoinName(e.target.value)} maxLength={10} />
          <div className="btn-row">
            <button className="primary" onClick={joinPlayer}>참가</button>
            <button className="ghost" onClick={() => setRole('landing')}>뒤로</button>
          </div>
        </div>
      )}
      {role === 'host' && renderHost()}
      {role === 'player' && renderPlayer()}
    </div>
  );
}
