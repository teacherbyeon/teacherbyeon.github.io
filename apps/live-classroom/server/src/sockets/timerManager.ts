import { db } from '../db.js';
import { emitSessionUpdate } from './socket.js';

export function startTimerLoop() {
  setInterval(() => {
    const now = Date.now();

    const activeQuestions = db
      .prepare(`SELECT id, sessionId, startedAt, timeLimitSeconds FROM questions WHERE status = 'active'`)
      .all() as { id: number; sessionId: number; startedAt: string; timeLimitSeconds: number }[];

    for (const q of activeQuestions) {
      const endMs = new Date(q.startedAt).getTime() + q.timeLimitSeconds * 1000;
      const remainingMs = Math.max(0, endMs - now);
      if (remainingMs === 0) {
        db.prepare(`UPDATE questions SET status = 'ended', endedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(q.id);
        db.prepare(`UPDATE sessions SET activeQuestionId = NULL WHERE id = ?`).run(q.sessionId);
        emitSessionUpdate(q.sessionId);
      }
    }

    const activePolls = db
      .prepare(`SELECT id, sessionId, startedAt, timeLimitSeconds FROM polls WHERE status = 'active' AND timeLimitSeconds IS NOT NULL`)
      .all() as { id: number; sessionId: number; startedAt: string; timeLimitSeconds: number }[];

    for (const p of activePolls) {
      const endMs = new Date(p.startedAt).getTime() + p.timeLimitSeconds * 1000;
      const remainingMs = Math.max(0, endMs - now);
      if (remainingMs === 0) {
        db.prepare(`UPDATE polls SET status = 'ended', endedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(p.id);
        db.prepare(`UPDATE sessions SET activePollId = NULL WHERE id = ?`).run(p.sessionId);
        emitSessionUpdate(p.sessionId);
      }
    }
  }, 1000);
}
