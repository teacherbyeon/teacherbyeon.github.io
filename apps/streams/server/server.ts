import cors from 'cors';
import express from 'express';
import http from 'http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';

type TileValue = number | 'J';
type BoardCell = TileValue | null;

interface GameSettings {
  boardSize: 20;
  includeJoker: boolean;
  animationOn: boolean;
  soundOn: boolean;
  deckConfig: Record<string, number>;
}

interface StudentState {
  studentKey: string;
  nickname: string;
  board: BoardCell[];
  score: number;
  connected: boolean;
  reconnectCount: number;
  lastSeenAt: number;
  socketIds: Set<string>;
  placedRound: number;
}

interface Snapshot {
  round: number;
  currentNumber: TileValue | null;
  drawHistory: TileValue[];
  students: Record<string, { board: BoardCell[]; score: number; placedRound: number }>;
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

interface RoomState {
  teacherSocketId: string | null;
  teacherConnected: boolean;
  students: Map<string, StudentState>;
  game: GameState;
}

const HOST_PIN = process.env.STREAMS_HOST_PIN ?? '1234';
const TEACHER_ROOM = 'room:teacher';
const STUDENT_ROOM = 'room:students';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

const app = express();
app.use(cors());
app.use(express.static(distDir));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000
});

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

const socketMeta = new Map<string, { role: 'teacher' | 'student'; studentKey?: string }>();

const newGameState = (): GameState => ({
  inProgress: false,
  settings: null,
  drawSequence: [],
  drawHistory: [],
  round: 0,
  currentNumber: null,
  history: []
});

const room: RoomState = {
  teacherSocketId: null,
  teacherConnected: false,
  students: new Map(),
  game: newGameState()
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

  for (const cell of board) {
    if (cell === null) {
      flush();
      continue;
    }

    if (cell === 'J') {
      segmentLength += 1;
      continue;
    }

    if (segmentLength > 0 && cell < prevKnown) flush();

    segmentLength += 1;
    prevKnown = cell;
  }

  flush();
  return total;
};

const normalizeSettings = (settings: GameSettings): GameSettings => ({
  ...settings,
  boardSize: 20,
  deckConfig: {
    ...settings.deckConfig,
    J: settings.includeJoker ? Math.max(0, Number(settings.deckConfig.J) || 0) : 0
  }
});

const makeDeck = (settings: GameSettings): TileValue[] => {
  const deck: TileValue[] = [];
  Object.entries(settings.deckConfig).forEach(([key, countRaw]) => {
    const count = Math.max(0, Number(countRaw) || 0);
    if (key === 'J') {
      if (settings.includeJoker) {
        for (let i = 0; i < count; i += 1) deck.push('J');
      }
      return;
    }
    const value = Number(key);
    if (!Number.isFinite(value)) return;
    for (let i = 0; i < count; i += 1) deck.push(value);
  });

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck.slice(0, settings.boardSize);
};

const teacherStudentsView = () =>
  [...room.students.values()]
    .map((student) => ({
      studentKey: student.studentKey,
      nickname: student.nickname,
      connected: student.connected,
      reconnectCount: student.reconnectCount,
      lastSeenAt: student.lastSeenAt,
      score: student.score,
      placed: student.placedRound === room.game.round
    }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'ko'));

const emitTeacherState = () => {
  if (!room.teacherSocketId) return;
  io.to(room.teacherSocketId).emit('teacherStateInit', {
    teacherConnected: room.teacherConnected,
    game: {
      inProgress: room.game.inProgress,
      round: room.game.round,
      totalRounds: room.game.settings?.boardSize ?? 20,
      remainingDraws: Math.max(0, (room.game.settings?.boardSize ?? 20) - room.game.drawHistory.length),
      currentNumber: room.game.currentNumber,
      drawHistory: room.game.drawHistory,
      settings: room.game.settings
    },
    students: teacherStudentsView()
  });
};

const emitStudentState = (student: StudentState) => {
  io.to(`student:${student.studentKey}`).emit('studentInit', {
    studentKey: student.studentKey,
    nickname: student.nickname,
    round: room.game.round,
    totalRounds: room.game.settings?.boardSize ?? 20,
    currentNumber: room.game.currentNumber,
    board: student.board,
    score: student.score,
    placed: student.placedRound === room.game.round,
    connected: student.connected
  });
};

