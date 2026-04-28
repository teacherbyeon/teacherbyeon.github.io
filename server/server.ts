import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HOST_PIN = process.env.HOST_PIN || '1234';
const PORT = Number(process.env.PORT || 3000);
const TURN_COUNTDOWN_MS = 3500;
const REVEALING_MS = 250;
const RESULT_MS = 2000;

type Action = 'charge' | 'shield' | 'blast';
type GameStatus = 'lobby' | 'countdown' | 'choosing' | 'revealing' | 'result' | 'paused' | 'gameOver';
type WordMode = 'kids' | 'cowboy';

type Player = {
  playerId: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  energy: number;
  score: number;
  choice: Action | null;
  joinedAt: number;
  consecutiveShield: number;
  pierceTokens: number;
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
  pierceAAfter: number;
  pierceBAfter: number;
  streakAAfter: number;
  streakBAfter: number;
  summary: string;
  notes: string[];
  actionA?: Action;
  actionB?: Action;
};

type PauseContext = {
  prevStatus: 'countdown' | 'choosing' | 'result' | 'revealing';
  remainingMs: number;
};

type Game = {
  players: Map<string, Player>;
  turn: number;
  targetScore: number;
  mode: WordMode;
  status: GameStatus;
  history: RoundResult[];
  lastResult: RoundResult | null;
  countdownEndAt: number | null;
  resultEndAt: number | null;
  pauseContext: PauseContext | null;
};

const game: Game = {
  players: new Map(),
  turn: 0,
  targetScore: 3,
  mode: 'kids',
  status: 'lobby',
  history: [],
  lastResult: null,
  countdownEndAt: null,
  resultEndAt: null,
  pauseContext: null
};

const socketMeta = new Map<string, { isHost: boolean; playerId?: string }>();
let countdownTimer: NodeJS.Timeout | null = null;
let revealingTimer: NodeJS.Timeout | null = null;
let resultTimer: NodeJS.Timeout | null = null;

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  pingInterval: 25000,
  pingTimeout: 60000
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

function clearTimers() {
  if (countdownTimer) clearTimeout(countdownTimer);
  if (revealingTimer) clearTimeout(revealingTimer);
  if (resultTimer) clearTimeout(resultTimer);
  countdownTimer = null;
  revealingTimer = null;
  resultTimer = null;
}

