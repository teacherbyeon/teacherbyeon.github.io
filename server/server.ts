import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HOST_PIN = process.env.HOST_PIN || '1234';
const PORT = Number(process.env.PORT || 3000);

type Action = 'charge' | 'shield' | 'blast';
type GameStatus = 'lobby' | 'choosing' | 'revealing' | 'result' | 'gameOver';
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

type Game = {
  players: Map<string, Player>;
  turn: number;
  targetScore: number;
  mode: WordMode;
  status: GameStatus;
  history: RoundResult[];
  lastResult: RoundResult | null;
  revealAt: number | null;
};

const game: Game = {
  players: new Map(),
  turn: 1,
  targetScore: 3,
  mode: 'kids',
  status: 'lobby',
  history: [],
  lastResult: null,
  revealAt: null
};

const socketMeta = new Map<string, { isHost: boolean; playerId?: string }>();
let revealTimer: NodeJS.Timeout | null = null;

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
          hasChoice: Boolean(me.choice)
        }
      : null,
    other: other
      ? {
          playerId: other.playerId,
          name: other.name,
          connected: other.connected,
          energy: other.energy,
          score: other.score,
          hasChoice: Boolean(other.choice)
        }
      : null,
    game: {
      turn: game.turn,
      targetScore: game.targetScore,
      mode: game.mode,
      status: game.status,
      revealAt: game.revealAt,
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
      joinedAt: p.joinedAt
    })),
    game: {
      turn: game.turn,
      targetScore: game.targetScore,
      mode: game.mode,
      status: game.status,
      revealAt: game.revealAt,
      lastResult: game.lastResult,
      history: game.history
    }
  };
}

function emitState() {
  io.sockets.sockets.forEach((socket) => {
    const meta = socketMeta.get(socket.id);
    if (meta?.isHost) {
      socket.emit('host:state', sanitizeHostState());
    }
    if (meta?.playerId) {
      socket.emit('player:state', sanitizePlayerState(meta.playerId));
    }
  });
}

function resetRoundChoices() {
  for (const player of game.players.values()) {
    player.choice = null;
  }
}

function resetMatch() {
  for (const p of game.players.values()) {
    p.energy = 0;
    p.score = 0;
    p.choice = null;
  }
  game.turn = 1;
  game.status = game.players.size >= 2 ? 'choosing' : 'lobby';
  game.revealAt = null;
  game.lastResult = null;
  game.history = [];
}

function requireHost(socketId: string) {
  return socketMeta.get(socketId)?.isHost === true;
}

function resolveTurn() {
  const players = getPlayerList();
  if (players.length < 2) return;

  const [a, b] = players;
  const actionA = a.choice;
  const actionB = b.choice;
  if (!actionA || !actionB) return;

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
    summary = `${a.name}의 ${labels(game.mode, 'shield')}가 막았습니다!`;
  } else if (actionA === 'blast' && actionB === 'shield') {
    summary = `${b.name}의 ${labels(game.mode, 'shield')}가 막았습니다!`;
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
    summary
  };
  game.history.push(game.lastResult);

  if (a.score >= game.targetScore || b.score >= game.targetScore) {
    game.status = 'gameOver';
  } else {
    game.status = 'result';
  }

  game.revealAt = null;
  emitState();
}

