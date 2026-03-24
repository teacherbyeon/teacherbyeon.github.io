import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { getSessionState } from '../lib/sessionService.js';

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
      socket.emit('session:stateUpdated', getSessionState(sessionId));
    });
  });

  return io;
}

export function emitSessionUpdate(sessionId: number) {
  io.to(`session:${sessionId}`).emit('session:stateUpdated', getSessionState(sessionId));
}