function getPlayerList() {
  return [...game.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
}

function labels(mode: WordMode, action: Action) {
  const words = {
    kids: { charge: '충전', shield: '방패', blast: '발사' },
    cowboy: { charge: '장전', shield: '방어', blast: '빵야' }
  };
  return words[mode][action];
}

function sanitizePlayerState(forPlayerId: string) {
  const players = getPlayerList();
  const me = players.find((p) => p.playerId === forPlayerId) ?? null;
  const other = players.find((p) => p.playerId !== forPlayerId) ?? null;

  return {
    me: me
      ? {
          playerId: me.playerId,
          name: me.name,
          connected: me.connected,
          energy: me.energy,
          score: me.score,
          hasChoice: Boolean(me.choice),
          consecutiveShield: me.consecutiveShield,
          pierceTokens: me.pierceTokens
        }
      : null,
    other: other
      ? {
          playerId: other.playerId,
          name: other.name,
          connected: other.connected,
          energy: other.energy,
          score: other.score,
          hasChoice: Boolean(other.choice),
          consecutiveShield: other.consecutiveShield,
          pierceTokens: other.pierceTokens
        }
      : null,
    game: {
      turn: game.turn,
      targetScore: game.targetScore,
      mode: game.mode,
      status: game.status,
      countdownEndAt: game.countdownEndAt,
      resultEndAt: game.resultEndAt,
      lastResult: game.lastResult,
      history: game.history
    }
  };
}

function sanitizeHostState() {
  return {
    players: getPlayerList().map((p) => ({
      playerId: p.playerId,
      name: p.name,
      connected: p.connected,
      energy: p.energy,
      score: p.score,
      hasChoice: Boolean(p.choice),
      consecutiveShield: p.consecutiveShield,
      pierceTokens: p.pierceTokens,
      joinedAt: p.joinedAt
    })),
    game: {
      turn: game.turn,
      targetScore: game.targetScore,
      mode: game.mode,
      status: game.status,
      countdownEndAt: game.countdownEndAt,
      resultEndAt: game.resultEndAt,
      lastResult: game.lastResult,
      history: game.history
    }
  };
}

function emitState() {
  io.sockets.sockets.forEach((socket) => {
    const meta = socketMeta.get(socket.id);
    if (meta?.isHost) socket.emit('host:state', sanitizeHostState());
    if (meta?.playerId) socket.emit('player:state', sanitizePlayerState(meta.playerId));
  });
}

function resetChoices() {
  for (const p of game.players.values()) p.choice = null;
}

function startCountdown(remainingMs = TURN_COUNTDOWN_MS) {
  clearTimers();
  resetChoices();
  game.status = 'countdown';
  game.countdownEndAt = Date.now() + remainingMs;
  game.resultEndAt = null;
  game.lastResult = null;
  game.pauseContext = null;
  emitState();

  countdownTimer = setTimeout(() => {
    game.status = 'choosing';
    game.countdownEndAt = null;
    emitState();
  }, remainingMs);
}

function startNextTurn() {
  game.turn += 1;
  startCountdown();
}

function startFreshMatch() {
  clearTimers();
  for (const p of game.players.values()) {
    p.energy = 0;
    p.score = 0;
    p.choice = null;
    p.consecutiveShield = 0;
    p.pierceTokens = 0;
  }
  game.turn = 0;
  game.lastResult = null;
  game.history = [];
  game.pauseContext = null;
  if (game.players.size >= 2) {
    startNextTurn();
  } else {
    game.status = 'lobby';
    game.countdownEndAt = null;
    game.resultEndAt = null;
    emitState();
  }
}

function requireHost(socketId: string) {
  return socketMeta.get(socketId)?.isHost === true;
}

function applyShieldStreak(player: Player, opponent: Player, notes: string[]) {
  if (player.choice === 'shield') {
    player.consecutiveShield += 1;
    if (player.consecutiveShield % 2 === 0) {
      opponent.pierceTokens += 1;
      notes.push('상대가 방어를 2번 연속 사용하여 관통권을 얻었습니다.');
    }
  } else {
    player.consecutiveShield = 0;
  }
}

function finishRound() {
  const players = getPlayerList();
  if (players.length < 2) return;
  const [a, b] = players;
  const actionA = a.choice;
  const actionB = b.choice;
  if (!actionA || !actionB) return;

  const notes: string[] = [];
  applyShieldStreak(a, b, notes);
  applyShieldStreak(b, a, notes);

  if (actionA === 'blast') a.energy -= 1;
  if (actionB === 'blast') b.energy -= 1;

  let summary = '아무 일도 일어나지 않았어요.';

  if (actionA === 'charge' && actionB === 'charge') {
    a.energy += 3;
    b.energy += 3;
    summary = `둘 다 ${labels(game.mode, 'charge')}! 둘 다 +3`;
  } else if (actionA === 'charge' && actionB === 'shield') {
    a.energy += 3;
    summary = `${a.name} ${labels(game.mode, 'charge')} 성공!`;
  } else if (actionA === 'shield' && actionB === 'charge') {
    b.energy += 3;
    summary = `${b.name} ${labels(game.mode, 'charge')} 성공!`;
  } else if (actionA === 'charge' && actionB === 'blast') {
    b.score += 1;
    summary = `${b.name}의 ${labels(game.mode, 'blast')} 적중! +1점`;
  } else if (actionA === 'blast' && actionB === 'charge') {
    a.score += 1;
    summary = `${a.name}의 ${labels(game.mode, 'blast')} 적중! +1점`;
  } else if (actionA === 'shield' && actionB === 'blast') {
    if (b.pierceTokens > 0) {
      b.pierceTokens -= 1;
      b.score += 1;
      summary = '관통권 발동! 방패를 뚫고 공격 성공!';
    } else {
      summary = `${a.name}의 ${labels(game.mode, 'shield')}가 막았습니다!`;
    }
  } else if (actionA === 'blast' && actionB === 'shield') {
    if (a.pierceTokens > 0) {
      a.pierceTokens -= 1;
      a.score += 1;
      summary = '관통권 발동! 방패를 뚫고 공격 성공!';
    } else {
      summary = `${b.name}의 ${labels(game.mode, 'shield')}가 막았습니다!`;
    }
  } else if (actionA === 'blast' && actionB === 'blast') {
    summary = `서로 ${labels(game.mode, 'blast')}! 점수 없음`;
  } else if (actionA === 'shield' && actionB === 'shield') {
    summary = `둘 다 ${labels(game.mode, 'shield')}! 변화 없음`;
  }

  game.lastResult = {
    turn: game.turn,
    playerAId: a.playerId,
    playerBId: b.playerId,
    playerAName: a.name,
    playerBName: b.name,
    actionA,
    actionB,
    scoreAAfter: a.score,
    scoreBAfter: b.score,
    energyAAfter: a.energy,
    energyBAfter: b.energy,
    pierceAAfter: a.pierceTokens,
    pierceBAfter: b.pierceTokens,
    streakAAfter: a.consecutiveShield,
    streakBAfter: b.consecutiveShield,
    summary,
    notes
  };
  game.history.push(game.lastResult);

  game.status = a.score >= game.targetScore || b.score >= game.targetScore ? 'gameOver' : 'result';
  game.resultEndAt = game.status === 'result' ? Date.now() + RESULT_MS : null;
  emitState();

  if (game.status === 'result') {
    resultTimer = setTimeout(() => {
      startNextTurn();
    }, RESULT_MS);
  }
}

function beginRevealPhase() {
  game.status = 'revealing';
  game.lastResult = {
    turn: game.turn,
    playerAId: '',
    playerBId: '',
    playerAName: '',
    playerBName: '',
    scoreAAfter: 0,
    scoreBAfter: 0,
    energyAAfter: 0,
    energyBAfter: 0,
    pierceAAfter: 0,
    pierceBAfter: 0,
    streakAAfter: 0,
    streakBAfter: 0,
    summary: '판정 중...',
    notes: []
  };
  emitState();
  revealingTimer = setTimeout(() => finishRound(), REVEALING_MS);
}

function pauseGame() {
  if (!['countdown', 'choosing', 'result', 'revealing'].includes(game.status)) return;

  let remainingMs = 0;
  if (game.status === 'countdown') {
    remainingMs = Math.max(0, (game.countdownEndAt ?? Date.now()) - Date.now());
  }
  if (game.status === 'result') {
    remainingMs = Math.max(0, (game.resultEndAt ?? Date.now()) - Date.now());
  }

  game.pauseContext = {
    prevStatus: game.status,
    remainingMs
  };

  clearTimers();
  game.status = 'paused';
  game.countdownEndAt = null;
  game.resultEndAt = null;
  emitState();
}

function resumeGame() {
  if (game.status !== 'paused' || !game.pauseContext) return;

  const { prevStatus, remainingMs } = game.pauseContext;
  game.pauseContext = null;

  if (prevStatus === 'countdown') {
    startCountdown(Math.max(500, remainingMs || TURN_COUNTDOWN_MS));
    return;
  }
  if (prevStatus === 'choosing' || prevStatus === 'revealing') {
    game.status = 'choosing';
    emitState();
    return;
  }
  if (prevStatus === 'result') {
    game.status = 'result';
    game.resultEndAt = Date.now() + Math.max(500, remainingMs || RESULT_MS);
    emitState();
    resultTimer = setTimeout(() => {
      startNextTurn();
    }, Math.max(500, remainingMs || RESULT_MS));
  }
}

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`);
  socket.emit('server:hello', { socketId: socket.id, now: Date.now() });

  socket.on('host:login', (payload: { pin?: string }) => {
    if (!payload?.pin || payload.pin !== HOST_PIN) {
      socket.emit('host:error', { message: 'PIN이 올바르지 않습니다.' });
      return;
    }
    socketMeta.set(socket.id, { isHost: true });
    emitState();
  });

  socket.on('host:setSettings', (payload: { targetScore?: number; mode?: WordMode }) => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    if (payload.targetScore && [1, 2, 3, 5].includes(payload.targetScore)) game.targetScore = payload.targetScore;
    if (payload.mode && ['kids', 'cowboy'].includes(payload.mode)) game.mode = payload.mode;
    emitState();
  });

  socket.on('host:start', () => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    if (game.players.size < 2) return socket.emit('host:error', { message: '참가자 2명이 필요합니다.' });
    if (game.status === 'paused') {
      resumeGame();
      return;
    }
    if (game.status === 'lobby' || game.status === 'gameOver') {
      startFreshMatch();
      return;
    }
    emitState();
  });

  socket.on('host:newMatch', () => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    startFreshMatch();
  });

  socket.on('host:pause', () => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    pauseGame();
  });

  socket.on('host:resume', () => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    resumeGame();
  });

  socket.on('host:clearPlayers', () => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    clearTimers();
    game.players.clear();
    game.turn = 0;
    game.status = 'lobby';
    game.lastResult = null;
    game.countdownEndAt = null;
    game.resultEndAt = null;
    game.history = [];
    game.pauseContext = null;
    emitState();
  });

  socket.on('host:reset', () => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    startFreshMatch();
  });

  socket.on('host:nextTurn', () => {
    if (!requireHost(socket.id)) return socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
    if (game.status === 'paused') startNextTurn();
  });

  socket.on('player:join', (payload: { playerId?: string; name?: string }) => {
    const name = payload?.name?.trim();
    if (!name) return socket.emit('player:error', { message: '이름을 입력해 주세요.' });

    let player: Player | undefined;
    if (payload.playerId) player = game.players.get(payload.playerId);

    if (!player) {
      if (game.players.size >= 2) return socket.emit('player:error', { message: '이미 참가자 2명이 들어왔습니다' });
      const playerId = payload.playerId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      player = {
        playerId,
        name,
        socketId: socket.id,
        connected: true,
        energy: 0,
        score: 0,
        choice: null,
        joinedAt: Date.now(),
        consecutiveShield: 0,
        pierceTokens: 0
      };
      game.players.set(playerId, player);
    } else {
      player.name = name;
      player.socketId = socket.id;
      player.connected = true;
    }

    socketMeta.set(socket.id, { isHost: false, playerId: player.playerId });

    if (game.players.size >= 2 && game.status === 'lobby') {
      game.status = 'paused';
    }

    emitState();
  });

  socket.on('player:choose', (payload: { action?: Action }) => {
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId) return socket.emit('player:error', { message: '참가자로 입장해 주세요.' });

    const actor = game.players.get(meta.playerId);
    if (!actor) return socket.emit('player:error', { message: '참가자 정보를 찾을 수 없습니다.' });

    const players = getPlayerList();
    if (players.length < 2) return socket.emit('player:error', { message: '참가자 2명이 모두 입장해야 합니다.' });
    if (game.status !== 'choosing') return socket.emit('player:error', { message: '지금은 선택할 수 없습니다.' });
    if (actor.choice) return socket.emit('player:error', { message: '이미 선택했습니다.' });

    const action = payload?.action;
    if (!action || !['charge', 'shield', 'blast'].includes(action)) {
      return socket.emit('player:error', { message: '올바른 선택이 아닙니다.' });
    }
    if (action === 'blast' && actor.energy <= 0) {
      return socket.emit('player:error', { message: '에너지가 0이면 발사할 수 없습니다.' });
    }

    actor.choice = action;
    emitState();

    if (players.every((p) => p.choice)) {
      clearTimers();
      beginRevealPhase();
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected ${socket.id} reason=${reason}`);
    const meta = socketMeta.get(socket.id);
    if (meta?.playerId) {
      const p = game.players.get(meta.playerId);
      if (p) {
        p.connected = false;
        p.socketId = null;
      }
    }
    socketMeta.delete(socket.id);
    emitState();
  });
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

function printLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = new Set<string>();
  Object.values(nets).forEach((iface) => {
    iface?.forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) ips.add(net.address);
    });
  });

  console.log(`서버 실행: http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`같은 Wi-Fi 접속 주소: http://${ip}:${PORT}`));
}

httpServer.listen(PORT, '0.0.0.0', () => {
  printLocalIPs();
});