function startReveal() {
  game.status = 'revealing';
  game.revealAt = Date.now() + 2500;

  const players = getPlayerList();
  if (players.length >= 2) {
    const [a, b] = players;
    game.lastResult = {
      turn: game.turn,
      playerAId: a.playerId,
      playerBId: b.playerId,
      playerAName: a.name,
      playerBName: b.name,
      scoreAAfter: a.score,
      scoreBAfter: b.score,
      energyAAfter: a.energy,
      energyBAfter: b.energy,
      summary: '결과 공개 준비 중...'
    };
  }

  emitState();
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = setTimeout(resolveTurn, 2500);
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
    if (!requireHost(socket.id)) {
      socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
      return;
    }

    if (payload.targetScore && [1, 2, 3, 5].includes(payload.targetScore)) {
      game.targetScore = payload.targetScore;
    }
    if (payload.mode && ['kids', 'cowboy'].includes(payload.mode)) {
      game.mode = payload.mode;
    }
    emitState();
  });

  socket.on('host:start', () => {
    if (!requireHost(socket.id)) {
      socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
      return;
    }
    resetMatch();
    emitState();
  });

  socket.on('host:nextTurn', () => {
    if (!requireHost(socket.id)) {
      socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
      return;
    }
    if (game.status !== 'result') return;

    game.turn += 1;
    game.status = 'choosing';
    game.lastResult = null;
    resetRoundChoices();
    emitState();
  });

  socket.on('host:reset', () => {
    if (!requireHost(socket.id)) {
      socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
      return;
    }
    for (const p of game.players.values()) {
      p.energy = 0;
      p.score = 0;
      p.choice = null;
    }
    game.status = game.players.size >= 2 ? 'choosing' : 'lobby';
    game.turn = 1;
    game.lastResult = null;
    game.revealAt = null;
    game.history = [];
    emitState();
  });

  socket.on('host:clearPlayers', () => {
    if (!requireHost(socket.id)) {
      socket.emit('host:error', { message: '진행자 권한이 없습니다.' });
      return;
    }
    game.players.clear();
    game.turn = 1;
    game.status = 'lobby';
    game.lastResult = null;
    game.revealAt = null;
    game.history = [];
    emitState();
  });

  socket.on('player:join', (payload: { playerId?: string; name?: string }) => {
    const name = payload?.name?.trim();
    if (!name) {
      socket.emit('player:error', { message: '이름을 입력해 주세요.' });
      return;
    }

    let player: Player | undefined;
    if (payload.playerId) {
      player = game.players.get(payload.playerId);
    }

    if (!player) {
      if (game.players.size >= 2) {
        socket.emit('player:error', { message: '이미 참가자 2명이 들어왔습니다' });
        return;
      }
      const playerId = payload.playerId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      player = {
        playerId,
        name,
        socketId: socket.id,
        connected: true,
        energy: 0,
        score: 0,
        choice: null,
        joinedAt: Date.now()
      };
      game.players.set(playerId, player);
    } else {
      player.name = name;
      player.socketId = socket.id;
      player.connected = true;
    }

    socketMeta.set(socket.id, { isHost: false, playerId: player.playerId });

    if (game.players.size >= 2 && game.status === 'lobby') {
      game.status = 'choosing';
    }

    emitState();
  });

  socket.on('player:choose', (payload: { action?: Action }) => {
    const meta = socketMeta.get(socket.id);
    if (!meta?.playerId) {
      socket.emit('player:error', { message: '참가자로 입장해 주세요.' });
      return;
    }

    const actor = game.players.get(meta.playerId);
    if (!actor) {
      socket.emit('player:error', { message: '참가자 정보를 찾을 수 없습니다.' });
      return;
    }

    const players = getPlayerList();
    if (players.length < 2) {
      socket.emit('player:error', { message: '참가자 2명이 모두 입장해야 합니다.' });
      return;
    }

    if (game.status !== 'choosing') {
      socket.emit('player:error', { message: '지금은 선택할 수 없습니다.' });
      return;
    }

    if (actor.choice) {
      socket.emit('player:error', { message: '이미 선택했습니다.' });
      return;
    }

    const action = payload?.action;
    if (!action || !['charge', 'shield', 'blast'].includes(action)) {
      socket.emit('player:error', { message: '올바른 선택이 아닙니다.' });
      return;
    }

    if (action === 'blast' && actor.energy <= 0) {
      socket.emit('player:error', { message: '에너지가 0이면 발사할 수 없습니다.' });
      return;
    }

    actor.choice = action;
    emitState();

    if (players.every((p) => p.choice)) {
      startReveal();
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
      if (net.family === 'IPv4' && !net.internal) {
        ips.add(net.address);
      }
    });
  });

  console.log(`서버 실행: http://localhost:${PORT}`);
  ips.forEach((ip) => {
    console.log(`같은 Wi-Fi 접속 주소: http://${ip}:${PORT}`);
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  printLocalIPs();
});
