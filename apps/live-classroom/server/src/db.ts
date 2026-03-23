import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = path.resolve(process.cwd(), 'server');
const dataDir = path.join(root, 'data');
const uploadDir = path.join(root, 'uploads');
const exportDir = path.join(root, 'exports');
for (const dir of [dataDir, uploadDir, exportDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  joinCode TEXT NOT NULL UNIQUE,
  randomNicknameEnabled INTEGER NOT NULL DEFAULT 0,
  activeQuestionId INTEGER,
  activePollId INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  name TEXT NOT NULL,
  displayName TEXT NOT NULL,
  identifier TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastSeenAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sessionId, identifier)
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  title TEXT,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'multiple_choice',
  imagePath TEXT,
  optionsJson TEXT NOT NULL,
  correctOptionIndex INTEGER NOT NULL,
  timeLimitSeconds INTEGER NOT NULL,
  baseScore INTEGER NOT NULL DEFAULT 100,
  speedBonusEnabled INTEGER NOT NULL DEFAULT 1,
  firstCorrectBonusEnabled INTEGER NOT NULL DEFAULT 1,
  firstBonus1 INTEGER NOT NULL DEFAULT 20,
  firstBonus2 INTEGER NOT NULL DEFAULT 10,
  firstBonus3 INTEGER NOT NULL DEFAULT 5,
  orderInSession INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  startedAt TEXT,
  endedAt TEXT,
  revealedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  questionId INTEGER NOT NULL,
  studentId INTEGER NOT NULL,
  selectedOptionIndex INTEGER NOT NULL,
  isCorrect INTEGER NOT NULL,
  responseTimeMs INTEGER NOT NULL,
  submittedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  awardedScore INTEGER NOT NULL DEFAULT 0,
  rankAmongCorrect INTEGER,
  UNIQUE(questionId, studentId)
);
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  title TEXT NOT NULL,
  optionsJson TEXT NOT NULL,
  isAnonymous INTEGER NOT NULL DEFAULT 1,
  isLiveResultVisible INTEGER NOT NULL DEFAULT 1,
  timeLimitSeconds INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  startedAt TEXT,
  endedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId INTEGER NOT NULL,
  pollId INTEGER NOT NULL,
  studentId INTEGER NOT NULL,
  selectedOptionIndex INTEGER NOT NULL,
  submittedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pollId, studentId)
);
CREATE TABLE IF NOT EXISTS score_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL,
  sessionId INTEGER NOT NULL,
  sourceType TEXT NOT NULL,
  sourceId INTEGER NOT NULL,
  baseScore INTEGER NOT NULL,
  speedBonus INTEGER NOT NULL,
  rankBonus INTEGER NOT NULL,
  totalAwarded INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(studentId, sourceType, sourceId)
);
`);

export const paths = { root, dataDir, uploadDir, exportDir, dbPath };
