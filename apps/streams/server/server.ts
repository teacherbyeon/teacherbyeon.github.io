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
  roomCode: string;
  hostSocketId: string | null;
  hostConnected: boolean;
  participants: Map<string, Participant>;
  game: GameState;
}

const HOST_PIN = process.env.STREAMS_HOST_PIN ?? '1234';
const rooms = new Map<string, RoomState>();
const socketRole = new Map<string, { type: 'host' | 'participant'; roomCode: string; participantId?: string }>();

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
const randomRoomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

const newGameState = (): GameState => ({
  inProgress: false,
  settings: null,
  drawSequence: [],
  drawHistory: [],
  round: 0,
  currentNumber: null,
  history: []
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

const computeScore = (board: BoardCell[]): number => {
  let best = 0;
  for (let i = 0; i < board.length; i += 1) {
    let prevKnown = Number.NEGATIVE_INFINITY;
    for (let j = i; j < board.length; j += 1) {
      const cell = board[j];
      if (cell === null) break;
      if (cell !== 'J') {
        if (cell < prevKnown) break;
        prevKnown = cell;
      }
      best = Math.max(best, j - i + 1);
    }
  }
  return best;
};

const snapshot = (room: RoomState): Snapshot => ({
  round: room.game.round,
  currentNumber: room.game.currentNumber,
  drawHistory: [...room.game.drawHistory],
  participants: Object.fromEntries(
    [...room.participants.values()].map((p) => [
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

const emitState = (room: RoomState) => {
  const participantsSummary = [...room.participants.values()].map((p) => ({
    id: p.id,
    nickname: p.nickname,
    connected: p.connected,
    reconnectCount: p.reconnectCount,
    lastSeenAt: p.lastSeenAt,
    score: p.score,
    submitted: p.submittedRound === room.game.round,
    hasTempPlacement: p.tempPlacementIndex !== null
  }));

  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit('state:host', {
      role: 'host',
      roomCode: room.roomCode,
      hostConnected: room.hostConnected,
      participants: participantsSummary,
      game: {
        inProgress: room.game.inProgress,
        settings: room.game.settings,
        round: room.game.round,
        totalRounds: room.game.settings?.boardSize ?? 20,
        remainingDraws: Math.max(0, (room.game.settings?.boardSize ?? 20) - room.game.drawHistory.length),
        currentNumber: room.game.currentNumber,
        drawHistory: room.game.drawHistory
      }
    });
  }

  [...room.participants.values()].forEach((p) => {
    if (!p.socketId) return;
    const boardView = cloneBoard(p.board);
    if (p.tempPlacementIndex !== null && room.game.currentNumber !== null) boardView[p.tempPlacementIndex] = room.game.currentNumber;
    io.to(p.socketId).emit('state:participant', {
      role: 'participant',
      participantId: p.id,
      nickname: p.nickname,
      roomCode: room.roomCode,
      connected: p.connected,
      participantsCount: room.participants.size,
      game: {
        inProgress: room.game.inProgress,
        round: room.game.round,
        totalRounds: room.game.settings?.boardSize ?? 20,
        remainingSlots: boardView.filter((v) => v === null).length,
        currentNumber: room.game.currentNumber,
        board: boardView,
        tempPlacementIndex: p.tempPlacementIndex,
        score: p.score,
        submitted: p.submittedRound === room.game.round,
        message: room.game.inProgress
          ? room.game.currentNumber === null
            ? '진행자가 숫자를 뽑는 중입니다.'
            : p.submittedRound === room.game.round
              ? '이번 턴 배치 완료'
              : '현재 숫자를 빈 칸에 배치하세요.'
          : '게임 대기 중입니다.'
      }
    });
  });
};

const finalizeRound = (room: RoomState) => {
  for (const p of room.participants.values()) {
    if (p.tempPlacementIndex !== null && room.game.currentNumber !== null && p.board[p.tempPlacementIndex] === null) {
      p.board[p.tempPlacementIndex] = room.game.currentNumber;
      p.submittedRound = room.game.round;
      p.tempPlacementIndex = null;
      p.score = computeScore(p.board);
    }
  }
};

const restoreSnapshot = (room: RoomState, snap: Snapshot) => {
  room.game.round = snap.round;
  room.game.currentNumber = snap.currentNumber;
  room.game.drawHistory = [...snap.drawHistory];

  room.participants.forEach((participant, id) => {
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
    const roomCode = randomRoomCode();
    const room: RoomState = {
      roomCode,
      hostSocketId: socket.id,
      hostConnected: true,
      participants: new Map(),
      game: newGameState()
    };
    rooms.set(roomCode, room);
    socketRole.set(socket.id, { type: 'host', roomCode });
    socket.join(roomCode);
    socket.emit('host:login:ok', { roomCode });
    emitState(room);
  });

  socket.on('host:start-game', ({ roomCode, settings }: { roomCode: string; settings: GameSettings }) => {
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('server:error', { message: '방을 찾을 수 없습니다.' });
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

  socket.on('host:new-game', ({ roomCode, settings }: { roomCode: string; settings: GameSettings }) => {
    const room = rooms.get(roomCode);
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

  socket.on('host:draw', ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
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

  socket.on('host:rewind', ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
    if (!room || room.game.history.length <= 1) return;
    room.game.history.pop();
    const prev = room.game.history[room.game.history.length - 1];
    restoreSnapshot(room, prev);
    emitState(room);
  });

  socket.on('host:end-room', ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    for (const p of room.participants.values()) {
      if (p.socketId) io.to(p.socketId).emit('room:ended');
    }
    if (room.hostSocketId) io.to(room.hostSocketId).emit('room:ended');
    rooms.delete(roomCode);
  });

  socket.on('participant:join', ({ roomCode, nickname, participantId }: { roomCode: string; nickname: string; participantId?: string }) => {
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('participant:join:error', { message: '방 코드가 없습니다.' });

    const trimmed = nickname.trim();
    if (!trimmed) return socket.emit('participant:join:error', { message: '별명을 입력하세요.' });

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

    socketRole.set(socket.id, { type: 'participant', roomCode, participantId: participant.id });
    socket.join(roomCode);
    emitState(room);
  });

  socket.on(
    'participant:place-temp',
    ({ roomCode, participantId, index }: { roomCode: string; participantId: string; index: number }) => {
      const room = rooms.get(roomCode);
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
    }
  );

  socket.on('disconnect', () => {
    const role = socketRole.get(socket.id);
    if (!role) return;
    const room = rooms.get(role.roomCode);
    if (!room) return;

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
