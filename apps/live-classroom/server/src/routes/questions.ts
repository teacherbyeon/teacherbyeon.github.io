import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { db, paths } from '../db.js';
import { emitAll } from '../sockets/socket.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, paths.uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname) || '.jpg'}`)
});

const upload = multer({ storage });
export const questionsRouter = Router();

function savePastedDataUrl(dataUrl?: string): string | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const matched = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matched) return null;
  const mime = matched[1];
  const payload = matched[2];
  const ext = mime.includes('png') ? '.png' : mime.includes('jpeg') || mime.includes('jpg') ? '.jpg' : '.img';
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const filePath = path.join(paths.uploadDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(payload, 'base64'));
  return `/uploads/${fileName}`;
}

questionsRouter.post('/', upload.single('image'), (req, res) => {
  const { sessionId, prompt, options, correctOptionIndex, weight = 100, timeLimitSeconds = 20, pastedImageDataUrl } = req.body;
  const parsedOptions = Array.isArray(options) ? options : JSON.parse(options ?? '[]');
  if (!sessionId || !prompt || parsedOptions.length < 2 || parsedOptions.length > 5) return res.status(400).json({ error: 'invalid question payload' });

  const order =
    (db.prepare('SELECT COALESCE(MAX(orderInSession),0) as maxOrder FROM questions WHERE sessionId = ?').get(Number(sessionId)) as any).maxOrder + 1;

  const result = db
    .prepare(
      `INSERT INTO questions (sessionId, prompt, imagePath, optionsJson, correctOptionIndex, weight, timeLimitSeconds, orderInSession)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(sessionId),
      prompt,
      req.file ? `/uploads/${req.file.filename}` : savePastedDataUrl(pastedImageDataUrl),
      JSON.stringify(parsedOptions),
      Number(correctOptionIndex),
      Number(weight),
      Number(timeLimitSeconds),
      order
    );

  emitAll(Number(sessionId));
  res.status(201).json(db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid));
});

questionsRouter.put('/:id', upload.single('image'), (req, res) => {
  const id = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!q) return res.status(404).json({ error: 'question not found' });

  const prompt = req.body.prompt ?? q.prompt;
  const weight = Number(req.body.weight ?? q.weight);
  const timeLimitSeconds = Number(req.body.timeLimitSeconds ?? q.timeLimitSeconds);
  const correctOptionIndex = Number(req.body.correctOptionIndex ?? q.correctOptionIndex);
  const options = req.body.options ? (Array.isArray(req.body.options) ? req.body.options : JSON.parse(req.body.options)) : JSON.parse(q.optionsJson);

  const pastedPath = savePastedDataUrl(req.body.pastedImageDataUrl);
  db.prepare(
    `UPDATE questions SET prompt=?, imagePath=?, optionsJson=?, correctOptionIndex=?, weight=?, timeLimitSeconds=? WHERE id=?`
  ).run(prompt, req.file ? `/uploads/${req.file.filename}` : pastedPath ?? q.imagePath, JSON.stringify(options), correctOptionIndex, weight, timeLimitSeconds, id);

  emitAll(q.sessionId);
  res.json({ ok: true });
});

questionsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!q) return res.status(404).json({ error: 'question not found' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM responses WHERE questionId=?').run(id);
    db.prepare('DELETE FROM score_logs WHERE sourceType = ? AND sourceId = ?').run('question', id);
    db.prepare('DELETE FROM questions WHERE id=?').run(id);
  });
  tx();
  emitAll(q.sessionId);
  res.json({ ok: true });
});

questionsRouter.post('/reorder', (req, res) => {
  const { sessionId, questionIds } = req.body as { sessionId: number; questionIds: number[] };
  if (!sessionId || !Array.isArray(questionIds)) return res.status(400).json({ error: 'invalid payload' });
  const tx = db.transaction(() => {
    questionIds.forEach((id, idx) => db.prepare('UPDATE questions SET orderInSession = ? WHERE id = ? AND sessionId = ?').run(idx + 1, id, sessionId));
  });
  tx();
  emitAll(sessionId);
  res.json({ ok: true });
});

questionsRouter.post('/respond', (req, res) => {
  const { sessionId, studentId, selectedOptionIndex } = req.body as { sessionId: number; studentId: number; selectedOptionIndex: number };
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session || session.status !== 'active' || session.questionState !== 'revealed') return res.status(400).json({ error: 'no active revealed question' });

  const q = db.prepare('SELECT * FROM questions WHERE sessionId = ? AND orderInSession = ?').get(sessionId, session.currentQuestionOrder) as any;
  if (!q) return res.status(404).json({ error: 'question not found' });

  const deadline = session.questionDeadlineAt ? new Date(session.questionDeadlineAt).getTime() : 0;
  if (deadline && Date.now() > deadline) return res.status(400).json({ error: 'time over' });

  const exists = db.prepare('SELECT id FROM responses WHERE questionId = ? AND studentId = ?').get(q.id, studentId);
  if (exists) return res.status(409).json({ error: 'already submitted' });

  const isCorrect = Number(selectedOptionIndex) === q.correctOptionIndex ? 1 : 0;
  const awardedScore = isCorrect ? q.weight : 0;

  db.prepare('INSERT INTO responses (sessionId, questionId, studentId, selectedOptionIndex, isCorrect, awardedScore) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sessionId, q.id, studentId, selectedOptionIndex, isCorrect, awardedScore);
  db.prepare(
    `INSERT INTO score_logs (studentId, sessionId, sourceType, sourceId, baseScore, speedBonus, rankBonus, totalAwarded)
     VALUES (?, ?, 'question', ?, ?, 0, 0, ?)
     ON CONFLICT(studentId, sourceType, sourceId)
     DO UPDATE SET baseScore=excluded.baseScore, totalAwarded=excluded.totalAwarded`
  ).run(studentId, sessionId, q.id, awardedScore, awardedScore);

  emitAll(sessionId);
  res.json({ ok: true, awardedScore });
});
