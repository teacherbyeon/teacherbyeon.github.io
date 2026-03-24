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

  const questionSet = db.prepare('SELECT * FROM questions WHERE sessionId = ? ORDER BY orderInSession').all(sessionId);
  const students = db.prepare('SELECT id, displayName FROM students WHERE sessionId = ? ORDER BY id').all(sessionId) as Array<{ id: number; displayName: string }>;

  const submissions = db
    .prepare('SELECT studentId, submittedAt FROM submissions WHERE sessionId = ?')
    .all(sessionId) as Array<{ studentId: number; submittedAt: string }>;

  const submissionSet = new Set(submissions.map((s) => s.studentId));

  const leaderboard = db
    .prepare(
      `SELECT st.id, st.displayName, COALESCE(SUM(r.awardedScore),0) AS totalScore
       FROM students st
       LEFT JOIN responses r ON st.id = r.studentId
       WHERE st.sessionId = ?
       GROUP BY st.id
       ORDER BY totalScore DESC, st.id ASC`
    )
    .all(sessionId);

  const progress = {
    totalStudents: students.length,
    submittedStudents: submissions.length,
    notSubmitted: students.filter((s) => !submissionSet.has(s.id))
  };

  return {
    session,
    questionSet,
    progress,
    leaderboard
  };
}
