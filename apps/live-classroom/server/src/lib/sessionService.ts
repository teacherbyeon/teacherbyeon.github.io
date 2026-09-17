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

export function getCurrentQuestion(sessionId: number, order: number) {
  if (order <= 0) return null;
  return db.prepare('SELECT * FROM questions WHERE sessionId = ? AND orderInSession = ?').get(sessionId, order);
}

export function getLeaderboard(sessionId: number) {
  return db
    .prepare(
      `SELECT st.id, st.displayName, COALESCE(SUM(r.awardedScore),0) AS totalScore
       FROM students st
       LEFT JOIN responses r ON st.id = r.studentId
       WHERE st.sessionId = ?
       GROUP BY st.id
       ORDER BY totalScore DESC, st.id ASC`
    )
    .all(sessionId);
}

export function getTeacherState(sessionId: number) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return null;

  const questionSet = db.prepare('SELECT * FROM questions WHERE sessionId = ? ORDER BY orderInSession').all(sessionId);
  const students = db.prepare('SELECT id, displayName FROM students WHERE sessionId = ? ORDER BY id').all(sessionId) as Array<{ id: number; displayName: string }>;
  const currentQuestion = getCurrentQuestion(sessionId, session.currentQuestionOrder);
  const responseCount = currentQuestion
    ? (db.prepare('SELECT COUNT(*) AS c FROM responses WHERE questionId = ?').get((currentQuestion as any).id) as any).c
    : 0;

  return {
    session,
    questionSet,
    currentQuestion,
    progress: {
      joinedStudents: students.length,
      respondedCurrent: responseCount,
      notResponded: currentQuestion
        ? students.filter((s) => !db.prepare('SELECT 1 FROM responses WHERE questionId = ? AND studentId = ?').get((currentQuestion as any).id, s.id))
        : students
    },
    leaderboard: getLeaderboard(sessionId)
  };
}

export function getStudentLiveState(sessionId: number, studentId?: number) {
  const session = db.prepare('SELECT id,name,joinCode,status,currentQuestionOrder,questionState,questionDeadlineAt FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return null;

  const currentQuestion = session.questionState === 'revealed' ? getCurrentQuestion(sessionId, session.currentQuestionOrder) : null;
  const alreadyAnswered =
    currentQuestion && studentId
      ? Boolean(db.prepare('SELECT id FROM responses WHERE questionId = ? AND studentId = ?').get((currentQuestion as any).id, studentId))
      : false;

  return {
    session,
    currentQuestion: currentQuestion
      ? {
          id: (currentQuestion as any).id,
          orderInSession: (currentQuestion as any).orderInSession,
          prompt: (currentQuestion as any).prompt,
          imagePath: (currentQuestion as any).imagePath,
          optionsJson: (currentQuestion as any).optionsJson,
          timeLimitSeconds: (currentQuestion as any).timeLimitSeconds
        }
      : null,
    alreadyAnswered,
    leaderboard: session.status === 'finished' ? getLeaderboard(sessionId) : []
  };
}
