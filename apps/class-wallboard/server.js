const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 15 * 1024 * 1024 });

const dataDir = path.join(__dirname, 'data');
const metaFile = path.join(dataDir, 'meta.json');
const legacyStoreFile = path.join(dataDir, 'wallboard-store.json');
const classesDir = path.join(dataDir, 'classes');
const uploadsDir = path.join(dataDir, 'uploads');
const uploadTmpDir = path.join(dataDir, 'tmp');
const maxUploadBytes = 10 * 1024 * 1024;
const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

function stripWrappingQuotes(value = '') {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(envPath = path.join(__dirname, '.env')) {
  try {
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      const value = stripWrappingQuotes(trimmed.slice(eqIndex + 1).trim());
      process.env[key] = value;
    }
  } catch (err) {
    console.error(`[class-wallboard] Failed to load .env: ${err?.message || String(err)}`);
  }
}

loadEnvFile();
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const classesById = new Map();
const classIdByName = new Map();
const teacherSessions = new Map();
const participantSockets = new Map(); // participantId -> Set<socketId>
const defaultTeacherPin = '123456';
const sessionTtlMs = 1000 * 60 * 60 * 8;

const meta = {
  globalTeacherPin: defaultTeacherPin,
  activeClassId: '',
  classes: [], // [{ classId, className }]
};

