import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { getStudentLiveState, getTeacherState } from '../lib/sessionService.js';

export let io: Server;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: config.clientOrigin, credentials: true },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    socket.on('session:joinRoom', ({ sessionId, role = 'student', studentId }: { sessionId: number; role?: 'teacher' | 'student'; studentId?: number }) => {
      if (!Number.isFinite(sessionId) || sessionId <= 0) {
        socket.emit('session:joinRoomAck', { ok: false, reason: 'invalid_session' });
        return;
      }
      const teacherState = getTeacherState(sessionId);
      if (!teacherState) {
        socket.emit('session:joinRoomAck', { ok: false, reason: 'session_not_found' });
        return;
      }
      socket.join(`session:${sessionId}:${role}`);
      socket.data.sessionId = sessionId;
      socket.data.role = role;
      socket.data.studentId = studentId;
      socket.emit('session:joinRoomAck', { ok: true, sessionId, role });
      if (role === 'teacher') {
        socket.emit('teacher:stateUpdated', teacherState);
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

export async function emitStudentUpdate(sessionId: number) {
  const sockets = await io.in(`session:${sessionId}:student`).fetchSockets();
  for (const s of sockets) {
    const sid = typeof s.data.studentId === 'number' ? s.data.studentId : undefined;
    s.emit('student:liveStateUpdated', getStudentLiveState(sessionId, sid));
  }
}

export function emitAll(sessionId: number) {
  emitTeacherUpdate(sessionId);
  void emitStudentUpdate(sessionId);
}
