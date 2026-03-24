import { db } from './db.js';
import { makeJoinCode } from './lib/sessionService.js';

let joinCode = makeJoinCode();
while (db.prepare('SELECT id FROM sessions WHERE joinCode = ?').get(joinCode)) {
  joinCode = makeJoinCode();
}

const s = db.prepare("INSERT INTO sessions (name, joinCode, status, randomNicknameEnabled) VALUES (?, ?, 'waiting', 1)").run('데모 문제집', joinCode);
const sessionId = Number(s.lastInsertRowid);

for (const [i, prompt, options, correct] of [
  [1, '2 + 3 = ?', ['4', '5', '6'], 1],
  [2, '삼각형의 내각의 합은?', ['90', '180', '360'], 1],
  [3, 'x + 5 = 9 일 때 x는?', ['2', '3', '4'], 2]
] as const) {
  db.prepare(
    'INSERT INTO questions (sessionId, prompt, optionsJson, correctOptionIndex, weight, orderInSession) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sessionId, prompt, JSON.stringify(options), correct, 100, i);
}

console.log(`Seed created. sessionId=${sessionId}, joinCode=${joinCode}`);
