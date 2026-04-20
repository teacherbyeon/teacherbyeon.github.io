import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';

type GamePhase = 'waiting' | 'placement' | 'ready' | 'started' | 'finished';

interface ParticipantRoomState {
  participantId: string;
  sessionId: string;
  nickname: string;
  connected: boolean;
}

interface ParticipantGameState {
  participantId: string;
  board: Array<number | null>;
  placementOrder: number[];
  ready: boolean;
  lineCount: number;
  win: boolean;
}

interface RoomState {
  roomCode: string;
  hostConnected: boolean;
  participants: ParticipantRoomState[];
}

interface GameState {
  mode: 'bingo';
  boardSize: number;
  winLineCount: number;
  diagonalEnabled: boolean;
  gamePhase: GamePhase;
  calledNumbers: number[];
  currentCalledNumber: number | null;
  participants: ParticipantGameState[];
  winners: string[];
}

interface RoomContainer {
  room: RoomState;
  game: GameState;
  hostSocketId: string;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const rooms = new Map<string, RoomContainer>();
const socketToRoom = new Map<string, string>();
const socketToSession = new Map<string, string>();

const PORT = Number(process.env.PORT ?? 4311);
const HOST_PIN = process.env.HOST_PIN ?? '1234';

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createEmptyBoard(size: number): Array<number | null> {
  return Array.from({ length: size * size }, () => null);
}

function countBingoLines(board: Array<number | null>, called: number[], size: number, diagonalEnabled: boolean): number {
  const calledSet = new Set(called);
  let lines = 0;

  for (let r = 0; r < size; r += 1) {
    let complete = true;
    for (let c = 0; c < size; c += 1) {
      const value = board[r * size + c];
      if (value === null || !calledSet.has(value)) {
        complete = false;
        break;
      }
    }
    if (complete) lines += 1;
  }

  for (let c = 0; c < size; c += 1) {
    let complete = true;
    for (let r = 0; r < size; r += 1) {
      const value = board[r * size + c];
      if (value === null || !calledSet.has(value)) {
        complete = false;
        break;
      }
    }
    if (complete) lines += 1;
  }

  if (diagonalEnabled) {
    let diagonalA = true;
    let diagonalB = true;
    for (let i = 0; i < size; i += 1) {
      const a = board[i * size + i];
      const b = board[i * size + (size - 1 - i)];
      if (a === null || !calledSet.has(a)) diagonalA = false;
      if (b === null || !calledSet.has(b)) diagonalB = false;
    }
    if (diagonalA) lines += 1;
    if (diagonalB) lines += 1;
  }

  return lines;
}

function emitSnapshot(roomCode: string): void {
  const roomContainer = rooms.get(roomCode);
  if (!roomContainer) return;
  io.to(roomCode).emit('room:snapshot', {
    room: roomContainer.room,
    game: roomContainer.game
  });
}

function updateDerivedState(roomContainer: RoomContainer): void {
  const { game } = roomContainer;
  const winners: string[] = [];

  game.participants.forEach((participant) => {
    participant.lineCount = countBingoLines(
      participant.board,
      game.calledNumbers,
      game.boardSize,
      game.diagonalEnabled
    );
    participant.win = participant.lineCount >= game.winLineCount;
    if (participant.win) winners.push(participant.participantId);
  });

  game.winners = winners;

  if (game.participants.length > 0 && game.participants.every((p) => p.ready)) {
    if (game.gamePhase === 'placement' || game.gamePhase === 'waiting') {
      game.gamePhase = 'ready';
    }
  } else if (game.gamePhase === 'ready') {
    game.gamePhase = 'placement';
  }
}

io.on('connection', (socket) => {
  socket.on('host:createRoom', (payload: { pin: string; boardSize: number; winLineCount: number; diagonalEnabled: boolean }) => {
    if (payload.pin !== HOST_PIN) {
      socket.emit('error:message', 'PIN이 올바르지 않습니다.');
      return;
    }

    let roomCode = randomCode();
    while (rooms.has(roomCode)) roomCode = randomCode();

    const boardSize = payload.boardSize;
    const winLineCount = Math.min(payload.winLineCount, boardSize);

    const container: RoomContainer = {
      hostSocketId: socket.id,
      room: {
        roomCode,
        hostConnected: true,
        participants: []
      },
      game: {
        mode: 'bingo',
        boardSize,
        winLineCount,
        diagonalEnabled: payload.diagonalEnabled,
        gamePhase: 'waiting',
        calledNumbers: [],
        currentCalledNumber: null,
        participants: [],
        winners: []
      }
    };

    rooms.set(roomCode, container);
    socketToRoom.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit('host:created', {
      room: container.room,
      game: container.game
    });
  });

  socket.on('participant:join', (payload: { roomCode: string; nickname: string; sessionId?: string }) => {
    const roomCode = payload.roomCode.trim();
    const roomContainer = rooms.get(roomCode);
    if (!roomContainer) {
      socket.emit('error:message', '존재하지 않는 방 코드입니다.');
      return;
    }

    if (roomContainer.game.gamePhase === 'started') {
      socket.emit('error:message', '게임 진행 중에는 새 참가자를 받을 수 없습니다.');
      return;
    }

    const nickname = payload.nickname.trim();
    if (!nickname) {
      socket.emit('error:message', '별명을 입력하세요.');
      return;
    }

    const duplicated = roomContainer.room.participants.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (duplicated) {
      socket.emit('error:message', '중복된 별명입니다.');
      return;
    }

    const sessionId = payload.sessionId && payload.sessionId.length > 8
      ? payload.sessionId
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const participantId = `p-${Math.random().toString(36).slice(2, 10)}`;
    const participantRoom: ParticipantRoomState = {
      participantId,
      sessionId,
      nickname,
      connected: true
    };

    const participantGame: ParticipantGameState = {
      participantId,
      board: createEmptyBoard(roomContainer.game.boardSize),
      placementOrder: [],
      ready: false,
      lineCount: 0,
      win: false
    };

    roomContainer.room.participants.push(participantRoom);
    roomContainer.game.participants.push(participantGame);

    if (roomContainer.game.gamePhase === 'waiting') {
      roomContainer.game.gamePhase = 'placement';
    }

    socket.join(roomCode);
    socketToRoom.set(socket.id, roomCode);
    socketToSession.set(socket.id, sessionId);
    updateDerivedState(roomContainer);

    socket.emit('participant:joined', {
      self: {
        participantId,
        sessionId,
        nickname
      },
      room: roomContainer.room,
      game: roomContainer.game
    });

    emitSnapshot(roomCode);
  });

  socket.on('participant:reconnect', (payload: { roomCode: string; sessionId: string }) => {
    const roomContainer = rooms.get(payload.roomCode);
    if (!roomContainer) return;

    const participant = roomContainer.room.participants.find((p) => p.sessionId === payload.sessionId);
    if (!participant) return;

    participant.connected = true;
    socket.join(payload.roomCode);
    socketToRoom.set(socket.id, payload.roomCode);
    socketToSession.set(socket.id, participant.sessionId);

    socket.emit('participant:joined', {
      self: {
        participantId: participant.participantId,
        sessionId: participant.sessionId,
        nickname: participant.nickname
      },
      room: roomContainer.room,
      game: roomContainer.game
    });

    emitSnapshot(payload.roomCode);
  });

  socket.on('participant:placeNumber', (payload: { roomCode: string; sessionId: string; index: number }) => {
    const roomContainer = rooms.get(payload.roomCode);
    if (!roomContainer) return;

    if (!['placement', 'waiting', 'ready'].includes(roomContainer.game.gamePhase)) return;

    const participantRoom = roomContainer.room.participants.find((p) => p.sessionId === payload.sessionId);
    if (!participantRoom) return;

    const participantGame = roomContainer.game.participants.find((p) => p.participantId === participantRoom.participantId);
    if (!participantGame || participantGame.ready) return;

    if (participantGame.board[payload.index] !== null) return;

    const next = participantGame.placementOrder.length + 1;
    const total = roomContainer.game.boardSize * roomContainer.game.boardSize;
    if (next > total) return;

    participantGame.board[payload.index] = next;
    participantGame.placementOrder.push(payload.index);

    if (participantGame.placementOrder.length === total) {
      participantGame.ready = true;
    }

    updateDerivedState(roomContainer);
    emitSnapshot(payload.roomCode);
  });

  socket.on('participant:undo', (payload: { roomCode: string; sessionId: string }) => {
    const roomContainer = rooms.get(payload.roomCode);
    if (!roomContainer) return;

    const participantRoom = roomContainer.room.participants.find((p) => p.sessionId === payload.sessionId);
    if (!participantRoom) return;

    const participantGame = roomContainer.game.participants.find((p) => p.participantId === participantRoom.participantId);
    if (!participantGame) return;

    const lastIndex = participantGame.placementOrder.pop();
    if (lastIndex === undefined) return;

    participantGame.board[lastIndex] = null;
    participantGame.ready = false;

    updateDerivedState(roomContainer);
    emitSnapshot(payload.roomCode);
  });

  socket.on('host:startGame', (payload: { roomCode: string }) => {
    const roomContainer = rooms.get(payload.roomCode);
    if (!roomContainer) return;
    if (roomContainer.hostSocketId !== socket.id) return;

    if (!roomContainer.game.participants.length || !roomContainer.game.participants.every((p) => p.ready)) {
      socket.emit('error:message', '모든 참가자의 배치 완료 후 시작할 수 있습니다.');
      return;
    }

    roomContainer.game.gamePhase = 'started';
    roomContainer.game.calledNumbers = [];
    roomContainer.game.currentCalledNumber = null;
    updateDerivedState(roomContainer);
    emitSnapshot(payload.roomCode);
  });

  socket.on('host:drawNumber', (payload: { roomCode: string }) => {
    const roomContainer = rooms.get(payload.roomCode);
    if (!roomContainer) return;
    if (roomContainer.hostSocketId !== socket.id) return;
    if (roomContainer.game.gamePhase !== 'started') return;

    const max = roomContainer.game.boardSize * roomContainer.game.boardSize;
    const candidates: number[] = [];
    for (let num = 1; num <= max; num += 1) {
      if (!roomContainer.game.calledNumbers.includes(num)) candidates.push(num);
    }

    if (!candidates.length) {
      roomContainer.game.gamePhase = 'finished';
      emitSnapshot(payload.roomCode);
      return;
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    roomContainer.game.calledNumbers.push(picked);
    roomContainer.game.currentCalledNumber = picked;

    updateDerivedState(roomContainer);
    emitSnapshot(payload.roomCode);
  });

  socket.on('host:newGame', (payload: { roomCode: string }) => {
    const roomContainer = rooms.get(payload.roomCode);
    if (!roomContainer) return;
    if (roomContainer.hostSocketId !== socket.id) return;

    roomContainer.game.calledNumbers = [];
    roomContainer.game.currentCalledNumber = null;
    roomContainer.game.gamePhase = roomContainer.room.participants.length ? 'placement' : 'waiting';
    roomContainer.game.winners = [];

    roomContainer.game.participants = roomContainer.room.participants.map((participant) => ({
      participantId: participant.participantId,
      board: createEmptyBoard(roomContainer.game.boardSize),
      placementOrder: [],
      ready: false,
      lineCount: 0,
      win: false
    }));

    emitSnapshot(payload.roomCode);
  });

  socket.on('host:endGame', (payload: { roomCode: string }) => {
    const roomContainer = rooms.get(payload.roomCode);
    if (!roomContainer) return;
    if (roomContainer.hostSocketId !== socket.id) return;

    io.to(payload.roomCode).emit('room:closed');
    rooms.delete(payload.roomCode);
  });

  socket.on('disconnect', () => {
    const roomCode = socketToRoom.get(socket.id);
    socketToRoom.delete(socket.id);
    const sessionId = socketToSession.get(socket.id);
    socketToSession.delete(socket.id);
    if (!roomCode) return;

    const roomContainer = rooms.get(roomCode);
    if (!roomContainer) return;

    if (roomContainer.hostSocketId === socket.id) {
      roomContainer.room.hostConnected = false;
      io.to(roomCode).emit('error:message', '진행자가 연결을 종료했습니다.');
      emitSnapshot(roomCode);
      return;
    }

    const matched = roomContainer.room.participants.find((p) => p.sessionId === sessionId);
    if (matched) {
      matched.connected = false;
      emitSnapshot(roomCode);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bingo server listening on http://0.0.0.0:${PORT}`);
});
