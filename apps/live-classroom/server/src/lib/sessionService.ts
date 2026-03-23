import { db } from '../db.js';

export function makeJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getSessionByCode(code: string) {
  return db.prepare('SELECT * FROM sessions WHERE joinCode = ?').get(code);
}

export function getSessionState(sessionId: number) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return null;
  const currentQuestion = session.activeQuestionId
    ? db.prepare('SELECT * FROM questions WHERE id = ?').get(session.activeQuestionId)
    : null;
  const currentPoll = session.activePollId
    ? db.prepare('SELECT * FROM polls WHERE id = ?').get(session.activePollId)
    : null;
  const leaderboard = db
    .prepare(
      `SELECT st.id, st.displayName, COALESCE(SUM(sl.totalAwarded),0) AS totalScore
       FROM students st
       LEFT JOIN score_logs sl ON st.id = sl.studentId
       WHERE st.sessionId = ?
       GROUP BY st.id
       ORDER BY totalScore DESC, st.id ASC`
    )
    .all(sessionId);

  return {
    session,
    currentQuestion,
    currentPoll,
    leaderboard
  };
}

export function getQuestionStats(questionId: number) {
  const responses = db
    .prepare(
      `SELECT selectedOptionIndex, COUNT(*) as count
       FROM responses WHERE questionId = ?
       GROUP BY selectedOptionIndex`
    )
    .all(questionId) as { selectedOptionIndex: number; count: number }[];
  return responses;
}

export function getPollStats(pollId: number) {
  return db
    .prepare(
      `SELECT selectedOptionIndex, COUNT(*) as count FROM poll_votes WHERE pollId = ? GROUP BY selectedOptionIndex`
    )
    .all(pollId) as { selectedOptionIndex: number; count: number }[];
}
