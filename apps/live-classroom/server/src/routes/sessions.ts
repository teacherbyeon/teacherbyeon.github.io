import { Router } from 'express';
import { stringify } from 'csv-stringify/sync';
import fs from 'node:fs';
import path from 'node:path';
import { db, paths } from '../db.js';
import { emitSessionUpdate } from '../sockets/socket.js';
import { getSessionByCode, makeJoinCode } from '../lib/sessionService.js';

const randomNames = ['반짝호랑이', '푸른고래', '우주토끼', '행복판다', '번개독수리'];

export const sessionsRouter = Router();

sessionsRouter.get('/code/:joinCode', (req, res) => {
  const joinCode = String(req.params.joinCode || '').toUpperCase();
  const session = db.prepare('SELECT * FROM sessions WHERE joinCode = ?').get(joinCode);
  if (!session) return res.status(404).json({ error: 'session not found' });
  res.json(session);
});

sessionsRouter.post('/', (req, res) => {
  const { name, randomNicknameEnabled = false } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  let joinCode = makeJoinCode();
  while (getSessionByCode(joinCode)) joinCode = makeJoinCode();

  const result = db
    .prepare('INSERT INTO sessions (name, joinCode, randomNicknameEnabled) VALUES (?, ?, ?)')
    .run(name, joinCode, randomNicknameEnabled ? 1 : 0);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(session);
});

sessionsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  const students = db.prepare('SELECT * FROM students WHERE sessionId = ? ORDER BY id').all(id);
  const questions = db.prepare('SELECT * FROM questions WHERE sessionId = ? ORDER BY orderInSession').all(id);
  const polls = db.prepare('SELECT * FROM polls WHERE sessionId = ? ORDER BY id').all(id);
  res.json({ session, students, questions, polls });
});

sessionsRouter.post('/:id/students/join', (req, res) => {
  const sessionId = Number(req.params.id);
  const { name, identifier, existingStudentId } = req.body as {
    name?: string;
    identifier?: string;
    existingStudentId?: number;
  };
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return res.status(404).json({ error: 'session not found' });

  if (existingStudentId) {
    const existing = db
      .prepare('SELECT * FROM students WHERE id = ? AND sessionId = ?')
      .get(existingStudentId, sessionId);
    if (existing) {
      db.prepare('UPDATE students SET lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?').run(existingStudentId);
      emitSessionUpdate(sessionId);
      return res.json(existing);
    }
  }

  if (!identifier) return res.status(400).json({ error: 'identifier is required' });

  let displayName = name?.trim() || `학생-${identifier}`;
  if (session.randomNicknameEnabled && !name?.trim()) {
    const idx = Math.floor(Math.random() * randomNames.length);
    displayName = `${randomNames[idx]}-${Math.floor(Math.random() * 90 + 10)}`;
  }

  const found = db
    .prepare('SELECT * FROM students WHERE sessionId = ? AND identifier = ?')
    .get(sessionId, identifier) as any;
  if (found) {
    db.prepare('UPDATE students SET displayName = ?, lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?').run(displayName, found.id);
    emitSessionUpdate(sessionId);
    return res.json({ ...found, displayName });
  }

  const r = db
    .prepare('INSERT INTO students (sessionId, name, displayName, identifier) VALUES (?, ?, ?, ?)')
    .run(sessionId, name ?? identifier, displayName, identifier);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(r.lastInsertRowid);
  emitSessionUpdate(sessionId);
  res.status(201).json(student);
});

sessionsRouter.get('/:id/leaderboard', (req, res) => {
  const sessionId = Number(req.params.id);
  const board = db
    .prepare(
      `SELECT st.id, st.displayName, COALESCE(SUM(sl.totalAwarded), 0) AS totalScore
       FROM students st
       LEFT JOIN score_logs sl ON sl.studentId = st.id
       WHERE st.sessionId = ?
       GROUP BY st.id
       ORDER BY totalScore DESC, st.id ASC`
    )
    .all(sessionId);
  res.json(board);
});

sessionsRouter.get('/:id/analysis', (req, res) => {
  const sessionId = Number(req.params.id);
  const rows = db
    .prepare(
      `SELECT q.id as questionId, q.title, q.orderInSession,
      COUNT(r.id) as responses,
      SUM(CASE WHEN r.isCorrect = 1 THEN 1 ELSE 0 END) as correctCount,
      AVG(r.responseTimeMs) as avgResponseMs
      FROM questions q
      LEFT JOIN responses r ON q.id = r.questionId
      WHERE q.sessionId = ?
      GROUP BY q.id ORDER BY q.orderInSession`
    )
    .all(sessionId);
  res.json(rows);
});

sessionsRouter.get('/:id/export', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return res.status(404).json({ error: 'session not found' });

  const rows = db
    .prepare(
      `SELECT st.displayName as studentName, q.orderInSession, q.title,
              r.selectedOptionIndex, r.isCorrect, r.responseTimeMs, r.awardedScore
       FROM students st
       LEFT JOIN responses r ON st.id = r.studentId
       LEFT JOIN questions q ON q.id = r.questionId
       WHERE st.sessionId = ?
       ORDER BY st.id, q.orderInSession`
    )
    .all(sessionId);

  const csv = stringify(rows, { header: true });
  const fileName = `session-${sessionId}-${Date.now()}.csv`;
  const filePath = path.join(paths.exportDir, fileName);
  fs.writeFileSync(filePath, csv, 'utf8');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
  res.send(csv);
});
