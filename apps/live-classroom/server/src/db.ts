import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = path.resolve(process.cwd(), 'server');
const dataDir = path.join(root, 'data');
const uploadDir = path.join(root, 'uploads');
const exportDir = path.join(root, 'exports');
for (const dir of [dataDir, uploadDir, exportDir]) fs.mkdirSync(dir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  joinCode TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting',
  randomNicknameEnabled INTEGER NOT NULL DEFAULT 0,
  startedAt TEXT,
  finishedAt TEXT,
  currentQuestionOrder INTEGER NOT NULL DEFAULT 0,
  questionState TEXT NOT NULL DEFAULT 'waiting',
  questionDeadlineAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  name TEXT NOT NULL,
  displayName TEXT NOT NULL,
  identifier TEXT NOT NULL,
  rejoinToken TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastSeenAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sessionId, identifier)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  imagePath TEXT,
  optionsJson TEXT NOT NULL,
  correctOptionIndex INTEGER NOT NULL,
  weight INTEGER NOT NULL DEFAULT 100,
  timeLimitSeconds INTEGER NOT NULL DEFAULT 20,
  orderInSession INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  questionId INTEGER NOT NULL,
  studentId INTEGER NOT NULL,
  selectedOptionIndex INTEGER NOT NULL,
  isCorrect INTEGER NOT NULL,
  awardedScore INTEGER NOT NULL,
  submittedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(questionId, studentId)
);

CREATE TABLE IF NOT EXISTS score_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL,
  sessionId INTEGER NOT NULL,
  sourceType TEXT NOT NULL,
  sourceId INTEGER NOT NULL,
  baseScore INTEGER NOT NULL,
  speedBonus INTEGER NOT NULL DEFAULT 0,
  rankBonus INTEGER NOT NULL DEFAULT 0,
  totalAwarded INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(studentId, sourceType, sourceId)
);
`);

const studentColumns = db.prepare('PRAGMA table_info(students)').all() as Array<{ name: string }>;
if (!studentColumns.some((c) => c.name === 'rejoinToken')) {
  db.exec('ALTER TABLE students ADD COLUMN rejoinToken TEXT');
}

export const paths = { root, dataDir, uploadDir, exportDir, dbPath };