function makeId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}
function makeSecret() {
  return crypto.randomBytes(18).toString('hex');
}
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function safeName(v = '') {
  return String(v).replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
}
function safeExt(v = '') {
  return String(v).toLowerCase().replace(/[^a-z0-9.]/g, '');
}
function mimeByExt(ext = '') {
  const e = ext.toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.pdf') return 'application/pdf';
  return '';
}
function extByMime(mime = '') {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}
function ensureAllowedFile(file = {}) {
  const ext = safeExt(path.extname(file.originalname || ''));
  const byExt = mimeByExt(ext);
  if (!allowedMimes.has(file.mimetype) || !byExt || byExt !== file.mimetype) {
    const err = new Error('허용되지 않는 파일 형식입니다. PNG/JPG/WEBP/PDF만 업로드할 수 있습니다.');
    err.status = 400;
    throw err;
  }
}
function removeFileSafe(filePath = '') {
  if (!filePath) return;
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

function classFilePath(classId) {
  return path.join(classesDir, `${classId}.json`);
}
function classUploadDir(classId) {
  return path.join(uploadsDir, classId);
}
function relativeFromRoot(absPath = '') {
  return path.relative(__dirname, absPath).replace(/\\/g, '/');
}
function absoluteFromRoot(relPath = '') {
  return path.join(__dirname, relPath);
}
function makeUploadFilename(prefix, mime) {
  return `${safeName(prefix)}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${extByMime(mime) || ''}`;
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDir(uploadTmpDir);
      cb(null, uploadTmpDir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${safeExt(path.extname(file.originalname || '')) || '.bin'}`);
    },
  }),
  limits: { fileSize: maxUploadBytes, files: 1 },
});

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, sess] of teacherSessions.entries()) {
    if (!sess?.expiresAt || now > sess.expiresAt) teacherSessions.delete(token);
  }
}
function createTeacherSession() {
  cleanupExpiredSessions();
  const token = `t-${crypto.randomBytes(24).toString('hex')}`;
  teacherSessions.set(token, { createdAt: Date.now(), expiresAt: Date.now() + sessionTtlMs });
  return token;
}
function authorizeTeacher(token) {
  cleanupExpiredSessions();
  if (!token) return false;
  const s = teacherSessions.get(token);
  if (!s) return false;
  if (Date.now() > s.expiresAt) {
    teacherSessions.delete(token);
    return false;
  }
  s.expiresAt = Date.now() + sessionTtlMs;
  return true;
}

function readPayloadFile(relPath) {
  if (!relPath) return '';
  try {
    const abs = path.join(__dirname, relPath);
    if (!fs.existsSync(abs)) return '';
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}
function readDataUrlFromFile(relPath, mimeType = 'application/octet-stream') {
  if (!relPath) return '';
  try {
    const abs = absoluteFromRoot(relPath);
    if (!fs.existsSync(abs)) return '';
    const b = fs.readFileSync(abs);
    return `data:${mimeType};base64,${b.toString('base64')}`;
  } catch {
    return '';
  }
}

function writePayloadFile(classId, boardId, slotId, field, content) {
  if (!content) return '';
  const dir = classUploadDir(classId);
  ensureDir(dir);
  const filename = `${safeName(boardId)}-${safeName(slotId)}-${field}.txt`;
  const absPath = path.join(dir, filename);
  fs.writeFileSync(absPath, content, 'utf8');
  return path.join('data', 'uploads', classId, filename);
}

function createClassState({ classId, className, classCode }) {
  return {
    classId,
    className,
    classCode,
    boards: [],
    activeBoardId: null,
    selectedSubmissionId: null,
    participants: [],
  };
}

function atomicWriteJson(filePath, payload) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function activeBoard(state) {
  return state?.boards?.find((b) => b.id === state.activeBoardId);
}

function createSlotFromParticipant(participant) {
  return {
    id: makeId('slot'),
    participantId: participant.participantId,
    classroom: participant.classroom || '',
    studentNo: participant.studentNo || '',
    realName: participant.realName || '',
    nickname: participant.nickname || '익명',
    questionNo: '',
    fileName: '',
    mimeType: '',
    dataPath: '',
    thumbPath: '',
    submittedAt: '',
    aiFeedbackForStudent: '',
    aiTeacherSummary: '',
    aiCandidateTag: 'none',
    aiConfidence: 'low',
    aiReasons: [],
    aiAnalyzedAt: '',
    aiStatus: 'idle',
    aiErrorMessage: '',
  };
}

async function analyzeWithAi({ board, slot }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('AI 기능을 사용하려면 OPENAI_API_KEY 설정이 필요합니다.');

  const systemPrompt = [
    '너는 학생 손풀이를 돕는 수학 수업 보조자다.',
    '정답을 단정하지 말고 교육적으로 짧게 코멘트하라.',
    '문제 정보가 없으면 풀이 구조/표현/점검 포인트 위주로만 평가하라.',
    '반드시 JSON으로만 답하라.',
    '응답 형식은 정확히 다음 JSON 스키마를 따르라: {"student_feedback":"...","teacher_summary":"...","candidate_tag":"learn_from_mistake|excellent_solution|none","confidence":"low|medium|high","reasons":["...","..."]}',
  ].join(' ');

  const content = [
    { type: 'input_text', text: `board_title: ${board.title || ''}` },
    { type: 'input_text', text: `prompt_title: ${board.promptTitle || ''}` },
    { type: 'input_text', text: `problem_text: ${board.problemText || '(없음)'}` },
    { type: 'input_text', text: `student_nickname: ${slot.nickname || ''}` },
    { type: 'input_text', text: `student_file_name: ${slot.fileName || ''}` },
    { type: 'input_text', text: `student_mime_type: ${slot.mimeType || ''}` },
  ];

  const problemDataUrl = readDataUrlFromFile(board.problemPath, board.problemMimeType || 'application/octet-stream');
  const slotDataUrl = readDataUrlFromFile(slot.dataPath, slot.mimeType || 'application/octet-stream');

  if ((board.problemMimeType || '').startsWith('image/') && problemDataUrl) {
    content.push({ type: 'input_text', text: '문제 이미지가 함께 제공됩니다.' });
    content.push({ type: 'input_image', image_url: problemDataUrl });
  } else if ((board.problemMimeType || '').includes('pdf')) {
    content.push({ type: 'input_text', text: '문제 파일은 PDF입니다. 이미지 기반 해석에 한계가 있을 수 있습니다.' });
  }
  if ((slot.mimeType || '').startsWith('image/') && slotDataUrl) {
    content.push({ type: 'input_image', image_url: slotDataUrl });
  } else if ((slot.mimeType || '').includes('pdf')) {
    content.push({ type: 'input_text', text: '학생 제출 파일은 PDF입니다. 이미지 기반 분석 정확도가 낮을 수 있습니다.' });
  }

  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: openAiModel,
      text: { format: { type: 'json_object' } },
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        { role: 'user', content },
      ],
    }),
  });
  const raw = await resp.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (err) {
    throw new Error(`OpenAI 응답 JSON 파싱 실패 (HTTP ${resp.status}): ${err?.message || String(err)}`);
  }
  if (!resp.ok) {
    const apiMessage = data?.error?.message || data?.message || raw || 'unknown error';
    throw new Error(`AI HTTP ${resp.status}: ${apiMessage}`);
  }

  let text = (data?.output_text || '').trim();
  if (!text && Array.isArray(data?.output)) {
    const chunks = [];
    for (const item of data.output) {
      const contents = Array.isArray(item?.content) ? item.content : [];
      for (const c of contents) {
        if (typeof c?.text === 'string' && c.text.trim()) chunks.push(c.text.trim());
      }
    }
    text = chunks.join('\n').trim();
  }
  if (!text) throw new Error('OpenAI 응답에서 분석 텍스트를 찾지 못했습니다.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`OpenAI JSON 파싱 실패: ${err?.message || String(err)}`);
  }
  return {
    student_feedback: parsed.student_feedback || '',
    teacher_summary: parsed.teacher_summary || '',
    candidate_tag: ['learn_from_mistake', 'excellent_solution', 'none'].includes(parsed.candidate_tag) ? parsed.candidate_tag : 'none',
    confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
  };
}

async function analyzeSingleSlot({ state, board, slot }) {
  try {
    slot.aiStatus = 'running';
    slot.aiErrorMessage = '';
    const result = await analyzeWithAi({ board, slot });
    slot.aiFeedbackForStudent = result.student_feedback;
    slot.aiTeacherSummary = result.teacher_summary;
    slot.aiCandidateTag = result.candidate_tag;
    slot.aiConfidence = result.confidence;
    slot.aiReasons = result.reasons;
    slot.aiAnalyzedAt = new Date().toISOString();
    slot.aiStatus = 'done';
    return { ok: true };
  } catch (err) {
    slot.aiStatus = 'error';
    slot.aiErrorMessage = err.message;
    return { ok: false, message: err.message };
  } finally {
    saveClassState(state.classId);
    emitAllState(state.classId);
  }
}

function ensureParticipant(state, profile = {}, requestedId = '') {
  if (!state) return null;
  let participant = null;
  if (requestedId) participant = state.participants.find((p) => p.participantId === requestedId) || null;
  if (!participant) {
    participant = {
      participantId: requestedId || makeId('p'),
      participantSecret: makeSecret(),
      classroom: profile.classroom || '',
      studentNo: profile.studentNo || '',
      realName: profile.realName || '',
      nickname: profile.nickname || '익명',
    };
    state.participants.push(participant);
  } else {
    participant.classroom = profile.classroom ?? participant.classroom;
    participant.studentNo = profile.studentNo ?? participant.studentNo;
    participant.realName = profile.realName ?? participant.realName;
    participant.nickname = profile.nickname || participant.nickname || '익명';
  }
  return participant;
}

function ensureSlot(board, participant) {
  if (!board || !participant) return null;
  let slot = board.slots.find((s) => s.participantId === participant.participantId);
  if (!slot) {
    slot = createSlotFromParticipant(participant);
    board.slots.push(slot);
  }
  slot.classroom = participant.classroom || '';
  slot.studentNo = participant.studentNo || '';
  slot.realName = participant.realName || '';
  slot.nickname = participant.nickname || '익명';
  return slot;
}

function migrateClassState(raw) {
  const participants = (raw.participants || []).map((p) => ({
    ...p,
    participantId: p.participantId || makeId('p'),
    participantSecret: p.participantSecret || makeSecret(),
    nickname: p.nickname || '익명',
  }));
  const keyToId = new Map();
  participants.forEach((p) => { if (p.participantKey) keyToId.set(p.participantKey, p.participantId); });

  const boards = (raw.boards || []).map((b) => ({
    ...b,
    slots: (b.slots || []).map((s) => {
      const participantId = s.participantId || keyToId.get(s.participantKey) || makeId('p');
      return {
        ...s,
        participantId,
        participantKey: undefined,
        nickname: s.nickname || participants.find((p) => p.participantId === participantId)?.nickname || '익명',
        dataPath: s.dataPath || '',
        thumbPath: s.thumbPath || '',
      };
    }),
  }));

  return {
    classId: raw.classId || makeId('c'),
    className: raw.className,
    classCode: raw.classCode,
    boards,
    activeBoardId: raw.activeBoardId || boards[0]?.id || null,
    selectedSubmissionId: raw.selectedSubmissionId || null,
    participants,
  };
}

function thumbUrl(state, board, slot) {
  if (!state?.className || !state?.classCode || !board?.id || !slot?.id || !slot?.thumbPath) return '';
  return `/api/classes/${encodeURIComponent(state.className)}/assets/thumb/${encodeURIComponent(board.id)}/${encodeURIComponent(slot.id)}?code=${encodeURIComponent(state.classCode)}`;
}

function problemUrl(state, board) {
  if (!state?.className || !state?.classCode || !board?.id || !board?.problemPath) return '';
  return `/api/classes/${encodeURIComponent(state.className)}/assets/problem/${encodeURIComponent(board.id)}/_?code=${encodeURIComponent(state.classCode)}`;
}

function sanitizeStateForStudent(state) {
  return {
    classId: state.classId,
    className: state.className,
    boards: (state.boards || []).map((b) => ({
      id: b.id,
      title: b.title,
      promptTitle: b.promptTitle || '',
      problemText: b.problemText || '',
      problemFileName: b.problemFileName || '',
      problemMimeType: b.problemMimeType || '',
      problemUrl: problemUrl(state, b),
      aiAnalysisEnabled: Boolean(b.aiAnalysisEnabled),
      slots: (b.slots || []).map((s) => ({
        id: s.id,
        participantId: s.participantId,
        nickname: s.nickname || '익명',
        thumbUrl: thumbUrl(state, b, s),
        hasSubmission: Boolean(s.thumbPath),
        aiFeedbackForStudent: s.aiFeedbackForStudent || '',
        aiStatus: s.aiStatus || 'idle',
      })),
    })),
    activeBoardId: state.activeBoardId,
    selectedSubmissionId: state.selectedSubmissionId,
    classCode: state.classCode,
    participantCount: (state.participants || []).length,
  };
}

function sanitizeStateForTeacher(state) {
  return {
    classId: state.classId,
    className: state.className,
    classCode: state.classCode,
    activeBoardId: state.activeBoardId,
    selectedSubmissionId: state.selectedSubmissionId,
    participants: (state.participants || []).map((p) => ({
      participantId: p.participantId,
      classroom: p.classroom || '',
      studentNo: p.studentNo || '',
      realName: p.realName || '',
      nickname: p.nickname || '익명',
    })),
    boards: (state.boards || []).map((b) => ({
      id: b.id,
      title: b.title,
      createdAt: b.createdAt,
      promptTitle: b.promptTitle || '',
      problemText: b.problemText || '',
      problemFileName: b.problemFileName || '',
      problemMimeType: b.problemMimeType || '',
      problemUrl: problemUrl(state, b),
      aiAnalysisEnabled: Boolean(b.aiAnalysisEnabled),
      aiTopLearnCandidateIds: b.aiTopLearnCandidateIds || [],
      aiTopExcellentCandidateIds: b.aiTopExcellentCandidateIds || [],
      aiLastBatchAnalyzedAt: b.aiLastBatchAnalyzedAt || '',
      slots: (b.slots || []).map((s) => ({
        id: s.id,
        participantId: s.participantId,
        classroom: s.classroom || '',
        studentNo: s.studentNo || '',
        realName: s.realName || '',
        nickname: s.nickname || '익명',
        questionNo: s.questionNo || '',
        fileName: s.fileName || '',
        mimeType: s.mimeType || '',
        thumbUrl: thumbUrl(state, b, s),
        submittedAt: s.submittedAt || '',
        hasDetail: Boolean(s.dataPath),
        aiFeedbackForStudent: s.aiFeedbackForStudent || '',
        aiTeacherSummary: s.aiTeacherSummary || '',
        aiCandidateTag: s.aiCandidateTag || 'none',
        aiConfidence: s.aiConfidence || 'low',
        aiReasons: s.aiReasons || [],
        aiAnalyzedAt: s.aiAnalyzedAt || '',
        aiStatus: s.aiStatus || 'idle',
        aiErrorMessage: s.aiErrorMessage || '',
      })),
    })),
  };
}

function roomTeachers(classId) { return `class:${classId}:teachers`; }
function roomStudents(classId) { return `class:${classId}:students`; }

function getClassById(classId) { return classesById.get(classId); }
function getClassByName(className) {
  const classId = classIdByName.get(className);
  return classId ? classesById.get(classId) : undefined;
}

function saveMeta() {
  ensureDir(dataDir);
  atomicWriteJson(metaFile, meta);
}

function serializeClassForFile(state) {
  return state;
}

function saveClassState(classId) {
  const state = classesById.get(classId);
  if (!state) return;
  ensureDir(classesDir);
  atomicWriteJson(classFilePath(classId), serializeClassForFile(state));
}

function saveAll() {
  saveMeta();
  meta.classes.forEach((c) => saveClassState(c.classId));
}

function removeClassStorage(classId) {
  const cFile = classFilePath(classId);
  const uDir = classUploadDir(classId);
  if (fs.existsSync(cFile)) fs.unlinkSync(cFile);
  if (fs.existsSync(uDir)) fs.rmSync(uDir, { recursive: true, force: true });
}

function rebuildIndexes() {
  classIdByName.clear();
  meta.classes.forEach((c) => classIdByName.set(c.className, c.classId));
}

function loadFromNewStructure() {
  if (!fs.existsSync(metaFile)) return false;
  const loadedMeta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  meta.globalTeacherPin = loadedMeta.globalTeacherPin || defaultTeacherPin;
  meta.activeClassId = loadedMeta.activeClassId || '';
  meta.classes = Array.isArray(loadedMeta.classes) ? loadedMeta.classes : [];
  rebuildIndexes();

  meta.classes.forEach((c) => {
    const cFile = classFilePath(c.classId);
    if (!fs.existsSync(cFile)) return;
    const parsed = JSON.parse(fs.readFileSync(cFile, 'utf8'));
    const migrated = migrateClassState({ ...parsed, classId: c.classId, className: c.className });
    classesById.set(c.classId, migrated);
  });
  return true;
}

function migrateLegacyStoreIfExists() {
  if (!fs.existsSync(legacyStoreFile)) return;
  const parsed = JSON.parse(fs.readFileSync(legacyStoreFile, 'utf8'));
  meta.globalTeacherPin = parsed.globalTeacherPin || defaultTeacherPin;
  meta.activeClassId = '';
  meta.classes = [];
  classesById.clear();

  (parsed.classes || []).forEach((legacyClass) => {
    const classId = legacyClass.classId || makeId('c');
    const migrated = migrateClassState({ ...legacyClass, classId });
    classesById.set(classId, migrated);
    meta.classes.push({ classId, className: migrated.className });
  });
  rebuildIndexes();
  saveAll();
}

function loadStore() {
  ensureDir(dataDir);
  ensureDir(classesDir);
  ensureDir(uploadsDir);

  const loaded = loadFromNewStructure();
  if (!loaded) migrateLegacyStoreIfExists();
  if (!loaded && !fs.existsSync(legacyStoreFile)) saveMeta();
}

function classList() {
  return meta.classes
    .map((c) => {
      const state = getClassById(c.classId);
      return {
        classId: c.classId,
        className: c.className,
        classCode: state?.classCode || '',
        createdAt: c.createdAt || '',
        lastUsedAt: c.lastUsedAt || '',
        isActive: meta.activeClassId === c.classId,
        participantCount: (state?.participants || []).length,
        boardCount: (state?.boards || []).length,
      };
    })
    .sort((a, b) => String(b.lastUsedAt || b.createdAt || '').localeCompare(String(a.lastUsedAt || a.createdAt || '')));
}

function emitTeacherState(classId) {
  const state = getClassById(classId);
  if (!state) return;
  io.to(roomTeachers(classId)).emit('state:update', sanitizeStateForTeacher(state));
}
function emitStudentState(classId) {
  const state = getClassById(classId);
  if (!state) return;
  io.to(roomStudents(classId)).emit('state:update', sanitizeStateForStudent(state));
}
function emitAllState(classId) {
  emitTeacherState(classId);
  emitStudentState(classId);
}

function rejectTeacherAction(socket, cb) {
  cb?.({ ok: false, message: '교사 세션이 만료되었거나 유효하지 않습니다. 다시 로그인하세요.', code: 'TEACHER_AUTH_REQUIRED' });
  socket.emit('auth:required', { message: '교사 세션이 만료되었습니다. 다시 로그인해 주세요.' });
}

function registerParticipantSocket(participantId, socketId) {
  if (!participantId || !socketId) return;
  if (!participantSockets.has(participantId)) participantSockets.set(participantId, new Set());
  participantSockets.get(participantId).add(socketId);
}

function unregisterParticipantSocket(participantId, socketId) {
  if (!participantId || !socketId) return;
  const set = participantSockets.get(participantId);
  if (!set) return;
  set.delete(socketId);
  if (!set.size) participantSockets.delete(participantId);
}

app.use(express.static(path.join(__dirname, 'public')));

function localIpv4List() {
  const nets = os.networkInterfaces();
  const result = [];
  Object.values(nets).forEach((arr) => {
    (arr || []).forEach((n) => {
      if (n && n.family === 'IPv4' && !n.internal) result.push(n.address);
    });
  });
  return [...new Set(result)];
}

app.get('/api/network-info', (_req, res) => {
  const port = process.env.PORT || 4310;
  const ips = localIpv4List();
  const preferredHost = ips[0] || 'localhost';
  res.json({
    port: Number(port),
    ips,
    preferredOrigin: `http://${preferredHost}:${port}`,
    localOrigin: `http://localhost:${port}`,
  });
});

