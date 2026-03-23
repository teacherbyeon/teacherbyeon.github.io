import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { getPollStats, getQuestionStats, getSessionState } from '../lib/sessionService.js';

export let io: Server;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: config.clientOrigin,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    socket.on('session:joinRoom', ({ sessionId }: { sessionId: number }) => {
      socket.join(`session:${sessionId}`);
      const state = getSessionState(sessionId);
      socket.emit('display:stateUpdated', state);
    });
  });

  return io;
}

export function emitSessionUpdate(sessionId: number) {
  io.to(`session:${sessionId}`).emit('display:stateUpdated', getSessionState(sessionId));
}

export function emitQuestionStats(sessionId: number, questionId: number) {
  io.to(`session:${sessionId}`).emit('question:responseCountUpdated', {
    questionId,
    counts: getQuestionStats(questionId)
  });
}

export function emitPollStats(sessionId: number, pollId: number) {
  io.to(`session:${sessionId}`).emit('poll:resultsUpdated', {
    pollId,
    counts: getPollStats(pollId)
  });
}
