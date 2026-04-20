export type Role = 'host' | 'participant';

export type GamePhase = 'waiting' | 'placement' | 'ready' | 'started' | 'finished';

export interface ParticipantRoomState {
  participantId: string;
  sessionId: string;
  nickname: string;
  connected: boolean;
}

export interface ParticipantGameState {
  participantId: string;
  board: Array<number | null>;
  placementOrder: number[];
  ready: boolean;
  lineCount: number;
  win: boolean;
}

export interface RoomState {
  roomCode: string;
  hostConnected: boolean;
  participants: ParticipantRoomState[];
}

export interface GameState {
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

export interface SnapshotPayload {
  room: RoomState;
  game: GameState;
}

export interface ParticipantSelf {
  participantId: string;
  sessionId: string;
  nickname: string;
}
