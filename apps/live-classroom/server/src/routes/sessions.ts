import { Router } from 'express';
import { stringify } from 'csv-stringify/sync';
import fs from 'node:fs';
import path from 'node:path';
import { db, paths } from '../db.js';
import { emitAll, emitStudentUpdate, emitTeacherUpdate } from '../sockets/socket.js';
import { getSessionByCode, getStudentLiveState, getTeacherState, makeJoinCode } from '../lib/sessionService.js';

const randomNames = ['반짝호랑이', '푸른고래', '우주토끼', '행복판다', '번개독수리'];

export const sessionsRouter = Router();

sessionsRouter.get('/', (_req, res) => {
  const sessions = db
    .prepare(
      `SELECT s.*, COUNT(q.id) AS questionCount
       FROM sessions s
       LEFT JOIN questions q ON q.sessionId = s.id
       GROUP BY s.id
       ORDER BY s.id DESC`
    )
    .all();
  res.json(sessions);
});

sessionsRouter.get('/code/:joinCode', (req, res) => {
  const joinCode = String(req.params.joinCode || '').toUpperCase();
  const session = db.prepare('SELECT * FROM sessions WHERE joinCode = ?').get(joinCode);
  if (!session) return res.status(404).json({ error: 'session not found' });
  res.json(session);
});

sessionsRouter.post('/', (req, res) => {
  const { name, randomNicknameEnabled = false } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const duplicate = db.prepare('SELECT id FROM sessions WHERE name = ?').get(String(name).trim());
  if (duplicate) return res.status(409).json({ error: 'duplicate worksheet name' });
  let joinCode = makeJoinCode();
  while (getSessionByCode(joinCode)) joinCode = makeJoinCode();
  const result = db.prepare('INSERT INTO sessions (name, joinCode, randomNicknameEnabled) VALUES (?, ?, ?)').run(name, joinCode, randomNicknameEnabled ? 1 : 0);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(session);
});

sessionsRouter.patch('/:id', (req, res) => {
  const sessionId = Number(req.params.id);
  const rawName = String(req.body?.name ?? '').trim();
  if (!rawName) return res.status(400).json({ error: 'name is required' });

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const duplicate = db.prepare('SELECT id FROM sessions WHERE name = ? AND id != ?').get(rawName, sessionId);
  if (duplicate) return res.status(409).json({ error: 'duplicate worksheet name' });

  db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(rawName, sessionId);
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  res.json(updated);
});