const emitNumberDrawn = () => {
  const payload = {
    round: room.game.round,
    totalRounds: room.game.settings?.boardSize ?? 20,
    currentNumber: room.game.currentNumber,
    remainingDraws: Math.max(0, (room.game.settings?.boardSize ?? 20) - room.game.drawHistory.length)
  };
  io.to(STUDENT_ROOM).emit('numberDrawn', payload);
  io.to(TEACHER_ROOM).emit('numberDrawn', payload);
};

const snapshot = (): Snapshot => ({
  round: room.game.round,
  currentNumber: room.game.currentNumber,
  drawHistory: [...room.game.drawHistory],
  students: Object.fromEntries(
    [...room.students.values()].map((s) => [
      s.studentKey,
      {
        board: [...s.board],
        score: s.score,
        placedRound: s.placedRound
      }
    ])
  )
});

const restoreSnapshot = (snap: Snapshot) => {
  room.game.round = snap.round;
  room.game.currentNumber = snap.currentNumber;
  room.game.drawHistory = [...snap.drawHistory];

  room.students.forEach((student) => {
    const data = snap.students[student.studentKey];
    if (!data) return;
    student.board = [...data.board];
    student.score = data.score;
    student.placedRound = data.placedRound;
  });
};

const resetStudentsForNewGame = () => {
  room.students.forEach((student) => {
    student.board = Array(20).fill(null);
    student.score = 0;
    student.placedRound = 0;
    emitStudentState(student);
  });
};

const initGame = (rawSettings: GameSettings): { ok: true } | { ok: false; message: string } => {
  const settings = normalizeSettings(rawSettings);
  const drawSequence = makeDeck(settings);
  if (drawSequence.length < 20) {
    room.game = newGameState();
    return { ok: false, message: '덱 카드 수가 부족합니다. 20장 이상으로 설정하세요.' };
  }

  room.game = newGameState();
  room.game.inProgress = true;
  room.game.settings = settings;
  room.game.drawSequence = drawSequence;
  resetStudentsForNewGame();
  room.game.history = [snapshot()];
  emitTeacherState();
  return { ok: true };
};

