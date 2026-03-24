import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, paths } from '../db.js';
import { emitSessionUpdate } from '../sockets/socket.js';

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
  const { sessionId, prompt, options, correctOptionIndex, weight = 100 } = req.body;
  const parsedOptions = Array.isArray(options) ? options : JSON.parse(options ?? '[]');
  if (!sessionId || !prompt || parsedOptions.length < 2 || parsedOptions.length > 5) {
    return res.status(400).json({ error: 'invalid question payload' });
  }

  const order =
    (db
      .prepare('SELECT COALESCE(MAX(orderInSession),0) as maxOrder FROM questions WHERE sessionId = ?')
      .get(Number(sessionId)) as any).maxOrder + 1;

  const result = db
    .prepare(
      `INSERT INTO questions (sessionId, prompt, imagePath, optionsJson, correctOptionIndex, weight, orderInSession)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(sessionId),
      prompt,
      req.file ? `/uploads/${req.file.filename}` : null,
      JSON.stringify(parsedOptions),
      Number(correctOptionIndex),
      Number(weight),
      order
    );

  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid);
  emitSessionUpdate(Number(sessionId));
  res.status(201).json(question);
});

questionsRouter.put('/:id', upload.single('image'), (req, res) => {
  const id = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!q) return res.status(404).json({ error: 'question not found' });

  const prompt = req.body.prompt ?? q.prompt;
  const weight = Number(req.body.weight ?? q.weight);
  const correctOptionIndex = Number(req.body.correctOptionIndex ?? q.correctOptionIndex);
  const options = req.body.options ? (Array.isArray(req.body.options) ? req.body.options : JSON.parse(req.body.options)) : JSON.parse(q.optionsJson);

  db.prepare(
    `UPDATE questions SET prompt = ?, imagePath = ?, optionsJson = ?, correctOptionIndex = ?, weight = ? WHERE id = ?`
  ).run(prompt, req.file ? `/uploads/${req.file.filename}` : q.imagePath, JSON.stringify(options), correctOptionIndex, weight, id);

  emitSessionUpdate(q.sessionId);
  res.json({ ok: true });
});

questionsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!q) return res.status(404).json({ error: 'question not found' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM responses WHERE questionId = ?').run(id);
    db.prepare('DELETE FROM score_logs WHERE sourceType = ? AND sourceId = ?').run('question', id);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });
  tx();

  emitSessionUpdate(q.sessionId);
  res.json({ ok: true });
});

questionsRouter.post('/reorder', (req, res) => {
  const { sessionId, questionIds } = req.body as { sessionId: number; questionIds: number[] };
  if (!sessionId || !Array.isArray(questionIds)) return res.status(400).json({ error: 'invalid payload' });

  const tx = db.transaction(() => {
    questionIds.forEach((id, idx) => {
      db.prepare('UPDATE questions SET orderInSession = ? WHERE id = ? AND sessionId = ?').run(idx + 1, id, sessionId);
    });
  });
  tx();

  emitSessionUpdate(sessionId);
  res.json({ ok: true });
});

questionsRouter.post('/answer', (req, res) => {
  const { sessionId, questionId, studentId, selectedOptionIndex } = req.body as {
    sessionId: number;
    questionId: number;
    studentId: number;
    selectedOptionIndex: number;
  };

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (session.status !== 'active') return res.status(400).json({ error: 'session is not active' });

  const question = db.prepare('SELECT * FROM questions WHERE id = ? AND sessionId = ?').get(questionId, sessionId) as any;
  if (!question) return res.status(404).json({ error: 'question not found' });

  const submitted = db.prepare('SELECT id FROM submissions WHERE sessionId = ? AND studentId = ?').get(sessionId, studentId);
  if (submitted) return res.status(409).json({ error: 'already submitted whole set' });

  const isCorrect = Number(selectedOptionIndex) === question.correctOptionIndex ? 1 : 0;
  const awardedScore = isCorrect ? question.weight : 0;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO responses (sessionId, questionId, studentId, selectedOptionIndex, isCorrect, awardedScore, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(questionId, studentId)
       DO UPDATE SET selectedOptionIndex = excluded.selectedOptionIndex,
                     isCorrect = excluded.isCorrect,
                     awardedScore = excluded.awardedScore,
                     updatedAt = excluded.updatedAt`
    ).run(sessionId, questionId, studentId, selectedOptionIndex, isCorrect, awardedScore);

    db.prepare(
      `INSERT INTO score_logs (studentId, sessionId, sourceType, sourceId, baseScore, speedBonus, rankBonus, totalAwarded)
       VALUES (?, ?, 'question', ?, ?, 0, 0, ?)
       ON CONFLICT(studentId, sourceType, sourceId)
       DO UPDATE SET baseScore = excluded.baseScore, totalAwarded = excluded.totalAwarded`
    ).run(studentId, sessionId, questionId, awardedScore, awardedScore);
  });
  tx();

  emitSessionUpdate(sessionId);
  res.json({ ok: true, awardedScore });
});
