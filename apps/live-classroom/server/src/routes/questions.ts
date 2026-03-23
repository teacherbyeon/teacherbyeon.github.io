import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, paths } from '../db.js';
import { calculateScore } from '../lib/scoring.js';
import { emitQuestionStats, emitSessionUpdate } from '../sockets/socket.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, paths.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  }
});

const upload = multer({ storage });
export const questionsRouter = Router();

questionsRouter.post('/', upload.single('image'), (req, res) => {
  const {
    sessionId,
    title,
    body,
    options,
    correctOptionIndex,
    timeLimitSeconds,
    baseScore = 100,
    speedBonusEnabled = true,
    firstCorrectBonusEnabled = true,
    firstBonus1 = 20,
    firstBonus2 = 10,
    firstBonus3 = 5
  } = req.body;

  const parsedOptions = Array.isArray(options) ? options : JSON.parse(options ?? '[]');
  if (!sessionId || parsedOptions.length < 2 || parsedOptions.length > 5) {
    return res.status(400).json({ error: 'invalid question payload' });
  }

  const order =
    (db
      .prepare('SELECT COALESCE(MAX(orderInSession),0) as maxOrder FROM questions WHERE sessionId = ?')
      .get(Number(sessionId)) as any).maxOrder + 1;

  const result = db
    .prepare(
      `INSERT INTO questions (
        sessionId, title, body, imagePath, optionsJson, correctOptionIndex, timeLimitSeconds,
        baseScore, speedBonusEnabled, firstCorrectBonusEnabled, firstBonus1, firstBonus2, firstBonus3, orderInSession
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(sessionId),
      title ?? null,
      body ?? null,
      req.file ? `/uploads/${req.file.filename}` : null,
      JSON.stringify(parsedOptions),
      Number(correctOptionIndex),
      Number(timeLimitSeconds),
      Number(baseScore),
      speedBonusEnabled === 'false' ? 0 : Number(speedBonusEnabled ? 1 : 0),
      firstCorrectBonusEnabled === 'false' ? 0 : Number(firstCorrectBonusEnabled ? 1 : 0),
      Number(firstBonus1),
      Number(firstBonus2),
      Number(firstBonus3),
      order
    );

  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid);
  emitSessionUpdate(Number(sessionId));
  res.status(201).json(question);
});

questionsRouter.post('/:id/start', (req, res) => {
  const id = Number(req.params.id);
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!question) return res.status(404).json({ error: 'question not found' });
  if (question.status !== 'idle') return res.status(400).json({ error: 'question must be idle' });

  db.prepare(`UPDATE questions SET status = 'active', startedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  db.prepare('UPDATE sessions SET activeQuestionId = ?, activePollId = NULL WHERE id = ?').run(id, question.sessionId);
  emitSessionUpdate(question.sessionId);
  res.json({ ok: true });
});

questionsRouter.post('/:id/end', (req, res) => {
  const id = Number(req.params.id);
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!question) return res.status(404).json({ error: 'question not found' });
  db.prepare(`UPDATE questions SET status = 'ended', endedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  db.prepare('UPDATE sessions SET activeQuestionId = NULL WHERE id = ?').run(question.sessionId);
  emitSessionUpdate(question.sessionId);
  res.json({ ok: true });
});

questionsRouter.post('/:id/reveal', (req, res) => {
  const id = Number(req.params.id);
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!question) return res.status(404).json({ error: 'question not found' });
  if (!['ended', 'active'].includes(question.status)) {
    return res.status(400).json({ error: 'question must be ended or active before reveal' });
  }

  db.prepare(`UPDATE questions SET status = 'revealed', revealedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  emitSessionUpdate(question.sessionId);
  res.json({ ok: true });
});

questionsRouter.post('/:id/respond', (req, res) => {
  const id = Number(req.params.id);
  const { studentId, selectedOptionIndex } = req.body as { studentId: number; selectedOptionIndex: number };
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!question) return res.status(404).json({ error: 'question not found' });
  if (question.status !== 'active') return res.status(400).json({ error: 'question is not active' });

  const student = db
    .prepare('SELECT * FROM students WHERE id = ? AND sessionId = ?')
    .get(studentId, question.sessionId);
  if (!student) return res.status(400).json({ error: 'student does not belong to session' });

  const already = db.prepare('SELECT id FROM responses WHERE questionId = ? AND studentId = ?').get(id, studentId);
  if (already) return res.status(409).json({ error: 'already submitted' });

  const now = Date.now();
  const startedAt = new Date(question.startedAt).getTime();
  const elapsed = now - startedAt;
  if (elapsed > question.timeLimitSeconds * 1000) {
    return res.status(400).json({ error: 'time over' });
  }

  const isCorrect = Number(selectedOptionIndex) === question.correctOptionIndex ? 1 : 0;

  let rankAmongCorrect: number | null = null;
  if (isCorrect) {
    const countCorrect = db
      .prepare('SELECT COUNT(*) as c FROM responses WHERE questionId = ? AND isCorrect = 1')
      .get(id) as any;
    rankAmongCorrect = Number(countCorrect.c) + 1;
  }

  const score = calculateScore({
    baseScore: question.baseScore,
    isCorrect: Boolean(isCorrect),
    responseTimeMs: elapsed,
    timeLimitSeconds: question.timeLimitSeconds,
    speedBonusEnabled: Boolean(question.speedBonusEnabled),
    firstCorrectBonusEnabled: Boolean(question.firstCorrectBonusEnabled),
    rankAmongCorrect,
    firstBonuses: [question.firstBonus1, question.firstBonus2, question.firstBonus3]
  });

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO responses (sessionId, questionId, studentId, selectedOptionIndex, isCorrect, responseTimeMs, awardedScore, rankAmongCorrect)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(question.sessionId, id, studentId, selectedOptionIndex, isCorrect, elapsed, score.total, rankAmongCorrect);

    db.prepare(
      `INSERT OR REPLACE INTO score_logs (studentId, sessionId, sourceType, sourceId, baseScore, speedBonus, rankBonus, totalAwarded)
       VALUES (?, ?, 'question', ?, ?, ?, ?, ?)`
    ).run(studentId, question.sessionId, id, score.baseScore, score.speedBonus, score.rankBonus, score.total);
  });

  tx();

  emitQuestionStats(question.sessionId, id);
  emitSessionUpdate(question.sessionId);
  res.status(201).json({ ok: true, score: score.total });
});

questionsRouter.get('/:id/submission/:studentId', (req, res) => {
  const questionId = Number(req.params.id);
  const studentId = Number(req.params.studentId);
  const row = db
    .prepare(
      `SELECT id, selectedOptionIndex, awardedScore, submittedAt
       FROM responses
       WHERE questionId = ? AND studentId = ?`
    )
    .get(questionId, studentId) as
    | { id: number; selectedOptionIndex: number; awardedScore: number; submittedAt: string }
    | undefined;

  if (!row) {
    return res.json({ submitted: false });
  }

  return res.json({
    submitted: true,
    selectedOptionIndex: row.selectedOptionIndex,
    awardedScore: row.awardedScore,
    submittedAt: row.submittedAt
  });
});
