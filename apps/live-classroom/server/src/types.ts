export type QuestionStatus = 'idle' | 'active' | 'ended' | 'revealed';
export type PollStatus = 'draft' | 'active' | 'ended';

export interface SessionState {
  sessionId: number;
  currentQuestionId: number | null;
  currentPollId: number | null;
}
