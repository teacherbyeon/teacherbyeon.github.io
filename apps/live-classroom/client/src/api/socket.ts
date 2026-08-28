import { io } from 'socket.io-client';

export type SessionRoomJoin = { sessionId: number; role?: 'teacher' | 'student'; studentId?: number | null };
type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const roomMap = new Map<string, SessionRoomJoin>();
const statusListeners = new Set<(status: SocketStatus) => void>();

function toRoomKey(payload: SessionRoomJoin) {
  return `${payload.sessionId}:${payload.role ?? 'student'}:${payload.studentId ?? 'none'}`;
}

function logDev(...args: unknown[]) {
  if (import.meta.env.DEV) console.log('[socket]', ...args);
}

let currentStatus: SocketStatus = 'connecting';
function setStatus(next: SocketStatus) {
  currentStatus = next;
  for (const listener of statusListeners) listener(next);
}

export const socket = io('/', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 10000
});

socket.on('connect', () => {
  setStatus('connected');
  logDev('connected', socket.id);
  for (const payload of roomMap.values()) {
    socket.emit('session:joinRoom', payload);
    logDev('rejoin session room', payload);
  }
});

socket.on('disconnect', (reason) => {
  setStatus('disconnected');
  logDev('disconnected', reason);
});

socket.io.on('reconnect_attempt', (attempt) => {
  setStatus('reconnecting');
  logDev('reconnect attempt', attempt);
});

socket.on('session:joinRoomAck', (payload) => {
  logDev('join room ack', payload);
});

export function joinSessionRoom(payload: SessionRoomJoin) {
  roomMap.set(toRoomKey(payload), payload);
  socket.emit('session:joinRoom', payload);
}

export function subscribeSocketStatus(listener: (status: SocketStatus) => void) {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => statusListeners.delete(listener);
}
