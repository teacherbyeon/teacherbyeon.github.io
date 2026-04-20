import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from './socket';
import type {
  GameState,
  ParticipantGameState,
  ParticipantSelf,
  RoomState,
  SnapshotPayload
} from './types';

type Screen = 'role' | 'hostLogin' | 'hostSetup' | 'hostRoom' | 'participantJoin' | 'participantRoom';

const HOST_PIN_DEFAULT = '1234';
const BOARD_OPTIONS = [4, 5];

const emptyRoom: RoomState = {
  roomCode: '',
  hostConnected: false,
  participants: []
};

const emptyGame: GameState = {
  mode: 'bingo',
  boardSize: 5,
  winLineCount: 3,
  diagonalEnabled: true,
  gamePhase: 'waiting',
  calledNumbers: [],
  currentCalledNumber: null,
  participants: [],
  winners: []
};

function getParticipantStatus(game: GameState, participantId: string): string {
  const p = game.participants.find((item) => item.participantId === participantId);
  if (!p) return '접속 중';
  if (p.ready) return '배치 완료';
  if (p.placementOrder.length > 0) return '배치 중';
  return '접속 중';
}

function App() {
  const [screen, setScreen] = useState<Screen>('role');
  const [room, setRoom] = useState<RoomState>(emptyRoom);
  const [game, setGame] = useState<GameState>(emptyGame);

  const [hostPin, setHostPin] = useState('');
  const [hostAuth, setHostAuth] = useState(false);
  const [boardSize, setBoardSize] = useState(5);
  const [winLineCount, setWinLineCount] = useState(3);
  const [diagonalEnabled, setDiagonalEnabled] = useState(true);

  const [nickname, setNickname] = useState('');
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [self, setSelf] = useState<ParticipantSelf | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    socket.connect();
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setJoinRoomCode(roomFromUrl);
      setScreen('participantJoin');
    }

    const onSnapshot = ({ room: roomState, game: gameState }: SnapshotPayload) => {
      setRoom(roomState);
      setGame(gameState);
    };

    socket.on('room:snapshot', onSnapshot);
    socket.on('error:message', (message: string) => setError(message));

    socket.on('participant:joined', (payload: { self: ParticipantSelf } & SnapshotPayload) => {
      setSelf(payload.self);
      setRoom(payload.room);
      setGame(payload.game);
      localStorage.setItem('bingo-session', payload.self.sessionId);
      localStorage.setItem('bingo-room', payload.room.roomCode);
      localStorage.setItem('bingo-nickname', payload.self.nickname);
      setScreen('participantRoom');
      setError('');
    });

    socket.on('host:created', (payload: SnapshotPayload) => {
      setRoom(payload.room);
      setGame(payload.game);
      setScreen('hostRoom');
      setError('');
    });

    socket.on('room:closed', () => {
      setRoom(emptyRoom);
      setGame(emptyGame);
      setSelf(null);
      localStorage.removeItem('bingo-session');
      localStorage.removeItem('bingo-room');
      setScreen('role');
      setError('게임이 종료되었습니다.');
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const savedSessionId = localStorage.getItem('bingo-session');
    const savedRoomCode = localStorage.getItem('bingo-room');
    const savedNickname = localStorage.getItem('bingo-nickname');
    if (savedSessionId && savedRoomCode && savedNickname && !self) {
      socket.emit('participant:reconnect', {
        roomCode: savedRoomCode,
        sessionId: savedSessionId
      });
      setNickname(savedNickname);
    }
  }, [self]);

  const myGameState: ParticipantGameState | undefined = useMemo(() => {
    if (!self) return undefined;
    return game.participants.find((p) => p.participantId === self.participantId);
  }, [game.participants, self]);

  const placementTotal = game.boardSize * game.boardSize;
  const nextPlacement = (myGameState?.placementOrder.length ?? 0) + 1;
  const allReady = room.participants.length > 0 && game.participants.every((p) => p.ready);

  const joinUrl = useMemo(() => {
    if (!room.roomCode) return '';
    const origin = window.location.origin;
    return `${origin}/?room=${room.roomCode}`;
  }, [room.roomCode]);

  const canDraw = game.gamePhase === 'started';

  const onHostLogin = () => {
    if (hostPin === HOST_PIN_DEFAULT) {
      setHostAuth(true);
      setScreen('hostSetup');
      setError('');
      return;
    }
    setError('PIN이 올바르지 않습니다.');
  };

  const createRoom = () => {
    socket.emit('host:createRoom', {
      pin: hostPin,
      boardSize,
      winLineCount,
      diagonalEnabled
    });
  };

  const joinRoom = () => {
    const trimmed = nickname.trim();
    if (!trimmed || !joinRoomCode.trim()) {
      setError('별명과 방 코드를 입력하세요.');
      return;
    }
    socket.emit('participant:join', {
      roomCode: joinRoomCode.trim(),
      nickname: trimmed,
      sessionId: localStorage.getItem('bingo-session')
    });
  };

  const placeNumber = (index: number) => {
    if (!self || !room.roomCode || !myGameState || myGameState.ready) return;
    socket.emit('participant:placeNumber', {
      roomCode: room.roomCode,
      sessionId: self.sessionId,
      index
    });
  };

  const undoPlacement = () => {
    if (!self || !room.roomCode) return;
    socket.emit('participant:undo', {
      roomCode: room.roomCode,
      sessionId: self.sessionId
    });
  };

  const startGame = () => socket.emit('host:startGame', { roomCode: room.roomCode });
  const drawNumber = () => socket.emit('host:drawNumber', { roomCode: room.roomCode });
  const newGame = () => socket.emit('host:newGame', { roomCode: room.roomCode });
  const endGame = () => socket.emit('host:endGame', { roomCode: room.roomCode });

  return (
    <div className="app">
      <div className="panel">
        <h1>교실 빙고</h1>
        {error && <p className="error">{error}</p>}

        {screen === 'role' && (
          <div className="stack">
            <button className="btn primary" onClick={() => setScreen('hostLogin')}>진행자</button>
            <button className="btn" onClick={() => setScreen('participantJoin')}>참가자</button>
          </div>
        )}

        {screen === 'hostLogin' && (
          <div className="stack">
            <input type="password" placeholder="PIN 입력" value={hostPin} onChange={(e) => setHostPin(e.target.value)} />
            <button className="btn primary" onClick={onHostLogin}>로그인</button>
            <button className="btn" onClick={() => setScreen('role')}>뒤로</button>
          </div>
        )}

        {screen === 'hostSetup' && hostAuth && (
          <div className="stack">
            <h2>빙고 설정</h2>
            <label>보드 크기</label>
            <select value={boardSize} onChange={(e) => setBoardSize(Number(e.target.value))}>
              {BOARD_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} x {size}</option>
              ))}
            </select>
            <label>승리 줄 수</label>
            <select value={winLineCount} onChange={(e) => setWinLineCount(Number(e.target.value))}>
              {Array.from({ length: boardSize }, (_, i) => i + 1).map((count) => (
                <option key={count} value={count}>{count}줄</option>
              ))}
            </select>
            <label className="row">
              <input type="checkbox" checked={diagonalEnabled} onChange={(e) => setDiagonalEnabled(e.target.checked)} />
              대각선 포함
            </label>
            <button className="btn primary" onClick={createRoom}>방 생성</button>
          </div>
        )}

        {screen === 'participantJoin' && (
          <div className="stack">
            <h2>참가자 입장</h2>
            <input placeholder="별명" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            <input placeholder="방 코드(숫자)" value={joinRoomCode} onChange={(e) => setJoinRoomCode(e.target.value)} />
            <button className="btn primary" onClick={joinRoom}>입장</button>
            <button className="btn" onClick={() => setScreen('role')}>뒤로</button>
          </div>
        )}

        {screen === 'hostRoom' && (
          <div className="host-grid">
            <div className="card">
              <h2>진행자 대기/진행</h2>
              <p>방 코드: <b>{room.roomCode}</b></p>
              <p>URL: <a href={joinUrl}>{joinUrl}</a></p>
              <div className="qr-wrap">
                <QRCodeSVG value={joinUrl || window.location.href} size={260} includeMargin />
              </div>
              <p>준비: {game.participants.filter((p) => p.ready).length} / {room.participants.length}</p>
              <p>현재 단계: {game.gamePhase}</p>
              <div className="stack">
                <button className="btn primary" disabled={!allReady || game.gamePhase === 'started'} onClick={startGame}>게임 시작</button>
                <button className="btn" disabled={!canDraw} onClick={drawNumber}>숫자 추첨</button>
                <button className="btn" onClick={newGame}>새 게임 시작</button>
                <button className="btn danger" onClick={endGame}>게임 끝</button>
              </div>
              <div className="called-box">
                <strong>현재 숫자: {game.currentCalledNumber ?? '-'}</strong>
                <p>추첨 이력: {game.calledNumbers.join(', ') || '-'}</p>
              </div>
              <div>
                <strong>승리자: </strong>
                {game.winners.length
                  ? game.winners
                      .map((winnerId) => room.participants.find((p) => p.participantId === winnerId)?.nickname ?? winnerId)
                      .join(', ')
                  : '없음'}
              </div>
            </div>

            <div className="card">
              <h3>참가자 목록</h3>
              <ul className="list">
                {room.participants.map((participant) => {
                  const participantGame = game.participants.find((p) => p.participantId === participant.participantId);
                  return (
                    <li key={participant.participantId}>
                      <div>
                        <b>{participant.nickname}</b>
                        <div className="muted">{participant.connected ? '접속 중' : '오프라인'} / {getParticipantStatus(game, participant.participantId)}</div>
                      </div>
                      <div className="muted">줄 {participantGame?.lineCount ?? 0} / 승리 {participantGame?.win ? 'Y' : 'N'}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {screen === 'participantRoom' && self && myGameState && (
          <div className="stack">
            <h2>{self.nickname}</h2>
            <p>방 코드: {room.roomCode}</p>
            {(game.gamePhase === 'waiting' || game.gamePhase === 'placement' || game.gamePhase === 'ready') && !myGameState.ready && (
              <>
                <p>지금 배치할 숫자: {nextPlacement}</p>
                <div className="board" style={{ gridTemplateColumns: `repeat(${game.boardSize}, minmax(0, 1fr))` }}>
                  {myGameState.board.map((cell, index) => (
                    <button
                      key={index}
                      className={`cell ${cell ? 'filled' : ''}`}
                      disabled={cell !== null || myGameState.ready}
                      onClick={() => placeNumber(index)}
                    >
                      {cell ?? ''}
                    </button>
                  ))}
                </div>
                <button className="btn" onClick={undoPlacement}>되돌리기</button>
              </>
            )}

            {(myGameState.ready && game.gamePhase !== 'started') && <p className="ready">배치 완료. 진행자가 게임을 시작할 때까지 기다리세요.</p>}

            {game.gamePhase === 'started' && (
              <>
                <div className="called-big">{game.currentCalledNumber ?? '-'}</div>
                <p>완성 줄 수: {myGameState.lineCount}</p>
                <p>승리 여부: {myGameState.win ? '승리!' : '진행 중'}</p>
                <div className="board" style={{ gridTemplateColumns: `repeat(${game.boardSize}, minmax(0, 1fr))` }}>
                  {myGameState.board.map((cell, index) => {
                    const marked = cell !== null && game.calledNumbers.includes(cell);
                    return (
                      <div key={index} className={`cell readonly ${marked ? 'marked' : ''}`}>
                        {cell ?? ''}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
