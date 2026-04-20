export type TileValue = number | 'J';

export interface ParticipantSummary {
  id: string;
  nickname: string;
  connected: boolean;
  reconnectCount: number;
  lastSeenAt: number;
 score: number;
  submitted: boolean;
  hasTempPlacement: boolean;
}

export interface GameSettings {
  boardSize: 20;
  includeJoker: boolean;
  animationOn: boolean;
  soundOn: boolean;
  deckConfig: Record<string, number>;
}

export interface HostStateView {
  role: 'host';
  hostConnected: boolean;
  participants: ParticipantSummary[];
  game: {
    inProgress: boolean;
    settings: GameSettings | null;
    round: number;
    totalRounds: number;
    remainingDraws: number;
    currentNumber: TileValue | null;
    drawHistory: TileValue[];
  };
}

export interface ParticipantStateView {
  role: 'participant';
  participantId: string;
  nickname: string;
  connected: boolean;
  participantsCount: number;
  game: {
    inProgress: boolean;
    round: number;
    totalRounds: number;
    remainingSlots: number;
    currentNumber: TileValue | null;
    board: Array<TileValue | null>;
    tempPlacementIndex: number | null;
    score: number;
    submitted: boolean;
    message: string;
  };
}

export type ClientEventMap = {
  'host:login': (payload: { pin: string }) => void;
  'host:start-game': (payload: { settings: GameSettings }) => void;
  'host:draw': () => void;
  'host:rewind': () => void;
  'host:new-game': (payload: { settings: GameSettings }) => void;
  'host:end-room': () => void;
  'participant:join': (payload: { nickname: string; participantId?: string }) => void;
  'participant:place-temp': (payload: { participantId: string; index: number }) => void;
};

export type ServerEventMap = {
  'host:login:ok': () => void;
  'host:login:error': (payload: { message: string }) => void;
  'participant:join:ok': (payload: { participantId: string }) => void;
  'participant:join:error': (payload: { message: string }) => void;
  'state:host': (payload: HostStateView) => void;
  'state:participant': (payload: ParticipantStateView) => void;
  'room:ended': () => void;
  'server:error': (payload: { message: string }) => void;
};
