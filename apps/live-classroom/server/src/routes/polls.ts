import { Router } from 'express';
import { db } from '../db.js';
import { emitPollStats, emitSessionUpdate } from '../sockets/socket.js';

export const pollsRouter = Router();

pollsRouter.post('/', (req, res) => {
  const { sessionId, title, options, isAnonymous = true, isLiveResultVisible = true, timeLimitSeconds = null } = req.body;
  if (!sessionId || !title || !Array.isArray(options) || options.length < 2 || options.length > 5) {
    return res.status(400).json({ error: 'invalid poll payload' });
  }

  const r = db
    .prepare(
      `INSERT INTO polls (sessionId, title, optionsJson, isAnonymous, isLiveResultVisible, timeLimitSeconds)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(sessionId, title, JSON.stringify(options), isAnonymous ? 1 : 0, isLiveResultVisible ? 1 : 0, timeLimitSeconds);

  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(r.lastInsertRowid);
  emitSessionUpdate(Number(sessionId));
  res.status(201).json(poll);
});

pollsRouter.post('/:id/start', (req, res) => {
  const id = Number(req.params.id);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as any;
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  if (poll.status !== 'draft') return res.status(400).json({ error: 'poll must be draft' });
  db.prepare(`UPDATE polls SET status = 'active', startedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  db.prepare('UPDATE sessions SET activePollId = ?, activeQuestionId = NULL WHERE id = ?').run(id, poll.sessionId);
  emitSessionUpdate(poll.sessionId);
  res.json({ ok: true });
});

pollsRouter.post('/:id/end', (req, res) => {
  const id = Number(req.params.id);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as any;
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  db.prepare(`UPDATE polls SET status = 'ended', endedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  db.prepare('UPDATE sessions SET activePollId = NULL WHERE id = ?').run(poll.sessionId);
  emitSessionUpdate(poll.sessionId);
  res.json({ ok: true });
});

pollsRouter.post('/:id/vote', (req, res) => {
  const id = Number(req.params.id);
  const { studentId, selectedOptionIndex } = req.body as { studentId: number; selectedOptionIndex: number };
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as any;
  if (!poll) return res.status(404).json({ error: 'poll not found' });
  if (poll.status !== 'active') return res.status(400).json({ error: 'poll not active' });

  const student = db
    .prepare('SELECT * FROM students WHERE id = ? AND sessionId = ?')
    .get(studentId, poll.sessionId);
  if (!student) return res.status(400).json({ error: 'student not in session' });

  const exist = db.prepare('SELECT id FROM poll_votes WHERE pollId = ? AND studentId = ?').get(id, studentId);
  if (exist) return res.status(409).json({ error: 'already voted' });

  db.prepare('INSERT INTO poll_votes (sessionId, pollId, studentId, selectedOptionIndex) VALUES (?, ?, ?, ?)').run(
    poll.sessionId,
    id,
    studentId,
    selectedOptionIndex
  );

  emitPollStats(poll.sessionId, id);
  emitSessionUpdate(poll.sessionId);
  res.status(201).json({ ok: true });
});

pollsRouter.get('/:id/results', (req, res) => {
  const id = Number(req.params.id);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(id) as any;
  if (!poll) return res.status(404).json({ error: 'poll not found' });

  const counts = db
    .prepare('SELECT selectedOptionIndex, COUNT(*) as count FROM poll_votes WHERE pollId = ? GROUP BY selectedOptionIndex')
    .all(id);

  const namedVotes = db
    .prepare(
      `SELECT st.displayName, pv.selectedOptionIndex FROM poll_votes pv
      JOIN students st ON st.id = pv.studentId
      WHERE pv.pollId = ? ORDER BY pv.id`
    )
    .all(id);

  res.json({
    poll,
    counts,
    namedVotes: poll.isAnonymous ? [] : namedVotes
  });
});
