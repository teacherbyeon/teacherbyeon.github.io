import express from 'express';
import http from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { Server } from 'socket.io';

type TileValue = number | 'J';
type BoardCell = TileValue | null;

interface Participant {
  id: string;
  nickname: string;
  connected: boolean;
  reconnectCount: number;
  lastSeenAt: number;
  socketId: string | null;
  board: BoardCell[];
  tempPlacementIndex: number | null;
  score: number;
  submittedRound: number;
}

interface GameSettings {
  boardSize: 20;
  includeJoker: boolean;
  animationOn: boolean;
  soundOn: boolean;
  deckConfig: Record<string, number>;
}

interface GameState {
  inProgress: boolean;
  settings: GameSettings | null;
  drawSequence: TileValue[];
  drawHistory: TileValue[];
  round: number;
  currentNumber: TileValue | null;
  history: Snapshot[];
}

interface Snapshot {
  round: number;
  currentNumber: TileValue | null;
  drawHistory: TileValue[];
  participants: Record<string, Pick<Participant, 'board' | 'tempPlacementIndex' | 'score' | 'submittedRound'>>;
}

interface RoomState {
  hostSocketId: string | null;
  hostConnected: boolean;
  participants: Map<string, Participant>;
  game: GameState;
}

const HOST_PIN = process.env.STREAMS_HOST_PIN ?? '1234';
const ROOM_KEY = 'CLASSROOM';
let room: RoomState | null = null;
const socketRole = new Map<string, { type: 'host' | 'participant'; participantId?: string }>();

const app = express();
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
app.use(express.static(distDir));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const randomId = () => Math.random().toString(36).slice(2, 10);

const SCORE_BY_LENGTH: Record<number, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  8: 15,
  9: 20,
  10: 25,
  11: 30,
  12: 35,
  13: 40,
  14: 50,
  15: 60,
  16: 70,
  17: 85,
  18: 100,
  19: 150,
  20: 300
};

const newGameState = (): GameState => ({
  inProgress: false,
  settings: null,
  drawSequence: [],
  drawHistory: [],
  round: 0,
  currentNumber: null,
  history: []
});

const newRoom = (): RoomState => ({
  hostSocketId: null,
  hostConnected: false,
  participants: new Map(),
  game: newGameState()
});

const cloneBoard = (board: BoardCell[]) => [...board];

const makeDeck = (settings: GameSettings): TileValue[] => {
  const deck: TileValue[] = [];
  Object.entries(settings.deckConfig).forEach(([k, cnt]) => {
    const count = Math.max(0, Number(cnt) || 0);
    if (k === 'J') {
      if (settings.includeJoker) for (let i = 0; i < count; i += 1) deck.push('J');
      return;
    }
    const value = Number(k);
    if (Number.isFinite(value)) for (let i = 0; i < count; i += 1) deck.push(value);
  });
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, settings.boardSize);
};

const scoreFromLength = (length: number): number => SCORE_BY_LENGTH[length] ?? 0;

const computeScore = (board: BoardCell[]): number => {
  let total = 0;
  let segmentLength = 0;
  let prevKnown = Number.NEGATIVE_INFINITY;

  const flush = () => {
    total += scoreFromLength(segmentLength);
    segmentLength = 0;
    prevKnown = Number.NEGATIVE_INFINITY;
  };

  for (let i = 0; i < board.length; i += 1) {
    const cell = board[i];
    if (cell === null) {
      flush();
      continue;
    }

    if (cell === 'J') {
      segmentLength += 1;
      continue;
    }

    if (segmentLength > 0 && cell < prevKnown) {
      flush();
    }

    segmentLength += 1;
    prevKnown = cell;
  }

  flush();
  return total;
};

const snapshot = (state: RoomState): Snapshot => ({
  round: state.game.round,
  currentNumber: state.game.currentNumber,
  drawHistory: [...state.game.drawHistory],
  participants: Object.fromEntries(
    [...state.participants.values()].map((p) => [
      p.id,
      {
        board: cloneBoard(p.board),
        tempPlacementIndex: p.tempPlacementIndex,
        score: p.score,
        submittedRound: p.submittedRound
      }
    ])
  )
});

