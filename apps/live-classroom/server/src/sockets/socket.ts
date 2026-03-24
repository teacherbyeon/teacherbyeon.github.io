import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { getStudentLiveState, getTeacherState } from '../lib/sessionService.js';

export let io: Server;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: config.clientOrigin, credentials: true }
  });

  io.on('connection', (socket) => {
    socket.on('session:joinRoom', ({ sessionId, role = 'student', studentId }: { sessionId: number; role?: 'teacher' | 'student'; studentId?: number }) => {
      socket.join(`session:${sessionId}:${role}`);
      if (role === 'teacher') {
        socket.emit('teacher:stateUpdated', getTeacherState(sessionId));
      } else {
        socket.emit('student:liveStateUpdated', getStudentLiveState(sessionId, studentId));
      }
    });
  });

  return io;
}

export function emitTeacherUpdate(sessionId: number) {
  io.to(`session:${sessionId}:teacher`).emit('teacher:stateUpdated', getTeacherState(sessionId));
}

export function emitStudentUpdate(sessionId: number) {
  io.to(`session:${sessionId}:student`).emit('student:liveStateUpdated', getStudentLiveState(sessionId));
}

export function emitAll(sessionId: number) {
  emitTeacherUpdate(sessionId);
  emitStudentUpdate(sessionId);
}