sessionsRouter.post('/:id/copy', (req, res) => {
  const sessionId = Number(req.params.id);
  const source = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!source) return res.status(404).json({ error: 'session not found' });

  const rawName = String(req.body?.name ?? '').trim() || `${source.name} (복사본)`;
  const duplicate = db.prepare('SELECT id FROM sessions WHERE name = ?').get(rawName);
  if (duplicate) return res.status(409).json({ error: 'duplicate worksheet name' });

  let joinCode = makeJoinCode();
  while (getSessionByCode(joinCode)) joinCode = makeJoinCode();

  const tx = db.transaction(() => {
    const inserted = db
      .prepare('INSERT INTO sessions (name, joinCode, randomNicknameEnabled) VALUES (?, ?, ?)')
      .run(rawName, joinCode, source.randomNicknameEnabled ? 1 : 0);
    const copiedSessionId = Number(inserted.lastInsertRowid);
    const questions = db
      .prepare(
        `SELECT prompt, imagePath, optionsJson, correctOptionIndex, weight, timeLimitSeconds, orderInSession
         FROM questions
         WHERE sessionId = ?
         ORDER BY orderInSession`
      )
      .all(sessionId) as any[];

    const qInsert = db.prepare(
      `INSERT INTO questions
       (sessionId, prompt, imagePath, optionsJson, correctOptionIndex, weight, timeLimitSeconds, orderInSession)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const q of questions) {
      qInsert.run(
        copiedSessionId,
        q.prompt,
        q.imagePath ?? null,
        q.optionsJson,
        q.correctOptionIndex,
        q.weight,
        q.timeLimitSeconds,
        q.orderInSession
      );
    }
    return copiedSessionId;
  });

  const copiedSessionId = tx();
  const copied = db.prepare('SELECT * FROM sessions WHERE id = ?').get(copiedSessionId);
  res.status(201).json(copied);
});

sessionsRouter.post('/:id/students/reset', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM responses WHERE sessionId = ?').run(sessionId);
    db.prepare('DELETE FROM score_logs WHERE sessionId = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE sessionId = ?').run(sessionId);
    db.prepare(
      "UPDATE sessions SET status='waiting', startedAt=NULL, finishedAt=NULL, currentQuestionOrder=0, questionState='waiting', questionDeadlineAt=NULL WHERE id = ?"
    ).run(sessionId);
  });
  tx();
  emitAll(sessionId);
  res.json({ ok: true });
});

sessionsRouter.delete('/:id', (req, res) => {
  const sessionId = Number(req.params.id);
  const tx = db.transaction(() => {
    const questionIds = db.prepare('SELECT id FROM questions WHERE sessionId = ?').all(sessionId) as Array<{ id: number }>;
    for (const q of questionIds) {
      db.prepare('DELETE FROM responses WHERE questionId = ?').run(q.id);
      db.prepare('DELETE FROM score_logs WHERE sourceType = ? AND sourceId = ?').run('question', q.id);
    }
    db.prepare('DELETE FROM questions WHERE sessionId = ?').run(sessionId);
    db.prepare('DELETE FROM students WHERE sessionId = ?').run(sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  });
  tx();
  res.json({ ok: true });
});

sessionsRouter.get('/:id', (req, res) => {
  const sessionId = Number(req.params.id);
  const teacherState = getTeacherState(sessionId);
  if (!teacherState) return res.status(404).json({ error: 'session not found' });
  res.json(teacherState);
});

sessionsRouter.get('/:id/live', (req, res) => {
  const sessionId = Number(req.params.id);
  const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
  const state = getStudentLiveState(sessionId, studentId);
  if (!state) return res.status(404).json({ error: 'session not found' });
  res.json(state);
});

sessionsRouter.post('/:id/start', (req, res) => {
  const sessionId = Number(req.params.id);
  db.prepare("UPDATE sessions SET status='active', startedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), currentQuestionOrder=0, questionState='waiting', questionDeadlineAt=NULL WHERE id = ?").run(sessionId);
  emitAll(sessionId);
  res.json({ ok: true });
});

sessionsRouter.post('/:id/reveal-next', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session || session.status !== 'active') return res.status(400).json({ error: 'active session only' });

  const nextOrder = Number(session.currentQuestionOrder) + 1;
  const question = db.prepare('SELECT * FROM questions WHERE sessionId = ? AND orderInSession = ?').get(sessionId, nextOrder) as any;
  if (!question) return res.status(400).json({ error: 'no more questions' });

  const deadline = new Date(Date.now() + question.timeLimitSeconds * 1000).toISOString();
  db.prepare("UPDATE sessions SET currentQuestionOrder=?, questionState='revealed', questionDeadlineAt=? WHERE id=?").run(nextOrder, deadline, sessionId);

  emitAll(sessionId);
  res.json({ ok: true, currentQuestionOrder: nextOrder, deadline });
});

sessionsRouter.post('/:id/close-current', (req, res) => {
  const sessionId = Number(req.params.id);
  db.prepare("UPDATE sessions SET questionState='closed', questionDeadlineAt=NULL WHERE id=?").run(sessionId);
  emitAll(sessionId);
  res.json({ ok: true });
});

sessionsRouter.post('/:id/finish', (req, res) => {
  const sessionId = Number(req.params.id);
  db.prepare("UPDATE sessions SET status='finished', questionState='waiting', questionDeadlineAt=NULL, finishedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(sessionId);
  emitAll(sessionId);
  res.json({ ok: true });
});

sessionsRouter.post('/:id/students/join', (req, res) => {
  const sessionId = Number(req.params.id);
  const { name, identifier, existingStudentId } = req.body as { name?: string; identifier?: string; existingStudentId?: number };
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return res.status(404).json({ error: 'session not found' });

  if (existingStudentId) {
    const existing = db.prepare('SELECT * FROM students WHERE id = ? AND sessionId = ?').get(existingStudentId, sessionId);
    if (existing) {
      db.prepare('UPDATE students SET lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?').run(existingStudentId);
      emitTeacherUpdate(sessionId);
      return res.json(existing);
    }
  }

  if (!identifier) return res.status(400).json({ error: 'identifier is required' });
  let displayName = name?.trim() || `학생-${identifier}`;
  if (session.randomNicknameEnabled && !name?.trim()) {
    const idx = Math.floor(Math.random() * randomNames.length);
    displayName = `${randomNames[idx]}-${Math.floor(Math.random() * 90 + 10)}`;
  }

  const found = db.prepare('SELECT * FROM students WHERE sessionId = ? AND identifier = ?').get(sessionId, identifier) as any;
  if (found) {
    db.prepare('UPDATE students SET displayName = ?, lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?').run(displayName, found.id);
    emitTeacherUpdate(sessionId);
    return res.json({ ...found, displayName });
  }

  const r = db.prepare('INSERT INTO students (sessionId, name, displayName, identifier) VALUES (?, ?, ?, ?)').run(sessionId, name ?? identifier, displayName, identifier);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(r.lastInsertRowid);
  emitTeacherUpdate(sessionId);
  res.status(201).json(student);
});

sessionsRouter.get('/:id/leaderboard', (req, res) => {
  const sessionId = Number(req.params.id);
  const rows = db
    .prepare(
      `SELECT st.id, st.displayName, COALESCE(SUM(r.awardedScore), 0) AS totalScore
       FROM students st
       LEFT JOIN responses r ON r.studentId = st.id
       WHERE st.sessionId = ?
       GROUP BY st.id
       ORDER BY totalScore DESC, st.id ASC`
    )
    .all(sessionId);
  res.json(rows);
});

sessionsRouter.get('/:id/export', (req, res) => {
  const sessionId = Number(req.params.id);
  const rows = db
    .prepare(
      `SELECT st.displayName as studentName, q.orderInSession, q.prompt,
              r.selectedOptionIndex, r.isCorrect, r.awardedScore
       FROM students st
       CROSS JOIN questions q
       LEFT JOIN responses r ON st.id = r.studentId AND q.id = r.questionId
       WHERE st.sessionId = ? AND q.sessionId = ?
       ORDER BY st.id, q.orderInSession`
    )
    .all(sessionId, sessionId);

  const csv = stringify(rows, { header: true });
  const fileName = `session-${sessionId}-${Date.now()}.csv`;
  fs.writeFileSync(path.join(paths.exportDir, fileName), csv, 'utf8');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
  res.send(csv);
});
