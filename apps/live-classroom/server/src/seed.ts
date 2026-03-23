import { db } from './db.js';
import { makeJoinCode } from './lib/sessionService.js';

const name = '데모 수업 세션';
let joinCode = makeJoinCode();
while (db.prepare('SELECT id FROM sessions WHERE joinCode = ?').get(joinCode)) {
  joinCode = makeJoinCode();
}

const s = db.prepare('INSERT INTO sessions (name, joinCode, randomNicknameEnabled) VALUES (?, ?, 1)').run(name, joinCode);
const sessionId = Number(s.lastInsertRowid);

db.prepare('INSERT INTO students (sessionId, name, displayName, identifier) VALUES (?, ?, ?, ?)').run(
  sessionId,
  '홍길동',
  '홍길동',
  '1'
);

db.prepare(
  `INSERT INTO questions (sessionId, title, body, optionsJson, correctOptionIndex, timeLimitSeconds, orderInSession)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
).run(sessionId, '데모 문제', '2+2는?', JSON.stringify(['3', '4', '5']), 1, 20, 1);

console.log(`Seed created. sessionId=${sessionId}, joinCode=${joinCode}`);