function withApiError(res, err) {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, message: '파일 용량이 너무 큽니다. 10MB 이하로 업로드해 주세요.' });
  return res.status(err?.status || 500).json({ ok: false, message: err?.message || '업로드 처리 중 오류가 발생했습니다.' });
}

app.post('/api/classes/:className/submissions', upload.single('file'), async (req, res) => {
  try {
    const className = req.params.className;
    const { participantId, participantSecret, questionNo } = req.body || {};
    const state = getClassByName(className);
    if (!state) throw Object.assign(new Error('수업을 찾을 수 없습니다.'), { status: 404 });
    const participant = state.participants.find((p) => p.participantId === participantId);
    if (!participant || participant.participantSecret !== participantSecret) throw Object.assign(new Error('학생 인증 정보가 유효하지 않습니다.'), { status: 401 });
    const board = activeBoard(state);
    if (!board) throw Object.assign(new Error('활성 문항이 없습니다.'), { status: 400 });
    if (!req.file) throw Object.assign(new Error('업로드 파일이 없습니다.'), { status: 400 });
    ensureAllowedFile(req.file);

    const slot = ensureSlot(board, participant);
    const uDir = classUploadDir(state.classId);
    ensureDir(uDir);
    const originalAbs = path.join(uDir, makeUploadFilename(`${board.id}-${slot.id}-orig`, req.file.mimetype));
    fs.renameSync(req.file.path, originalAbs);

    let thumbRel = '';
    if (req.file.mimetype.startsWith('image/')) {
      const thumbAbs = path.join(uDir, makeUploadFilename(`${board.id}-${slot.id}-thumb`, 'image/jpeg'));
      await sharp(originalAbs).rotate().resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(thumbAbs);
      thumbRel = relativeFromRoot(thumbAbs);
    } else {
      const svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"260\" height=\"260\"><rect width=\"100%\" height=\"100%\" fill=\"#eef2ff\"/><text x=\"50%\" y=\"50%\" dominant-baseline=\"middle\" text-anchor=\"middle\" fill=\"#334155\" font-size=\"24\">PDF</text></svg>';
      const thumbAbs = path.join(uDir, makeUploadFilename(`${board.id}-${slot.id}-thumb`, 'image/png'));
      await sharp(Buffer.from(svg)).png().toFile(thumbAbs);
      thumbRel = relativeFromRoot(thumbAbs);
    }

    removeFileSafe(absoluteFromRoot(slot.dataPath));
    removeFileSafe(absoluteFromRoot(slot.thumbPath));
    slot.questionNo = questionNo || '';
    slot.fileName = req.file.originalname || 'submission';
    slot.mimeType = req.file.mimetype;
    slot.dataPath = relativeFromRoot(originalAbs);
    slot.thumbPath = thumbRel;
    slot.submittedAt = new Date().toISOString();

    saveClassState(state.classId);
    emitAllState(state.classId);
    res.json({ ok: true, submittedAt: slot.submittedAt });
  } catch (err) {
    removeFileSafe(req.file?.path);
    withApiError(res, err);
  }
});