const emitState = (state: RoomState) => {
  const participantsSummary = [...state.participants.values()].map((p) => ({
    id: p.id,
    nickname: p.nickname,
    connected: p.connected,
    reconnectCount: p.reconnectCount,
    lastSeenAt: p.lastSeenAt,
    score: p.score,
    submitted: p.submittedRound === state.game.round,
    hasTempPlacement: p.tempPlacementIndex !== null
  }));

  if (state.hostSocketId) {
    io.to(state.hostSocketId).emit('state:host', {
      role: 'host',
      hostConnected: state.hostConnected,
      participants: participantsSummary,
      game: {
        inProgress: state.game.inProgress,
        settings: state.game.settings,
        round: state.game.round,
        totalRounds: state.game.settings?.boardSize ?? 20,
        remainingDraws: Math.max(0, (state.game.settings?.boardSize ?? 20) - state.game.drawHistory.length),
        currentNumber: state.game.currentNumber,
        drawHistory: state.game.drawHistory
      }
    });
  }

  [...state.participants.values()].forEach((p) => {
    if (!p.socketId) return;
    const boardView = cloneBoard(p.board);
    if (p.tempPlacementIndex !== null && state.game.currentNumber !== null) boardView[p.tempPlacementIndex] = state.game.currentNumber;
    io.to(p.socketId).emit('state:participant', {
      role: 'participant',
      participantId: p.id,
      nickname: p.nickname,
      connected: p.connected,
      participantsCount: state.participants.size,
      game: {
        inProgress: state.game.inProgress,
        round: state.game.round,
        totalRounds: state.game.settings?.boardSize ?? 20,
        remainingSlots: boardView.filter((v) => v === null).length,
        currentNumber: state.game.currentNumber,
        board: boardView,
        tempPlacementIndex: p.tempPlacementIndex,
        score: p.score,
        submitted: p.submittedRound === state.game.round,
        message: state.game.inProgress
          ? state.game.currentNumber === null
            ? '진행자가 숫자를 뽑는 중입니다.'
            : p.submittedRound === state.game.round
              ? '이번 턴 배치 완료'
              : '현재 숫자를 빈 칸에 배치하세요.'
          : '게임 대기 중입니다.'
      }
    });
  });
};

const finalizeRound = (state: RoomState) => {
  for (const p of state.participants.values()) {
    if (p.tempPlacementIndex !== null && state.game.currentNumber !== null && p.board[p.tempPlacementIndex] === null) {
      p.board[p.tempPlacementIndex] = state.game.currentNumber;
      p.submittedRound = state.game.round;
      p.tempPlacementIndex = null;
      p.score = computeScore(p.board);
    }
  }
};

const restoreSnapshot = (state: RoomState, snap: Snapshot) => {
  state.game.round = snap.round;
  state.game.currentNumber = snap.currentNumber;
  state.game.drawHistory = [...snap.drawHistory];

  state.participants.forEach((participant, id) => {
    const s = snap.participants[id];
    if (!s) return;
    participant.board = [...s.board];
    participant.tempPlacementIndex = s.tempPlacementIndex;
    participant.score = s.score;
    participant.submittedRound = s.submittedRound;
  });
};

