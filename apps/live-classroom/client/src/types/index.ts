export interface Session {
  id: number;
  name: string;
  joinCode: string;
  randomNicknameEnabled: number;
  status: 'waiting' | 'active' | 'closed';
  startedAt: string | null;
  closedAt: string | null;
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
  prompt: string;
  imagePath: string | null;
  optionsJson: string;
  correctOptionIndex: number;
  weight: number;
  orderInSession: number;
}

export interface SessionStatePayload {
  session: Session;
  questionSet: Question[];
  progress: {
    totalStudents: number;
    submittedStudents: number;
    notSubmitted: Array<{ id: number; displayName: string }>;
  };
  leaderboard: Array<{ id: number; displayName: string; totalScore: number }>;
}
