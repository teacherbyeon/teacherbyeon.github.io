export interface Session {
  id: number;
  name: string;
  joinCode: string;
  status: 'waiting' | 'active' | 'finished';
  currentQuestionOrder: number;
  questionState: 'waiting' | 'revealed' | 'closed';
  questionDeadlineAt: string | null;
}

export interface Question {
  id: number;
  sessionId: number;
  prompt: string;
  imagePath: string | null;
  optionsJson: string;
  correctOptionIndex: number;
  weight: number;
  timeLimitSeconds: number;
  orderInSession: number;
}

export interface TeacherState {
  session: Session;
  questionSet: Question[];
  currentQuestion: Question | null;
  progress: {
    joinedStudents: number;
    respondedCurrent: number;
    notResponded: Array<{ id: number; displayName: string }>;
  };
  leaderboard: Array<{ id: number; displayName: string; totalScore: number }>;
}

export interface StudentLiveState {
  session: Session;
  currentQuestion: null | {
    id: number;
    orderInSession: number;
    prompt: string;
    imagePath: string | null;
    optionsJson: string;
    timeLimitSeconds: number;
  };
  alreadyAnswered: boolean;
  leaderboard: Array<{ id: number; displayName: string; totalScore: number }>;
}
