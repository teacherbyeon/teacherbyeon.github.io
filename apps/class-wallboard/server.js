const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 15 * 1024 * 1024 });

const dataDir = path.join(__dirname, 'data');
const metaFile = path.join(dataDir, 'meta.json');
const legacyStoreFile = path.join(dataDir, 'wallboard-store.json');
const classesDir = path.join(dataDir, 'classes');
const uploadsDir = path.join(dataDir, 'uploads');

const classesById = new Map();
const classIdByName = new Map();
const teacherSessions = new Map();
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

function classFilePath(classId) {
  return path.join(classesDir, `${classId}.json`);
}
function classUploadDir(classId) {
  return path.join(uploadsDir, classId);
}

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
    dataUrl: '',
    thumb: '',
    dataPath: '',
    thumbPath: '',
    submittedAt: '',
  };
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
        dataUrl: s.dataUrl || readPayloadFile(s.dataPath),
        thumb: s.thumb || readPayloadFile(s.thumbPath),
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

function sanitizeStateForStudent(state) {
  return {
    classId: state.classId,
    className: state.className,
    boards: (state.boards || []).map((b) => ({
      id: b.id,
      title: b.title,
      slots: (b.slots || []).map((s) => ({
        id: s.id,
        participantId: s.participantId,
        nickname: s.nickname || '익명',
        thumb: s.thumb || '',
        hasSubmission: Boolean(s.thumb),
      })),
    })),
    activeBoardId: state.activeBoardId,
    selectedSubmissionId: state.selectedSubmissionId,
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
        thumb: s.thumb || '',
        submittedAt: s.submittedAt || '',
        hasDetail: Boolean(s.dataUrl || s.dataPath),
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
  return {
    ...state,
    boards: (state.boards || []).map((b) => ({
      ...b,
      slots: (b.slots || []).map((s) => {
        const out = { ...s };
        if (out.dataUrl) {
          out.dataPath = writePayloadFile(state.classId, b.id, s.id, 'data', out.dataUrl);
          out.dataUrl = '';
        }
        if (out.thumb) {
          out.thumbPath = writePayloadFile(state.classId, b.id, s.id, 'thumb', out.thumb);
          out.thumb = '';
        }
        return out;
      }),
    })),
  };
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
  return meta.classes.map((c) => ({ classId: c.classId, className: c.className }));
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

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.on('classes:list', (_payload, cb) => cb?.({ classes: classList() }));

  socket.on('teacher:auth', ({ teacherPin }, cb) => {
    const ok = teacherPin === meta.globalTeacherPin;
    cb?.({ ok, teacherToken: ok ? createTeacherSession() : '', defaultPinInUse: meta.globalTeacherPin === defaultTeacherPin });
  });

  socket.on('teacher:pin:update', ({ currentPin, nextPin, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    if (currentPin !== meta.globalTeacherPin) return cb?.({ ok: false, message: '현재 PIN이 일치하지 않습니다.' });
    if (!/^\d{6}$/.test(nextPin || '')) return cb?.({ ok: false, message: '새 PIN은 6자리 숫자여야 합니다.' });
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
      return cb?.({ ok: true, classId: existingId, className: key, classCode });
    }

    const classId = makeId('c');
    const state = createClassState({ classId, className: key, classCode });
    classesById.set(classId, state);
    meta.classes.push({ classId, className: key });
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
    cb?.({ ok: true, participantId: safeParticipantId, participantSecret, state: sanitizeStateForStudent(state) });
    socket.emit('state:update', sanitizeStateForStudent(state));
  });

  socket.on('board:create', ({ className, title, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state) return cb?.({ ok: false, message: '수업을 찾을 수 없습니다.' });

    const board = {
      id: makeId('board'),
      title: title?.trim() || `문항 ${state.boards.length + 1}`,
      createdAt: new Date().toISOString(),
      slots: state.participants.map((p) => createSlotFromParticipant(p)),
    };
    state.boards.push(board);
    state.activeBoardId = board.id;
    state.selectedSubmissionId = null;
    meta.activeClassId = state.classId;
    saveClassState(state.classId);
    saveMeta();
    emitAllState(state.classId);
    cb?.({ ok: true });
  });

  socket.on('board:activate', ({ className, boardId, teacherToken }, cb) => {
    if (!authorizeTeacher(teacherToken)) return rejectTeacherAction(socket, cb);
    const state = getClassByName(className);
    if (!state || !state.boards.some((b) => b.id === boardId)) return cb?.({ ok: false, message: '문항을 찾을 수 없습니다.' });
    state.activeBoardId = boardId;
    state.selectedSubmissionId = null;
    meta.activeClassId = state.classId;
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
    saveClassState(state.classId);
    emitAllState(state.classId);
    cb?.({ ok: true, participantId: participant.participantId, participantSecret: participant.participantSecret });
  });

  socket.on('submission:upsert', ({ className, participantId, participantSecret, questionNo, fileName, mimeType, dataUrl, thumb }, cb) => {
    const state = getClassByName(className);
    if (!state || !participantId || !participantSecret || !dataUrl || !thumb) return cb?.({ ok: false, message: '제출 데이터가 올바르지 않습니다.' });

    const participant = state.participants.find((p) => p.participantId === participantId);
    if (!participant) return cb?.({ ok: false, message: '프로필 저장 후 제출해 주세요.' });
    if (participant.participantSecret !== participantSecret) return cb?.({ ok: false, message: '참여자 인증이 유효하지 않습니다. 다시 입장해 주세요.' });

    const board = activeBoard(state);
    if (!board) return cb?.({ ok: false, message: '활성 문항이 없습니다.' });

    const slot = ensureSlot(board, participant);
    slot.questionNo = questionNo || '';
    slot.fileName = fileName || 'submission';
    slot.mimeType = mimeType || 'application/octet-stream';
    slot.dataUrl = dataUrl;
    slot.thumb = thumb;
    slot.dataPath = '';
    slot.thumbPath = '';
    slot.submittedAt = new Date().toISOString();

    saveClassState(state.classId);
    emitAllState(state.classId);
    cb?.({ ok: true, submittedAt: slot.submittedAt });
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
    slot.dataUrl = '';
    slot.thumb = '';
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
        dataUrl: slot.dataUrl || readPayloadFile(slot.dataPath),
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
});

setInterval(cleanupExpiredSessions, 1000 * 60 * 10).unref();

const port = process.env.PORT || 4310;
loadStore();
server.listen(port, () => {
  console.log(`Class wallboard server running on http://localhost:${port}`);
});