io.on('connection', (socket) => {
  socket.on('host:login', ({ pin }: { pin: string }) => {
    if (pin !== HOST_PIN) {
      socket.emit('host:login:error', { message: 'PIN이 올바르지 않습니다.' });
      return;
    }

    room = room ?? newRoom();
    room.hostSocketId = socket.id;
    room.hostConnected = true;
    socketRole.set(socket.id, { type: 'host' });
    socket.join(ROOM_KEY);
    socket.emit('host:login:ok');
    emitState(room);
  });

  socket.on('host:start-game', ({ settings }: { settings: GameSettings }) => {
    if (!room) return socket.emit('server:error', { message: '방이 없습니다.' });
    room.game = newGameState();
    room.game.inProgress = true;
    room.game.settings = { ...settings, boardSize: 20 };
    room.game.drawSequence = makeDeck(room.game.settings);
    for (const p of room.participants.values()) {
      p.board = Array(20).fill(null);
      p.tempPlacementIndex = null;
      p.score = 0;
      p.submittedRound = 0;
    }
    room.game.history = [snapshot(room)];
    emitState(room);
  });

  socket.on('host:new-game', ({ settings }: { settings: GameSettings }) => {
    if (!room) return;
    room.game = newGameState();
    room.game.inProgress = true;
    room.game.settings = { ...settings, boardSize: 20 };
    room.game.drawSequence = makeDeck(room.game.settings);
    room.participants.forEach((p) => {
      p.board = Array(20).fill(null);
      p.tempPlacementIndex = null;
      p.score = 0;
      p.submittedRound = 0;
    });
    room.game.history = [snapshot(room)];
    emitState(room);
  });

  socket.on('host:draw', () => {
    if (!room || !room.game.inProgress) return;
    finalizeRound(room);
    const next = room.game.drawSequence[room.game.round];
    if (next === undefined) return;
    room.game.round += 1;
    room.game.currentNumber = next;
    room.game.drawHistory.push(next);
    room.game.history.push(snapshot(room));
    emitState(room);
  });

  socket.on('host:rewind', () => {
    if (!room || room.game.history.length <= 1) return;
    room.game.history.pop();
    const prev = room.game.history[room.game.history.length - 1];
    restoreSnapshot(room, prev);
    emitState(room);
  });

  socket.on('host:end-room', () => {
    if (!room) return;
    for (const p of room.participants.values()) {
      if (p.socketId) io.to(p.socketId).emit('room:ended');
    }
    if (room.hostSocketId) io.to(room.hostSocketId).emit('room:ended');
    room = null;
  });

  socket.on('participant:join', ({ nickname, participantId }: { nickname: string; participantId?: string }) => {
    if (!room) return socket.emit('participant:join:error', { message: '진행자가 아직 방을 열지 않았습니다.' });

    const trimmed = nickname.trim();
    if (!trimmed && !participantId) return socket.emit('participant:join:error', { message: '별명을 입력하세요.' });

    let participant = participantId ? room.participants.get(participantId) : undefined;
    if (!participant) {
      const dup = [...room.participants.values()].find((p) => p.nickname.toLowerCase() === trimmed.toLowerCase());
      if (dup) return socket.emit('participant:join:error', { message: '이미 사용 중인 별명입니다.' });

      const id = randomId();
      participant = {
        id,
        nickname: trimmed,
        connected: true,
        reconnectCount: 0,
        lastSeenAt: Date.now(),
        socketId: socket.id,
        board: Array(20).fill(null),
        tempPlacementIndex: null,
        score: 0,
        submittedRound: 0
      };
      room.participants.set(id, participant);
      socket.emit('participant:join:ok', { participantId: id });
    } else {
      participant.connected = true;
      participant.lastSeenAt = Date.now();
      participant.reconnectCount += 1;
      participant.socketId = socket.id;
      socket.emit('participant:join:ok', { participantId: participant.id });
    }

    socketRole.set(socket.id, { type: 'participant', participantId: participant.id });
    socket.join(ROOM_KEY);
    emitState(room);
  });

  socket.on('participant:place-temp', ({ participantId, index }: { participantId: string; index: number }) => {
    if (!room || !room.game.inProgress || room.game.currentNumber === null) return;
    const participant = room.participants.get(participantId);
    if (!participant) return;
    if (index < 0 || index >= 20) return;
    if (participant.board[index] !== null) return;
    participant.tempPlacementIndex = index;
    participant.submittedRound = room.game.round;
    const boardPreview = [...participant.board];
    boardPreview[index] = room.game.currentNumber;
    participant.score = computeScore(boardPreview);
    participant.lastSeenAt = Date.now();
    emitState(room);
  });

  socket.on('disconnect', () => {
    const role = socketRole.get(socket.id);
    if (!role || !room) return;

    if (role.type === 'host') {
      room.hostConnected = false;
      room.hostSocketId = null;
    } else if (role.participantId) {
      const p = room.participants.get(role.participantId);
      if (p) {
        p.connected = false;
        p.lastSeenAt = Date.now();
        p.socketId = null;
      }
    }
    socketRole.delete(socket.id);
    emitState(room);
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.resolve(distDir, 'index.html'));
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`Streams server started on ${port}`);
});