io.on('connection', (socket: Socket) => {
  socket.on('teacher:login', ({ pin }: { pin: string }) => {
    if (pin !== HOST_PIN) {
      socket.emit('teacher:error', { message: 'PIN이 올바르지 않습니다.' });
      return;
    }

    room.teacherSocketId = socket.id;
    room.teacherConnected = true;
    socketMeta.set(socket.id, { role: 'teacher' });
    socket.join(TEACHER_ROOM);
    socket.emit('teacher:login:ok');
    emitTeacherState();
  });

  socket.on('teacher:startGame', ({ settings }: { settings: GameSettings }) => {
    const result = initGame(settings);
    if (!result.ok) {
      socket.emit('teacher:error', { message: result.message });
      emitTeacherState();
    }
  });

  socket.on('teacher:newGame', ({ settings }: { settings: GameSettings }) => {
    const result = initGame(settings);
    if (!result.ok) {
      socket.emit('teacher:error', { message: result.message });
      emitTeacherState();
    }
  });

  socket.on('teacher:draw', () => {
    if (!room.game.inProgress) return;

    const next = room.game.drawSequence[room.game.round];
    if (next === undefined) return;

    room.game.round += 1;
    room.game.currentNumber = next;
    room.game.drawHistory.push(next);
    room.game.history.push(snapshot());

    emitNumberDrawn();
    emitTeacherState();

    room.students.forEach((student) => {
      io.to(`student:${student.studentKey}`).emit('roundStatus', {
        round: room.game.round,
        placed: student.placedRound === room.game.round
      });
    });
  });

  socket.on('teacher:rewind', () => {
    if (room.game.history.length <= 1) return;
    room.game.history.pop();
    const prev = room.game.history[room.game.history.length - 1];
    restoreSnapshot(prev);

    emitTeacherState();
    room.students.forEach((student) => {
      emitStudentState(student);
    });
  });

  socket.on('teacher:endGame', () => {
    room.game = newGameState();
    room.students.forEach((student) => {
      io.to(`student:${student.studentKey}`).emit('roomEnded');
      student.board = Array(20).fill(null);
      student.score = 0;
      student.placedRound = 0;
      student.socketIds.clear();
      student.connected = false;
    });
    room.students.clear();
    io.to(TEACHER_ROOM).emit('roomEnded');
    emitTeacherState();
  });

  socket.on('student:join', ({ studentKey, nickname }: { studentKey: string; nickname: string }) => {
    const key = studentKey.trim();
    const name = nickname.trim() || key;
    if (!key) return socket.emit('student:error', { message: '학생 키를 입력하세요.' });

    let student = room.students.get(key);
    if (!student) {
      student = {
        studentKey: key,
        nickname: name,
        board: Array(20).fill(null),
        score: 0,
        connected: true,
        reconnectCount: 0,
        lastSeenAt: Date.now(),
        socketIds: new Set(),
        placedRound: 0
      };
      room.students.set(key, student);
    } else {
      student.nickname = name;
      student.connected = true;
      student.reconnectCount += 1;
      student.lastSeenAt = Date.now();
    }

    student.socketIds.add(socket.id);
    socketMeta.set(socket.id, { role: 'student', studentKey: key });
    socket.join(STUDENT_ROOM);
    socket.join(`student:${key}`);

    emitStudentState(student);
    io.to(TEACHER_ROOM).emit('studentConnectionChanged', {
      studentKey: key,
      connected: true,
      reconnectCount: student.reconnectCount,
      lastSeenAt: student.lastSeenAt,
      nickname: student.nickname,
      score: student.score,
      placed: student.placedRound === room.game.round
    });
    emitTeacherState();
  });

  socket.on(
    'student:place',
    (
      { studentKey, index, round }: { studentKey: string; index: number; round: number },
      ack?: (response: { ok: boolean; message?: string }) => void
    ) => {
      if (!room.game.inProgress || room.game.currentNumber === null) {
        ack?.({ ok: false, message: '현재 배치 가능한 숫자가 없습니다.' });
        return;
      }

      const student = room.students.get(studentKey);
      if (!student) {
        ack?.({ ok: false, message: '학생 정보를 찾을 수 없습니다.' });
        return;
      }

      if (round !== room.game.round) {
        ack?.({ ok: false, message: '라운드 정보가 다릅니다. 화면을 확인하세요.' });
        return;
      }

      if (student.placedRound === room.game.round) {
        ack?.({ ok: false, message: '이번 숫자는 이미 배치했습니다.' });
        return;
      }

      if (index < 0 || index >= 20) {
        ack?.({ ok: false, message: '잘못된 칸입니다.' });
        return;
      }

      if (student.board[index] !== null) {
        ack?.({ ok: false, message: '이미 사용한 칸입니다.' });
        return;
      }

      student.board[index] = room.game.currentNumber;
      student.placedRound = room.game.round;
      student.lastSeenAt = Date.now();
      student.score = computeScore(student.board);

      io.to(`student:${student.studentKey}`).emit('myBoardUpdated', {
        round: room.game.round,
        board: student.board,
        score: student.score,
        placed: true
      });

      io.to(TEACHER_ROOM).emit('studentPlaced', {
        studentKey: student.studentKey,
        nickname: student.nickname,
        score: student.score,
        placed: true,
        lastSeenAt: student.lastSeenAt
      });

      ack?.({ ok: true });
    }
  );

  socket.on('disconnect', (reason: string) => {
    console.log(`[disconnect] socket=${socket.id} reason=${reason}`);

    const meta = socketMeta.get(socket.id);
    if (!meta) return;

    if (meta.role === 'teacher') {
      room.teacherConnected = false;
      room.teacherSocketId = null;
      socketMeta.delete(socket.id);
      emitTeacherState();
      return;
    }

    if (meta.studentKey) {
      const student = room.students.get(meta.studentKey);
      if (student) {
        student.socketIds.delete(socket.id);
        if (student.socketIds.size === 0) {
          student.connected = false;
          student.lastSeenAt = Date.now();
          io.to(TEACHER_ROOM).emit('studentConnectionChanged', {
            studentKey: student.studentKey,
            connected: false,
            reconnectCount: student.reconnectCount,
            lastSeenAt: student.lastSeenAt,
            nickname: student.nickname,
            score: student.score,
            placed: student.placedRound === room.game.round
          });
        }
      }
    }

    socketMeta.delete(socket.id);
    emitTeacherState();
  });
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

app.get('*', (_req, res) => {
  res.sendFile(path.resolve(distDir, 'index.html'));
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`Streams server started on ${port}`);
});
