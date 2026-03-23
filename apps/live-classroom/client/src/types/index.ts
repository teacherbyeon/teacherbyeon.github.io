export interface Session {
  id: number;
  name: string;
  joinCode: string;
  randomNicknameEnabled: number;
  activeQuestionId: number | null;
  activePollId: number | null;
}

export interface Student {
  id: number;
  sessionId: number;
  displayName: string;
  identifier: string;
}

export interface Question {
  id: number;
  sessionId: number;
  title: string | null;
  body: string | null;
  imagePath: string | null;
  optionsJson: string;
  correctOptionIndex: number;
  timeLimitSeconds: number;
  status: 'idle' | 'active' | 'ended' | 'revealed';
  orderInSession: number;
  startedAt?: string | null;
}

export interface Poll {
  id: number;
  sessionId: number;
  title: string;
  optionsJson: string;
  status: 'draft' | 'active' | 'ended';
  isAnonymous: number;
}
