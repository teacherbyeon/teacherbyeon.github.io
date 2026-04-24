export type TileValue = number | 'J';

export interface GameSettings {
  boardSize: 20;
  includeJoker: boolean;
  animationOn: boolean;
  soundOn: boolean;
  deckConfig: Record<string, number>;
}

export interface TeacherStudentRow {
  studentKey: string;
  nickname: string;
  connected: boolean;
  reconnectCount: number;
  lastSeenAt: number;
  score: number;
  placed: boolean;
}

export interface TeacherStateInit {
  teacherConnected: boolean;
  game: {
    inProgress: boolean;
    round: number;
    totalRounds: number;
    remainingDraws: number;
    currentNumber: TileValue | null;
    drawHistory: TileValue[];
    settings: GameSettings | null;
  };
  students: TeacherStudentRow[];
}

export interface StudentInit {
  studentKey: string;
  nickname: string;
  round: number;
  totalRounds: number;
  currentNumber: TileValue | null;
  board: Array<TileValue | null>;
  score: number;
  placed: boolean;
  connected: boolean;
}
