import { db } from '../db.js';
import { emitAll } from './socket.js';

export function startTimerLoop() {
  setInterval(() => {
    const now = Date.now();
    const active = db
      .prepare("SELECT id, questionDeadlineAt, questionState FROM sessions WHERE status = 'active' AND questionState = 'revealed' AND questionDeadlineAt IS NOT NULL")
      .all() as Array<{ id: number; questionDeadlineAt: string; questionState: string }>;

    for (const s of active) {
      const deadline = new Date(s.questionDeadlineAt).getTime();
      if (now >= deadline) {
        db.prepare("UPDATE sessions SET questionState = 'closed', questionDeadlineAt = NULL WHERE id = ?").run(s.id);
        emitAll(s.id);
      }
    }
  }, 1000);
}