app.post('/api/classes/:className/problem-file', upload.single('file'), async (req, res) => {
  try {
    const className = req.params.className;
    const { teacherToken } = req.body || {};
    if (!authorizeTeacher(teacherToken)) throw Object.assign(new Error('교사 인증이 필요합니다.'), { status: 401 });
    const state = getClassByName(className);
    if (!state) throw Object.assign(new Error('수업을 찾을 수 없습니다.'), { status: 404 });
    if (!req.file) throw Object.assign(new Error('업로드 파일이 없습니다.'), { status: 400 });
    ensureAllowedFile(req.file);

    const uDir = classUploadDir(state.classId);
    ensureDir(uDir);
    const originalAbs = path.join(uDir, makeUploadFilename(`problem`, req.file.mimetype));
    fs.renameSync(req.file.path, originalAbs);
    let thumbRel = '';
    if (req.file.mimetype.startsWith('image/')) {
      const thumbAbs = path.join(uDir, makeUploadFilename(`problem-thumb`, 'image/jpeg'));
      await sharp(originalAbs).rotate().resize({ width: 520, height: 520, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(thumbAbs);
      thumbRel = relativeFromRoot(thumbAbs);
    }
    res.json({
      ok: true,
      problemFileName: req.file.originalname || 'problem',
      problemMimeType: req.file.mimetype,
      problemPath: relativeFromRoot(originalAbs),
      problemThumbPath: thumbRel,
    });
  } catch (err) {
    removeFileSafe(req.file?.path);
    withApiError(res, err);
  }
});

app.get('/api/classes/:className/assets/:type/:boardId/:slotId', (req, res) => {
  const state = getClassByName(req.params.className);
  if (!state) return res.status(404).end();
  const teacherOk = authorizeTeacher(req.query.teacherToken || '');
  const codeOk = req.query.code && String(req.query.code) === String(state.classCode);
  if (!teacherOk && !codeOk) return res.status(401).end();
  const board = (state.boards || []).find((b) => b.id === req.params.boardId);
  if (!board) return res.status(404).end();
  let rel = '';
  if (req.params.type === 'problem') rel = board.problemPath || '';
  if (req.params.type === 'problem-thumb') rel = board.problemThumbPath || '';
  if (req.params.type === 'thumb' || req.params.type === 'original') {
    const slot = (board.slots || []).find((s) => s.id === req.params.slotId);
    if (!slot) return res.status(404).end();
    rel = req.params.type === 'thumb' ? slot.thumbPath : slot.dataPath;
    if (req.params.type === 'original' && !teacherOk) return res.status(403).end();
  }
  if (!rel) return res.status(404).end();
  const abs = absoluteFromRoot(rel);
  if (!fs.existsSync(abs)) return res.status(404).end();
  if (req.query.download === '1') {
    const downloadName = (req.params.type === 'original' && (board.slots || []).find((s) => s.id === req.params.slotId)?.fileName)
      || (req.params.type === 'problem' && board.problemFileName)
      || path.basename(abs);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  }
  res.sendFile(abs);
});

io.on('connection', (socket) => {
  socket.on('classes:list', (payload = {}, cb) => {
    const role = payload.role || 'student';
    const teacherOk = role === 'teacher' && authorizeTeacher(payload.teacherToken);
    const classes = classList().map((c) => (teacherOk ? c : {
      classId: c.classId,
      className: c.className,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      isActive: c.isActive,
      participantCount: c.participantCount,
      boardCount: c.boardCount,
    }));
    cb?.({ classes });
  });

  socket.on('teacher:auth', ({ teacherPin }, cb) => {
    const ok = teacherPin === meta.globalTeacherPin;
    cb?.({ ok, teacherToken: ok ? createTeacherSession() : '', defaultPinInUse: meta.globalTeacherPin === defaultTeacherPin });
  });

  socket.on('teacher:pin:update', ({ currentPin, nextPin, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    if (currentPin !== meta.globalTeacherPin) return cb?.({ ok: false, message: '현재 PIN이 일치하지 않습니다.' });
    if (!/^\d{6}$/.test(nextPin || '')) return cb?.({ ok: false, message: '새 PIN은 6자리 숫자여야 합니다.' });
    if (currentPin === nextPin) return cb?.({ ok: false, message: '기존 PIN과 다른 값으로 설정해 주세요.' });
    meta.globalTeacherPin = nextPin;
    saveMeta();
    cb?.({ ok: true, defaultPinInUse: meta.globalTeacherPin === defaultTeacherPin });
  });

  socket.on('class:create', ({ className, classCode, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    if (!className?.trim()) return cb?.({ ok: false, message: '수업 이름을 입력하세요.' });
    if (!/^\d{6}$/.test(classCode || '')) return cb?.({ ok: false, message: '수업 코드는 6자리 숫자입니다.' });

    const key = className.trim();
    const existingId = classIdByName.get(key);
    if (existingId) {
      const existing = getClassById(existingId);
      existing.classCode = classCode;
      saveClassState(existingId);
      const metaClass = meta.classes.find((c) => c.classId === existingId);
      if (metaClass) metaClass.lastUsedAt = new Date().toISOString();
      saveMeta();
      return cb?.({ ok: true, classId: existingId, className: key, classCode });
    }

    const classId = makeId('c');
    const state = createClassState({ classId, className: key, classCode });
    classesById.set(classId, state);
    const now = new Date().toISOString();
    meta.classes.push({ classId, className: key, createdAt: now, lastUsedAt: now });
    classIdByName.set(key, classId);
    meta.activeClassId = classId;
    saveAll();
    cb?.({ ok: true, classId, className: key, classCode });
  });

  socket.on('class:delete', ({ className, teacherToken, force }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const classId = classIdByName.get(className);
    if (!classId) return cb?.({ ok: false, message: '삭제할 수업을 찾을 수 없습니다.' });
    if (meta.activeClassId === classId && !force) {
      return cb?.({ ok: false, message: '현재 활성 수업입니다. 안전을 위해 먼저 다른 수업을 선택 후 삭제하세요.', code: 'ACTIVE_CLASS_DELETE_BLOCKED' });
    }

    classesById.delete(classId);
    classIdByName.delete(className);
    meta.classes = meta.classes.filter((c) => c.classId !== classId);
    if (meta.activeClassId === classId) meta.activeClassId = meta.classes[0]?.classId || '';
    removeClassStorage(classId);
    saveMeta();
    cb?.({ ok: true });
  });

  socket.on('class:join', ({ className, classCode, role, teacherToken, participantId }, cb) => {
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '존재하지 않는 수업입니다.' });

    if (role === 'teacher') {
      if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
      socket.join(roomTeachers(state.classId));
      socket.data.classId = state.classId;
      socket.data.role = 'teacher';
      meta.activeClassId = state.classId;
      const metaClass = meta.classes.find((c) => c.classId === state.classId);
      if (metaClass) metaClass.lastUsedAt = new Date().toISOString();
      saveMeta();
      cb?.({ ok: true, state: sanitizeStateForTeacher(state), defaultPinInUse: meta.globalTeacherPin === defaultTeacherPin });
      socket.emit('state:update', sanitizeStateForTeacher(state));
      return;
    }

    if (state.classCode !== classCode) return cb?.({ ok: false, message: '수업 코드가 일치하지 않습니다.' });
    let safeParticipantId = participantId || '';
    let participantSecret = '';
    if (safeParticipantId) {
      const existing = state.participants.find((p) => p.participantId === safeParticipantId);
      if (existing) {
        participantSecret = existing.participantSecret || makeSecret();
        existing.participantSecret = participantSecret;
      }
    }
    if (!safeParticipantId) {
      safeParticipantId = makeId('p');
      participantSecret = makeSecret();
      state.participants.push({
        participantId: safeParticipantId,
        participantSecret,
        classroom: '',
        studentNo: '',
        realName: '',
        nickname: `학생-${String(state.participants.length + 1).padStart(2, '0')}`,
      });
      saveClassState(state.classId);
    }
    if (!participantSecret) participantSecret = makeSecret();
    socket.join(roomStudents(state.classId));
    socket.data.classId = state.classId;
    socket.data.role = 'student';
    socket.data.participantId = safeParticipantId;
    registerParticipantSocket(safeParticipantId, socket.id);
    const metaClass = meta.classes.find((c) => c.classId === state.classId);
    if (metaClass) metaClass.lastUsedAt = new Date().toISOString();
    saveMeta();
    cb?.({ ok: true, participantId: safeParticipantId, participantSecret, state: sanitizeStateForStudent(state) });
    socket.emit('state:update', sanitizeStateForStudent(state));
  });

  socket.on('board:create', ({ className, title, teacherToken, problemText, problemFileName, problemMimeType, problemPath, problemThumbPath, aiAnalysisEnabled }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '수업을 찾을 수 없습니다.' });

    const board = {
      id: makeId('board'),
      title: title?.trim() || `문항 ${state.boards.length + 1}`,
      createdAt: new Date().toISOString(),
      promptTitle: title?.trim() || '',
      problemText: problemText || '',
      problemFileName: problemFileName || '',
      problemMimeType: problemMimeType || '',
      problemPath: problemPath || '',
      problemThumbPath: problemThumbPath || '',
      aiAnalysisEnabled: Boolean(aiAnalysisEnabled),
      aiTopLearnCandidateIds: [],
      aiTopExcellentCandidateIds: [],
      aiLastBatchAnalyzedAt: '',
      slots: state.participants.map((p) => createSlotFromParticipant(p)),
    };
    state.boards.push(board);
    state.activeBoardId = board.id;
    state.selectedSubmissionId = null;
    meta.activeClassId = state.classId;
    const metaClass = meta.classes.find((c) => c.classId === state.classId);
    if (metaClass) metaClass.lastUsedAt = new Date().toISOString();
    saveClassState(state.classId);
    saveMeta();
    emitAllState(state.classId);
    cb?.({ ok: true });
  });

  socket.on('ai:analyze-board', async ({ className, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    if (!process.env.OPENAI_API_KEY) return cb?.({ ok: false, message: 'AI 기능을 사용하려면 OPENAI_API_KEY 설정이 필요합니다.' });
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '수업을 찾을 수 없습니다.' });
    const board = activeBoard(state);
    if (!board) return cb?.({ ok: false, message: '활성 문항이 없습니다.' });
    const submitted = (board.slots || []).filter((s) => Boolean(s.thumbPath));
    if (!submitted.length) return cb?.({ ok: false, message: '분석할 제출물이 없습니다.' });

    for (const slot of submitted) {
      slot.aiStatus = 'queued';
      slot.aiErrorMessage = '';
    }
    emitAllState(state.classId);

    for (const slot of submitted) await analyzeSingleSlot({ state, board, slot });

    if (submitted.length >= 2) {
      const byConf = { low: 1, medium: 2, high: 3 };
      const sorted = [...submitted].sort((a, b) => (byConf[b.aiConfidence] || 0) - (byConf[a.aiConfidence] || 0));
      board.aiTopLearnCandidateIds = sorted.filter((s) => s.aiCandidateTag === 'learn_from_mistake').slice(0, 3).map((s) => s.id);
      board.aiTopExcellentCandidateIds = sorted.filter((s) => s.aiCandidateTag === 'excellent_solution').slice(0, 3).map((s) => s.id);
    } else {
      board.aiTopLearnCandidateIds = [];
      board.aiTopExcellentCandidateIds = [];
    }
    board.aiLastBatchAnalyzedAt = new Date().toISOString();
    saveClassState(state.classId);
    emitAllState(state.classId);
    cb?.({ ok: true, analyzed: submitted.length, insufficientForRanking: submitted.length < 2 });
  });

  socket.on('ai:analyze-slot', async ({ className, slotId, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    if (!process.env.OPENAI_API_KEY) return cb?.({ ok: false, message: 'AI 기능을 사용하려면 OPENAI_API_KEY 설정이 필요합니다.' });
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '수업을 찾을 수 없습니다.' });
    const board = activeBoard(state);
    if (!board) return cb?.({ ok: false, message: '활성 문항이 없습니다.' });
    const slot = (board.slots || []).find((s) => s.id === slotId);
    if (!slot || !slot.thumbPath) return cb?.({ ok: false, message: '분석할 제출물이 없습니다.' });
    const result = await analyzeSingleSlot({ state, board, slot });
    if (!result.ok) return cb?.({ ok: false, message: result.message || '개별 분석에 실패했습니다.' });
    cb?.({ ok: true });
  });

  socket.on('participant:kick', ({ className, participantId, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state || !participantId) return cb?.({ ok: false, message: '강퇴 대상이 없습니다.' });
    const exists = (state.participants || []).some((p) => p.participantId === participantId);
    if (!exists) return cb?.({ ok: false, message: '해당 학생을 찾을 수 없습니다.' });
    const set = participantSockets.get(participantId);

    state.participants = (state.participants || []).filter((p) => p.participantId !== participantId);
    (state.boards || []).forEach((b) => {
      const removedSlots = (b.slots || []).filter((s) => s.participantId === participantId);
      removedSlots.forEach((s) => {
        removeFileSafe(absoluteFromRoot(s.dataPath));
        removeFileSafe(absoluteFromRoot(s.thumbPath));
        if (state.selectedSubmissionId === s.id) state.selectedSubmissionId = null;
      });
      b.slots = (b.slots || []).filter((s) => s.participantId !== participantId);
    });

    saveClassState(state.classId);
    emitAllState(state.classId);

    if (set && set.size) {
      for (const sid of [...set]) {
        const target = io.sockets.sockets.get(sid);
        if (!target) continue;
        target.emit('participant:kicked', { message: '교사에 의해 수업에서 퇴장되었습니다. 다시 입장해 주세요.' });
        target.leave(roomStudents(state.classId));
        target.disconnect(true);
      }
    }
    participantSockets.delete(participantId);
    cb?.({ ok: true });
  });

  socket.on('board:activate', ({ className, boardId, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state || !state.boards.some((b) => b.id === boardId)) return cb?.({ ok: false, message: '문항을 찾을 수 없습니다.' });
    state.activeBoardId = boardId;
    state.selectedSubmissionId = null;
    meta.activeClassId = state.classId;
    const metaClass = meta.classes.find((c) => c.classId === state.classId);
    if (metaClass) metaClass.lastUsedAt = new Date().toISOString();
    saveClassState(state.classId);
    saveMeta();
    emitAllState(state.classId);
    cb?.({ ok: true });
  });

  socket.on('profile:upsert', ({ className, profile, participantId, participantSecret }, cb) => {
    const state = getClassByName(className);
    if (!state || !profile?.nickname) return cb?.({ ok: false, message: '프로필 정보가 올바르지 않습니다.' });
    if (!participantId || !participantSecret) return cb?.({ ok: false, message: '참여자 인증 정보가 필요합니다. 수업 입장에서 다시 시작해 주세요.', code: 'PARTICIPANT_AUTH_REQUIRED' });
    const me = state.participants.find((p) => p.participantId === participantId);
    if (me && me.participantSecret && me.participantSecret !== participantSecret) {
      return cb?.({ ok: false, message: '참여자 인증이 유효하지 않습니다. 다시 입장해 주세요.' });
    }

    const dupNickname = state.participants.find((p) => p.nickname === profile.nickname && p.participantId !== participantId);
    if (dupNickname) return cb?.({ ok: false, message: '이미 사용 중인 별명입니다. 다른 별명을 입력해 주세요.' });

    const participant = ensureParticipant(state, profile, participantId);
    participant.participantSecret = participant.participantSecret || participantSecret;
    ensureSlot(activeBoard(state), participant);
    socket.data.participantId = participant.participantId;
    registerParticipantSocket(participant.participantId, socket.id);
    const metaClass = meta.classes.find((c) => c.classId === state.classId);
    if (metaClass) metaClass.lastUsedAt = new Date().toISOString();
    saveClassState(state.classId);
    saveMeta();
    emitAllState(state.classId);
    cb?.({ ok: true, participantId: participant.participantId, participantSecret: participant.participantSecret });
  });

  socket.on('submission:upsert', ({ className, participantId, participantSecret }, cb) => {
    const state = getClassByName(className);
    if (!state || !participantId || !participantSecret) return cb?.({ ok: false, message: '제출 요청 정보가 올바르지 않습니다.' });
    cb?.({ ok: false, message: '제출 방식이 변경되었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' });
  });

  socket.on('submission:delete', ({ className, slotId, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state || !slotId) return cb?.({ ok: false, message: '삭제 대상이 없습니다.' });
    const board = activeBoard(state);
    if (!board) return cb?.({ ok: false, message: '활성 문항이 없습니다.' });

    const slot = board.slots.find((s) => s.id === slotId);
    if (!slot) return cb?.({ ok: false, message: '슬롯을 찾을 수 없습니다.' });

    slot.questionNo = '';
    slot.fileName = '';
    slot.mimeType = '';
    removeFileSafe(absoluteFromRoot(slot.dataPath));
    removeFileSafe(absoluteFromRoot(slot.thumbPath));
    slot.dataPath = '';
    slot.thumbPath = '';
    slot.submittedAt = '';
    if (state.selectedSubmissionId === slotId) state.selectedSubmissionId = null;

    saveClassState(state.classId);
    emitAllState(state.classId);
    cb?.({ ok: true });
  });

  socket.on('submission:get-detail', ({ className, slotId, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '수업을 찾을 수 없습니다.' });
    const board = activeBoard(state);
    if (!board) return cb?.({ ok: false, message: '활성 문항이 없습니다.' });
    const slot = board.slots.find((s) => s.id === slotId);
    if (!slot) return cb?.({ ok: false, message: '제출을 찾을 수 없습니다.' });
    cb?.({
      ok: true,
      detail: {
        slotId: slot.id,
        fileName: slot.fileName || 'submission',
        mimeType: slot.mimeType || 'application/octet-stream',
        originalUrl: `/api/classes/${encodeURIComponent(state.className)}/assets/original/${encodeURIComponent(board.id)}/${encodeURIComponent(slot.id)}?teacherToken=${encodeURIComponent(teacherToken)}`,
        downloadUrl: `/api/classes/${encodeURIComponent(state.className)}/assets/original/${encodeURIComponent(board.id)}/${encodeURIComponent(slot.id)}?teacherToken=${encodeURIComponent(teacherToken)}&download=1`,
      },
    });
  });

  socket.on('focus:set', ({ className, slotId, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '수업을 찾을 수 없습니다.' });
    state.selectedSubmissionId = slotId || null;
    saveClassState(state.classId);
    emitAllState(state.classId);
    cb?.({ ok: true });
  });

  socket.on('focus:clear', ({ className, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '수업을 찾을 수 없습니다.' });
    state.selectedSubmissionId = null;
    saveClassState(state.classId);
    emitAllState(state.classId);
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    unregisterParticipantSocket(socket.data?.participantId, socket.id);
  });
});

setInterval(cleanupExpiredSessions, 1000 * 60 * 10).unref();

const defaultPort = 4310;
const port = Number.parseInt(process.env.PORT || '', 10) || defaultPort;

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[class-wallboard] Port ${port} is already in use.`);
    console.error('[class-wallboard] Stop the other process or run with a different port, e.g. PORT=4311 node server.js');
    process.exit(1);
  }
  throw err;
});

loadStore();
server.listen(port, () => {
  console.log(`Class wallboard server running on http://localhost:${port}`);
  console.log(`[class-wallboard] OpenAI model: ${openAiModel}`);
  console.log(`[class-wallboard] OPENAI_API_KEY loaded: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}`);
});
