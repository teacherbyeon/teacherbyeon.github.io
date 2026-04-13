const roleKey = 'wallboard-role';
const classNameKey = 'wallboard-class-name';
const classCodeKey = 'wallboard-class-code';
const profileKey = 'wallboard-profile';
const participantIdMapKey = 'wallboard-participant-id-map';
const participantSecretMapKey = 'wallboard-participant-secret-map';
const teacherTokenKey = 'wallboard-teacher-token';
const themeKey = 'wallboard-theme-mode';

const page = document.body.dataset.page;
const byId = (id) => document.getElementById(id);
const socket = typeof io === 'function' ? io({
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 800,
  reconnectionDelayMax: 4000,
  timeout: 12000,
}) : null;
const transientMsgKey = 'wallboard-transient-msg';

const state = {
  className: localStorage.getItem(classNameKey) || '',
  classCode: localStorage.getItem(classCodeKey) || '',
  boards: [],
  activeBoardId: null,
  selectedSubmissionId: null,
  participants: [],
  classes: [],
  participantId: '',
  pinDefaultInUse: false,
  preferredOrigin: '',
};
let manageSelectedBoardId = '';
let submitting = false;
let teacherProblemClipboardFile = null;

function setRole(v) { localStorage.setItem(roleKey, v); }
function getRole() { return localStorage.getItem(roleKey); }
function setClassName(v) { state.className = v; localStorage.setItem(classNameKey, v || ''); }
function setClassCode(v) { state.classCode = v; localStorage.setItem(classCodeKey, v || ''); }
function setTeacherPin() {}
function setTeacherToken(v) { localStorage.setItem(teacherTokenKey, v || ''); }
function getTeacherToken() { return localStorage.getItem(teacherTokenKey) || ''; }
function isTeacherAuthorized() { return getRole() === 'teacher' && Boolean(getTeacherToken()); }
function go(path) { location.href = path; }
function setTransientMessage(msg) { sessionStorage.setItem(transientMsgKey, msg || ''); }
function consumeTransientMessage() {
  const v = sessionStorage.getItem(transientMsgKey) || '';
  if (v) sessionStorage.removeItem(transientMsgKey);
  return v;
}

function getParticipantIdMap() {
  try { return JSON.parse(localStorage.getItem(participantIdMapKey) || '{}'); } catch { return {}; }
}
function getParticipantSecretMap() {
  try { return JSON.parse(localStorage.getItem(participantSecretMapKey) || '{}'); } catch { return {}; }
}
function getParticipantId(className = state.className) {
  return getParticipantIdMap()[className] || '';
}
function setParticipantId(className, participantId) {
  if (!className || !participantId) return;
  const map = getParticipantIdMap();
  map[className] = participantId;
  localStorage.setItem(participantIdMapKey, JSON.stringify(map));
  state.participantId = participantId;
}
function getParticipantSecret(className = state.className) {
  return getParticipantSecretMap()[className] || '';
}
function setParticipantSecret(className, secret) {
  if (!className || !secret) return;
  const map = getParticipantSecretMap();
  map[className] = secret;
  localStorage.setItem(participantSecretMapKey, JSON.stringify(map));
}
function currentProfile() {
  try { return JSON.parse(localStorage.getItem(profileKey) || 'null'); } catch { return null; }
}
function activeBoard() {
  return state.boards.find((b) => b.id === state.activeBoardId);
}

function defaultClassName() {
  const d = new Date();
  return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function applyTheme(mode) {
  const finalMode = mode || localStorage.getItem(themeKey) || 'teacher';
  localStorage.setItem(themeKey, finalMode);
  document.body.classList.toggle('projector-mode', finalMode === 'projector');
  document.body.classList.toggle('teacher-pc', getRole() === 'teacher' && window.innerWidth >= 1100);
}

function fetchClassList(cb) {
  if (!socket) { state.classes = []; cb?.(); return; }
  socket.emit('classes:list', { role: getRole(), teacherToken: getTeacherToken() }, (ack = {}) => {
    state.classes = ack.classes || [];
    cb?.();
  });
}

function renderClassList(containerId, onClick) {
  const wrap = byId(containerId);
  if (!wrap) return;
  wrap.innerHTML = '';
  state.classes.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.textContent = c.className;
    btn.onclick = () => onClick(c.className);
    wrap.appendChild(btn);
  });
}

function chooseClass(className, classCode = '') {
  setClassName(className);
  if (classCode) setClassCode(classCode);
  const selected = byId('selectedClassName');
  if (selected) selected.textContent = className || '-';
}

function parseJoinParams() {
  const qs = new URLSearchParams(location.search);
  return {
    className: qs.get('className') || '',
    classCode: qs.get('classCode') || '',
  };
}

function bindSocketStatus(elId, labels = {}) {
  const el = byId(elId);
  if (!el) return;
  const paint = () => {
    if (!socket) { el.textContent = labels.offline || '서버 연결 없음'; return; }
    el.textContent = socket.connected ? (labels.connected || '서버 연결됨') : (labels.connecting || '서버 연결 중...');
  };
  paint();
  socket?.on('connect', () => { paint(); el.textContent = labels.recovered || (labels.connected || '서버 연결됨'); });
  socket?.on('disconnect', () => { el.textContent = labels.reconnecting || '재연결 시도 중...'; });
  socket?.io?.on('reconnect_failed', () => { el.textContent = labels.failed || '재연결 실패. 잠시 후 다시 시도하세요.'; });
}

async function fetchNetworkInfo() {
  try {
    const r = await fetch('./api/network-info');
    if (!r.ok) return;
    const info = await r.json();
    state.preferredOrigin = info.preferredOrigin || '';
    const urlInfo = byId('joinUrlInfo');
    if (urlInfo) {
      const shown = info.preferredOrigin || info.localOrigin || location.origin;
      urlInfo.textContent = `학생 접속 주소: ${shown}/join.html`;
    }
  } catch {
    // noop
  }
}

function joinClassIfPossible() {
  if (!socket || !state.className) return;
  socket.emit('class:join', {
    className: state.className,
    classCode: state.classCode,
    role: getRole(),
    teacherToken: getTeacherToken(),
    participantId: getRole() === 'student' ? getParticipantId(state.className) : '',
  }, (ack = {}) => {
    if (!ack.ok) {
      if (getRole() === 'teacher') {
        setTransientMessage(ack.message || '교사 세션이 만료되었습니다. 다시 인증해 주세요.');
        return go('./teacher-auth.html');
      }
      alert(ack.message || '수업 입장에 실패했습니다.');
      return;
    }
    if (ack.state) Object.assign(state, ack.state);
    if (ack.participantId) setParticipantId(state.className, ack.participantId);
    if (ack.participantSecret) setParticipantSecret(state.className, ack.participantSecret);
    state.pinDefaultInUse = Boolean(ack.defaultPinInUse);
  });
}

function renderQR(className, classCode, canvasId = 'qrCanvas', targetOverride = '') {
  if (!window.QRCode) return;
  let target = targetOverride || '';
  if (!target) {
    const params = new URLSearchParams({ className: className || '', classCode: classCode || '' });
    const baseDir = location.pathname.replace(/[^/]*$/, '');
    const origin = state.preferredOrigin || location.origin;
    const joinUrl = new URL('join.html', `${origin}${baseDir}`);
    joinUrl.search = params.toString();
    target = joinUrl.toString();
  }
  const canvas = byId(canvasId);
  if (!canvas) return;
  QRCode.toCanvas(canvas, target, { width: 180 }, () => {});
}

function compressImage(src, maxWidth = 1600, quality = 0.82, outputMime = 'image/jpeg') {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      if (outputMime === 'image/png') return resolve(canvas.toDataURL('image/png'));
      resolve(canvas.toDataURL(outputMime, quality));
    };
    img.src = src;
  });
}

function readFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function uploadSubmissionFile(file, participantId, participantSecret) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('participantId', participantId);
  fd.append('participantSecret', participantSecret);
  const r = await fetch(`/api/classes/${encodeURIComponent(state.className)}/submissions`, { method: 'POST', body: fd });
  const ack = await r.json().catch(() => ({ ok: false, message: '업로드 응답을 처리하지 못했습니다.' }));
  if (!r.ok || !ack.ok) throw new Error(ack.message || '업로드 실패');
  return ack;
}

async function uploadProblemFile(file) {
  if (!file) return { problemFileName: '', problemMimeType: '', problemPath: '', problemThumbPath: '' };
  const fd = new FormData();
  fd.append('file', file);
  fd.append('teacherToken', getTeacherToken());
  const r = await fetch(`/api/classes/${encodeURIComponent(state.className)}/problem-file`, { method: 'POST', body: fd });
  const ack = await r.json().catch(() => ({ ok: false, message: '문제 파일 업로드 응답을 처리하지 못했습니다.' }));
  if (!r.ok || !ack.ok) throw new Error(ack.message || '문제 파일 업로드 실패');
  return ack;
}

function boardProgress(board) {
  const total = (state.participants || []).length || Number(state.participantCount || 0);
  if (!total) return { total: 0, submitted: 0, remaining: [] };
  const submittedIds = new Set((board?.slots || []).filter((s) => Boolean(s.thumbUrl)).map((s) => s.participantId));
  const list = state.participants || [];
  const remaining = list.filter((p) => !submittedIds.has(p.participantId)).map((p) => p.nickname || '익명');
  const submitted = list.length ? (total - remaining.length) : submittedIds.size;
  return { total, submitted, remaining };
}

function renderHistoryTabs(id) {
  const wrap = byId(id);
  if (!wrap) return;
  wrap.innerHTML = '';
  state.boards.forEach((b) => {
    const progress = boardProgress(b);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab-btn ${b.id === state.activeBoardId ? 'active' : ''}`;
    const title = document.createElement('span');
    title.textContent = b.title;
    const sub = document.createElement('small');
    sub.textContent = `${progress.submitted}/${progress.total} 업로드`;
    btn.append(title, sub);
    btn.disabled = !isTeacherAuthorized();
    btn.onclick = () => socket?.emit('board:activate', { className: state.className, boardId: b.id, teacherToken: getTeacherToken() });
    wrap.appendChild(btn);
  });
}

function selectedManageBoard() {
  return state.boards.find((b) => b.id === manageSelectedBoardId) || activeBoard();
}

function createSlotCard(slot) {
  const card = document.createElement('article');
  card.className = `slot ${state.selectedSubmissionId === slot.id ? 'expanded' : ''}`;

  const title = document.createElement('h4');
  title.textContent = slot.nickname || '익명';
  card.appendChild(title);

  if (slot.thumbUrl) {
    const img = document.createElement('img');
    img.src = slot.thumbUrl;
    img.alt = slot.nickname || '제출물';
    card.appendChild(img);
  } else {
    const empty = document.createElement('p');
    empty.textContent = '아직 미제출';
    card.appendChild(empty);
  }

  if (slot.thumbUrl && isTeacherAuthorized()) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'slot-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = '썸네일 삭제';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      if (!confirm(`${slot.nickname} 학생의 제출물을 삭제할까요?`)) return;
      socket?.emit('submission:delete', { className: state.className, slotId: slot.id, teacherToken: getTeacherToken() });
    };
    card.appendChild(removeBtn);

    card.onclick = () => {
      const ev = state.selectedSubmissionId === slot.id ? 'focus:clear' : 'focus:set';
      socket?.emit(ev, { className: state.className, slotId: slot.id, teacherToken: getTeacherToken() });
    };
  }
  return card;
}

function renderBoardPage() {
  if (!getRole() || !state.className) return go('./join.html');
  applyTheme();

  document.querySelectorAll('.teacher-only').forEach((el) => el.classList.toggle('hidden', getRole() !== 'teacher'));
  document.querySelectorAll('.student-only').forEach((el) => el.classList.toggle('hidden', getRole() !== 'student'));

  byId('classNameLabel').textContent = state.className || '-';
  byId('activeBoardTitle').textContent = activeBoard()?.title || '없음';
  if (isTeacherAuthorized()) {
    byId('teacherGuideClassName') && (byId('teacherGuideClassName').textContent = state.className || '-');
    byId('teacherBoardClassCode') && (byId('teacherBoardClassCode').textContent = state.classCode || '-');
    const baseDir = location.pathname.replace(/[^/]*$/, '');
    const origin = state.preferredOrigin || location.origin;
    const shortJoinUrl = new URL('join.html', `${origin}${baseDir}`).toString();
    renderQR(state.className, state.classCode, 'boardQrCanvas', shortJoinUrl);
    const joinUrlEl = byId('studentJoinUrlDisplay');
    if (joinUrlEl) joinUrlEl.textContent = shortJoinUrl;
    const copyBtn = byId('copyJoinUrlBtn');
    if (copyBtn) {
      copyBtn.disabled = false;
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(shortJoinUrl);
          copyBtn.textContent = '복사 완료';
          setTimeout(() => { copyBtn.textContent = '주소 복사'; }, 1200);
        } catch {
          alert('URL 복사에 실패했습니다. 수동으로 복사해 주세요.');
        }
      };
    }
  }
  renderHistoryTabs('historyTabs');

  const board = activeBoard();
  const wall = byId('wallboard');
  const summary = byId('boardProgressSummary');
  const remainingList = byId('boardRemainingList');
  wall.innerHTML = '';

  if (!board) {
    if (summary) summary.textContent = '현재 활성화된 벽보드가 없습니다.';
    if (remainingList) remainingList.classList.add('hidden');
    return;
  }

  const studentProblemTitle = byId('studentProblemTitle');
  const studentProblemText = byId('studentProblemText');
  const studentProblemImg = byId('studentProblemImg');
  const studentProblemDoc = byId('studentProblemDoc');
  if (studentProblemTitle) studentProblemTitle.textContent = board.promptTitle || board.title || '문제 정보';
  if (studentProblemText) studentProblemText.textContent = board.problemText || '문제 설명이 등록되지 않았습니다.';
  if (studentProblemImg && studentProblemDoc) {
    studentProblemImg.classList.add('hidden');
    studentProblemDoc.classList.add('hidden');
    if ((board.problemMimeType || '').startsWith('image/') && board.problemUrl) {
      studentProblemImg.src = board.problemUrl;
      studentProblemImg.classList.remove('hidden');
    } else if ((board.problemMimeType || '').includes('pdf') && board.problemUrl) {
      studentProblemDoc.src = board.problemUrl;
      studentProblemDoc.classList.remove('hidden');
    }
  }

  const progress = boardProgress(board);
  if (summary) summary.textContent = progress.total
    ? `업로드 완료 ${progress.submitted}명 / 미업로드 ${progress.remaining.length}명 / 전체 ${progress.total}명`
    : '참여 학생 정보가 아직 없습니다.';
  if (remainingList) {
    if (progress.remaining.length > 0 && progress.remaining.length <= 5) {
      remainingList.textContent = `아직 업로드하지 않은 학생: ${progress.remaining.join(', ')}`;
      remainingList.classList.remove('hidden');
    } else {
      remainingList.classList.add('hidden');
      remainingList.textContent = '';
    }
  }

  (board.slots || []).forEach((slot) => wall.appendChild(createSlotCard(slot)));

  const mySlot = (board.slots || []).find((s) => s.participantId === getParticipantId(state.className));
  const studentAiFeedback = byId('studentAiFeedback');
  if (studentAiFeedback) {
    if (!mySlot) studentAiFeedback.textContent = '아직 제출 전입니다.';
    else if (mySlot.aiStatus === 'queued') studentAiFeedback.textContent = 'AI 분석 중입니다...';
    else if (mySlot.aiStatus === 'error') studentAiFeedback.textContent = 'AI 분석을 완료하지 못했습니다.';
    else studentAiFeedback.textContent = mySlot.aiFeedbackForStudent || '아직 분석 결과가 없습니다.';
  }

  const aiHint = byId('aiCandidateHint');
  const learnWrap = byId('aiLearnCandidates');
  const excellentWrap = byId('aiExcellentCandidates');
  if (aiHint && learnWrap && excellentWrap) {
    learnWrap.innerHTML = '';
    excellentWrap.innerHTML = '';
    const slots = board.slots || [];
    const learn = (board.aiTopLearnCandidateIds || []).map((id) => slots.find((s) => s.id === id)).filter(Boolean);
    const excellent = (board.aiTopExcellentCandidateIds || []).map((id) => slots.find((s) => s.id === id)).filter(Boolean);
    aiHint.textContent = slots.filter((s) => s.thumbUrl).length < 2 ? '제출이 2개 미만이면 후보 추천이 제한됩니다.' : 'AI 추천 후보 (최종 선택은 교사)';
    const addList = (title, arr, wrap) => {
      const h = document.createElement('h4'); h.textContent = title; wrap.appendChild(h);
      if (!arr.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = '추천 후보 없음'; wrap.appendChild(p); return; }
      arr.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'tab-btn';
        b.textContent = `${s.nickname}: ${s.aiTeacherSummary || '요약 없음'} (${s.aiConfidence || 'low'})`;
        b.onclick = () => socket?.emit('focus:set', { className: state.className, slotId: s.id, teacherToken: getTeacherToken() });
        wrap.appendChild(b);
      });
    };
    addList('같이 오류를 보며 학습할 후보', learn, learnWrap);
    addList('아주 잘 풀이한 후보', excellent, excellentWrap);
  }

  const focus = byId('focusView');
  const selected = (board.slots || []).find((s) => s.id === state.selectedSubmissionId);
  if (!selected?.thumbUrl) return focus.classList.add('hidden');

  byId('focusNickname').textContent = `${selected.nickname || '익명'} 풀이`;
  const focusImage = byId('focusImage');
  const focusDoc = byId('focusDoc');
  const focusDownloadBtn = byId('focusDownloadBtn');
  if (focusDoc) focusDoc.classList.add('hidden');
  if (focusDownloadBtn) focusDownloadBtn.classList.add('hidden');
  focusImage.classList.remove('hidden');
  focusImage.src = selected.thumbUrl;
  if (isTeacherAuthorized()) {
    socket?.emit('submission:get-detail', { className: state.className, slotId: selected.id, teacherToken: getTeacherToken() }, (ack = {}) => {
      if (!ack.ok || !ack.detail?.originalUrl) return;
      const detail = ack.detail;
      if ((detail.mimeType || '').startsWith('image/')) {
        focusImage.src = detail.originalUrl;
      } else if ((detail.mimeType || '').includes('pdf')) {
        focusImage.classList.add('hidden');
        if (focusDoc) {
          focusDoc.src = detail.originalUrl;
          focusDoc.classList.remove('hidden');
        }
      } else {
        focusImage.classList.add('hidden');
      }
      if (focusDownloadBtn) {
        focusDownloadBtn.classList.remove('hidden');
        focusDownloadBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = detail.downloadUrl || detail.originalUrl;
          a.download = detail.fileName || 'submission';
          a.click();
        };
      }
    });
  }
  focus.classList.remove('hidden');
}

function exportCsv() {
  const board = page === 'manage' ? selectedManageBoard() : activeBoard();
  const header = ['참여ID', '반', '학번', '실명', '별명', '문항', '마지막제출', '파일명', '자료형식'];
  const rows = (state.participants || []).map((p) => {
    const slot = board?.slots?.find((s) => s.participantId === p.participantId);
    return [
      p.participantId || '',
      p.classroom || '',
      p.studentNo || '',
      p.realName || '',
      p.nickname || '',
      slot?.questionNo || '',
      slot?.submittedAt || '',
      slot?.fileName || '',
      slot?.mimeType || '',
    ];
  });
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  a.download = `${state.className}-status.csv`;
  a.click();
}

function renderManagePage() {
  if (!isTeacherAuthorized()) return go('./teacher-auth.html');
  applyTheme('teacher');

  byId('manageClassName').textContent = state.className || '-';
  const board = selectedManageBoard();
  byId('manageBoardTitle').textContent = board?.title || '-';

  const wrap = byId('manageHistoryTabs');
  if (wrap) {
    wrap.innerHTML = '';
    state.boards.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tab-btn ${b.id === (manageSelectedBoardId || state.activeBoardId) ? 'active' : ''}`;
      btn.textContent = b.title;
      btn.onclick = () => { manageSelectedBoardId = b.id; renderManagePage(); };
      wrap.appendChild(btn);
    });
  }

  const tbody = byId('studentTable')?.querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!(state.participants || []).length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = '아직 저장된 학생 프로필이 없습니다.';
    td.className = 'hint';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  (state.participants || []).forEach((p) => {
    const slot = board?.slots?.find((s) => s.participantId === p.participantId);
    const tr = document.createElement('tr');

    const cells = [
      p.classroom || '-',
      p.studentNo || '-',
      p.realName || '-',
      p.nickname || '-',
      slot?.questionNo || '-',
      slot?.submittedAt ? new Date(slot.submittedAt).toLocaleString() : '-',
      slot?.mimeType || '-',
    ];
    cells.forEach((txt) => {
      const td = document.createElement('td');
      td.textContent = txt;
      tr.appendChild(td);
    });

    const downloadTd = document.createElement('td');
    if (slot?.hasDetail) {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'download-link';
      a.textContent = '다운로드';
      a.onclick = (e) => {
        e.preventDefault();
        socket?.emit('submission:get-detail', { className: state.className, slotId: slot.id, teacherToken: getTeacherToken() }, (ack = {}) => {
          if (!ack.ok || !ack.detail?.originalUrl) return alert(ack.message || '다운로드 파일을 불러오지 못했습니다.');
          const x = document.createElement('a');
          x.href = ack.detail.downloadUrl || ack.detail.originalUrl;
          x.download = ack.detail.fileName || 'submission';
          x.click();
        });
      };
      downloadTd.appendChild(a);
    } else {
      downloadTd.textContent = '-';
    }
    tr.appendChild(downloadTd);
    tbody.appendChild(tr);
  });
}

function registerSocket(renderFn) {
  renderFn();
  if (!socket) return;
  socket.on('connect', () => {
    joinClassIfPossible();
    if (getRole() === 'student') {
      const p = currentProfile();
      if (p) {
        socket.emit('profile:upsert', { className: state.className, profile: p, participantId: getParticipantId(state.className) }, (ack = {}) => {
          if (ack.participantId) setParticipantId(state.className, ack.participantId);
          if (ack.participantSecret) setParticipantSecret(state.className, ack.participantSecret);
        });
      }
    }
  });
  socket.on('state:update', (next) => {
    Object.assign(state, next);
    renderFn();
  });
  joinClassIfPossible();
}

function initRolePage() {
  byId('pickTeacher').onclick = () => { setRole('teacher'); go('./teacher-auth.html'); };
  byId('pickStudent').onclick = () => { setRole('student'); go('./join.html'); };
}

function initTeacherAuthPage() {
  if (getRole() !== 'teacher') return go('./role.html');
  setTeacherToken('');
  const pinInput = byId('teacherPinInput');
  const currentPinInput = byId('currentTeacherPinInput');
  const nextPinInput = byId('newTeacherPinInput');
  const status = byId('authStatus');
  const transient = consumeTransientMessage();
  if (transient) status.textContent = transient;
  pinInput.value = '';
  if (currentPinInput) currentPinInput.value = '';
  if (nextPinInput) nextPinInput.value = '';

  byId('teacherAuthBtn').onclick = () => {
    const pin = pinInput.value.trim();
    if (!/^\d{6}$/.test(pin)) return alert('PIN은 6자리 숫자');
    socket?.emit('teacher:auth', { teacherPin: pin }, (ack = {}) => {
      if (!ack.ok) return alert('PIN 인증 실패');
      setTeacherToken(ack.teacherToken);
      pinInput.value = '';
      if (currentPinInput) currentPinInput.value = '';
      if (nextPinInput) nextPinInput.value = '';
      status.textContent = ack.defaultPinInUse ? '⚠️ 기본 PIN(123456) 사용 중입니다. 수업 전 변경을 권장합니다.' : '';
      go('./join.html');
    });
  };

  byId('teacherPinUpdateBtn').onclick = () => {
    const curr = currentPinInput?.value.trim() || '';
    const next = nextPinInput?.value.trim() || '';
    if (!/^\d{6}$/.test(curr) || !/^\d{6}$/.test(next)) return alert('현재/새 PIN 모두 6자리 숫자여야 합니다.');
    if (curr === next) return alert('현재 PIN과 다른 PIN으로 변경해 주세요.');
    socket?.emit('teacher:auth', { teacherPin: curr }, (authAck = {}) => {
      if (!authAck.ok) return alert('현재 PIN 인증 실패');
      const teacherToken = authAck.teacherToken || '';
      setTeacherToken(teacherToken);
      socket?.emit('teacher:pin:update', { currentPin: curr, nextPin: next, teacherToken }, (ack = {}) => {
        if (!ack.ok) return alert(ack.message || 'PIN 변경 실패');
        alert('PIN 변경 완료');
        if (pinInput) pinInput.value = '';
        if (currentPinInput) currentPinInput.value = '';
        if (nextPinInput) nextPinInput.value = '';
        status.textContent = ack.defaultPinInUse ? '⚠️ 기본 PIN 사용 중' : 'PIN이 안전하게 변경되었습니다.';
      });
    });
  };
}

function initJoinPage() {
  if (!getRole()) return go('./role.html');
  const role = getRole();
  byId('roleText').textContent = `현재 역할: ${role === 'teacher' ? '교사' : '학생'}`;
  const status = byId('joinStatus');
  const codeInput = byId('classCode');
  const selectedClassName = byId('selectedClassName');
  const studentClassListRow = byId('studentClassListRow');

  const qp = parseJoinParams();
  if (qp.className) setClassName(qp.className);
  if (qp.classCode) setClassCode(qp.classCode);

  codeInput.value = state.classCode;
  selectedClassName.textContent = state.className || '-';

  if (qp.className && role === 'student') selectedClassName.textContent = qp.className;

  const paintStatus = () => {
    if (!status) return;
    status.textContent = !socket ? '서버에 연결되지 않았습니다. node server.js 실행 후 접속하세요.' : (socket.connected ? '서버 연결됨' : '서버 연결 중...');
  };
  fetchNetworkInfo();
  paintStatus();
  bindSocketStatus('joinStatus', { connecting: '서버 연결 중...', connected: '서버 연결됨', reconnecting: '재연결 시도 중...', failed: '재연결 실패. 새로고침해 주세요.' });

  if (role === 'teacher') {
    byId('teacherOnly').classList.remove('hidden');
    const classNameInput = byId('classNameInput');
    classNameInput.value = state.className || defaultClassName();

    byId('makeClassBtn').onclick = () => {
      const className = classNameInput.value.trim();
      const code = randomCode();
      if (!className) return alert('수업 이름 필요');
      socket?.emit('class:create', { className, classCode: code, teacherToken: getTeacherToken() }, (ack = {}) => {
        if (!ack.ok) return alert(ack.message || '수업 생성 실패');
        chooseClass(className, code);
        codeInput.value = code;
        byId('generatedCode').textContent = `생성됨: ${code}`;
        renderQR(className, code);
      });
    };

    byId('pastClassesBtn').onclick = () => go('./past-classes.html');
  } else {
    studentClassListRow?.classList.remove('hidden');
    const renderStudentList = () => {
      renderClassList('studentClassList', (className) => {
        const cls = state.classes.find((c) => c.className === className);
        chooseClass(className, cls?.classCode || '');
      });
      if (qp.className) {
        const cls = state.classes.find((c) => c.className === qp.className);
        if (cls) chooseClass(cls.className, qp.classCode || cls.classCode || '');
      }
    };
    fetchClassList(renderStudentList);
    socket?.on('connect', () => fetchClassList(renderStudentList));
  }

  byId('joinBtn').onclick = () => {
    const className = selectedClassName.textContent.trim();
    if (!className || className === '-') return alert('수업 이름을 입력하세요.');
    setClassName(className);
    const code = (codeInput.value || '').trim();
    if (role === 'student') {
      if (!/^\d{6}$/.test(code)) return alert('수업코드는 6자리 숫자입니다.');
      setClassCode(code);
      return go('./profile.html');
    }
    if (!getTeacherToken()) return go('./teacher-auth.html');
    go('./board.html');
  };
}

function initPastClassesPage() {
  if (!isTeacherAuthorized()) return go('./teacher-auth.html');
  const status = byId('pastStatus');
  const list = byId('pastClassList');
  const search = byId('pastClassSearch');
  const paintStatus = () => {
    status.textContent = !socket ? '서버에 연결되지 않았습니다.' : (socket.connected ? '수업 목록 조회 가능' : '서버 연결 중...');
  };

  const renderPastClassList = () => {
    list.innerHTML = '';
    if (!state.classes.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '저장된 과거 수업이 없습니다.';
      list.appendChild(p);
      return;
    }

    const q = (search?.value || '').trim();
    state.classes
      .filter((c) => !q || c.className.includes(q))
      .forEach((c) => {
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('strong');
      name.textContent = `${c.className}${c.isActive ? ' (현재 활성)' : ''}`;
      const metaText = document.createElement('small');
      metaText.textContent = `생성: ${c.createdAt ? new Date(c.createdAt).toLocaleString() : '-'} / 최근 사용: ${c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : '-'} / 문항 ${c.boardCount || 0}개`;

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'secondary';
      selectBtn.textContent = '현재 수업으로 선택';
      selectBtn.onclick = () => {
        chooseClass(c.className, c.classCode || '');
        alert(`현재 수업을 "${c.className}"(으)로 지정했습니다.`);
      };

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.textContent = '접속';
      openBtn.onclick = () => {
        chooseClass(c.className, c.classCode || '');
        go('./board.html');
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger';
      deleteBtn.textContent = '삭제';
      deleteBtn.onclick = () => {
        const isActive = Boolean(c.isActive);
        const msg = isActive
          ? `현재 활성 수업입니다. 삭제하면 즉시 비활성화됩니다. \"${c.className}\" 수업을 삭제할까요?`
          : `${c.className} 수업을 삭제할까요?`;
        if (!confirm(msg)) return;
        socket?.emit('class:delete', { className: c.className, teacherToken: getTeacherToken(), force: isActive }, (ack = {}) => {
          if (!ack.ok) return alert(ack.message || '삭제 실패');
          if (state.className === c.className) {
            chooseClass('', '');
            const idMap = getParticipantIdMap();
            const secMap = getParticipantSecretMap();
            delete idMap[c.className];
            delete secMap[c.className];
            localStorage.setItem(participantIdMapKey, JSON.stringify(idMap));
            localStorage.setItem(participantSecretMapKey, JSON.stringify(secMap));
            localStorage.removeItem(profileKey);
          }
          fetchClassList(renderPastClassList);
        });
      };
      if (c.isActive) deleteBtn.title = '현재 활성 수업 삭제(확인 후 강제 삭제)';
      row.append(name, metaText, openBtn, selectBtn, deleteBtn);
      list.appendChild(row);
    });
  };

  paintStatus();
  fetchClassList(renderPastClassList);
  if (socket) {
    socket.on('connect', () => { paintStatus(); fetchClassList(renderPastClassList); });
    socket.on('disconnect', paintStatus);
  }
  search?.addEventListener('input', renderPastClassList);
}

function initProfilePage() {
  if (getRole() !== 'student') return go('./board.html');
  if (!state.className) {
    alert('수업 정보가 없습니다. 수업 입장 화면으로 이동합니다.');
    return go('./join.html');
  }
  const ensureParticipantAuth = (done) => {
    const pid = getParticipantId(state.className);
    const psec = getParticipantSecret(state.className);
    if (pid && psec) return done(true);
    socket?.emit('class:join', {
      className: state.className,
      classCode: state.classCode,
      role: 'student',
      participantId: pid || '',
    }, (ack = {}) => {
      if (!ack.ok) {
        alert(ack.message || '수업 입장 정보 확인에 실패했습니다. 다시 입장해 주세요.');
        return done(false);
      }
      if (ack.participantId) setParticipantId(state.className, ack.participantId);
      if (ack.participantSecret) setParticipantSecret(state.className, ack.participantSecret);
      done(true);
    });
  };

  ensureParticipantAuth((ok) => {
    if (!ok) go('./join.html');
  });

  const p = currentProfile();
  if (p) {
    byId('classroom').value = p.classroom || '';
    byId('studentNo').value = p.studentNo || '';
    byId('realName').value = p.realName || '';
    byId('nickname').value = p.nickname || '';
  }

  byId('saveProfileBtn').onclick = () => {
    const profile = {
      classroom: byId('classroom').value.trim(),
      studentNo: byId('studentNo').value.trim(),
      realName: byId('realName').value.trim(),
      nickname: byId('nickname').value.trim() || '익명',
    };
    if (!socket) {
      localStorage.setItem(profileKey, JSON.stringify(profile));
      return go('./board.html');
    }
    ensureParticipantAuth((ok) => {
      if (!ok) return;
      socket.emit('profile:upsert', { className: state.className, profile, participantId: getParticipantId(state.className), participantSecret: getParticipantSecret(state.className) }, (ack = {}) => {
        if (!ack.ok) return alert(ack.message || '프로필 저장 실패');
        if (ack.participantId) setParticipantId(state.className, ack.participantId);
        if (ack.participantSecret) setParticipantSecret(state.className, ack.participantSecret);
        localStorage.setItem(profileKey, JSON.stringify(profile));
        go('./board.html');
      });
    });
  };
}

function setUploadUi(isBusy, msg = '') {
  const fileBtn = byId('submitFileBtn');
  const status = byId('uploadStatus');
  if (fileBtn) fileBtn.disabled = isBusy;
  if (status) status.textContent = msg;
}

async function submitFileFromInput(inputId) {
  if (submitting) return;
  const file = byId(inputId)?.files?.[0];
  if (!file) return alert('파일을 선택하세요.');
  if (file.size > 10 * 1024 * 1024) return alert('파일이 너무 큽니다. 10MB 이하 파일로 제출해 주세요.');
  const participantId = getParticipantId(state.className);
  const participantSecret = getParticipantSecret(state.className);
  if (!participantId || !participantSecret) return alert('수업 입장 정보를 확인할 수 없습니다. 다시 입장해 주세요.');

  submitting = true;
  setUploadUi(true, '업로드 중...');
  try {
    const ack = await uploadSubmissionFile(file, participantId, participantSecret);
    submitting = false;
    const typeLabel = file.type?.startsWith('image/') ? '이미지' : '파일';
    setUploadUi(false, `${typeLabel} 업로드 완료 (${new Date(ack.submittedAt || Date.now()).toLocaleTimeString()})`);
    setTimeout(() => setUploadUi(false, ''), 1200);
  } catch (err) {
    submitting = false;
    setUploadUi(false, err.message || '업로드 실패');
  }
}

function initBoardPage() {
  if (getRole() === 'student' && (!getParticipantId(state.className) || !getParticipantSecret(state.className))) {
    alert('입장 정보가 없어 프로필 화면으로 이동합니다.');
    return go('./profile.html');
  }
  registerSocket(renderBoardPage);
  bindSocketStatus('boardStatus', { connecting: '서버 연결 중...', connected: '수업 입장 완료', reconnecting: '재연결 시도 중...', failed: '재연결 실패. 다시 접속해 주세요.' });
  window.addEventListener('resize', renderBoardPage);

  socket?.on('auth:required', (payload = {}) => {
    if (!isTeacherAuthorized()) return;
    setTeacherToken('');
    setTransientMessage(payload.message || '교사 인증이 만료되었습니다. 다시 로그인해 주세요.');
    go('./teacher-auth.html');
  });

  byId('toggleThemeBtn')?.addEventListener('click', () => {
    const next = (localStorage.getItem(themeKey) || 'teacher') === 'teacher' ? 'projector' : 'teacher';
    applyTheme(next);
  });
  const problemFileInput = byId('problemFileInput');
  const problemPasteZone = byId('problemPasteZone');
  const problemPasteHint = byId('problemPasteHint');
  const clearPastedProblemBtn = byId('clearPastedProblemBtn');
  const teacherProblemPreview = byId('teacherProblemPreview');
  const teacherProblemFileName = byId('teacherProblemFileName');
  const teacherProblemPreviewImg = byId('teacherProblemPreviewImg');
  const teacherProblemPreviewDoc = byId('teacherProblemPreviewDoc');
  const renderProblemFilePreview = async () => {
    const f = teacherProblemClipboardFile || problemFileInput?.files?.[0];
    if (!teacherProblemPreview || !teacherProblemFileName || !teacherProblemPreviewImg || !teacherProblemPreviewDoc) return;
    if (!f) {
      teacherProblemPreview.classList.add('hidden');
      teacherProblemFileName.textContent = '';
      teacherProblemPreviewImg.classList.add('hidden');
      teacherProblemPreviewImg.src = '';
      teacherProblemPreviewDoc.classList.add('hidden');
      return;
    }
    teacherProblemPreview.classList.remove('hidden');
    teacherProblemFileName.textContent = `파일명: ${f.name} (${f.type || 'application/octet-stream'})`;
    teacherProblemPreviewDoc.textContent = 'PDF 파일이 선택되었습니다. 학생 화면에 문서로 표시됩니다.';
    const fileType = (f.type || '').toLowerCase();
    const fileName = (f.name || '').toLowerCase();
    const isImage = fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileName);
    const isPdf = fileType.includes('pdf') || fileName.endsWith('.pdf');
    if (isImage) {
      teacherProblemPreviewImg.src = await readFileAsDataUrl(f);
      teacherProblemPreviewImg.classList.remove('hidden');
      teacherProblemPreviewDoc.classList.add('hidden');
    } else if (isPdf) {
      teacherProblemPreviewImg.src = '';
      teacherProblemPreviewImg.classList.add('hidden');
      teacherProblemPreviewDoc.classList.remove('hidden');
    } else {
      teacherProblemPreviewImg.src = '';
      teacherProblemPreviewImg.classList.add('hidden');
      teacherProblemPreviewDoc.textContent = '지원되지 않는 형식입니다. 이미지 또는 PDF 파일을 선택해 주세요.';
      teacherProblemPreviewDoc.classList.remove('hidden');
    }
  };
  const updatePasteHint = () => {
    if (!problemPasteHint) return;
    if (teacherProblemClipboardFile) {
      problemPasteHint.textContent = `붙여넣은 이미지 사용 중: ${teacherProblemClipboardFile.name}`;
    } else {
      problemPasteHint.textContent = 'PDF/화면에서 캡처 후 이 영역을 클릭하고 Ctrl+V(⌘+V)로 바로 붙여넣기 가능합니다.';
    }
  };
  updatePasteHint();
  problemFileInput?.addEventListener('change', renderProblemFilePreview);
  problemFileInput?.addEventListener('change', () => {
    if (problemFileInput?.files?.[0]) teacherProblemClipboardFile = null;
    updatePasteHint();
  });
  problemPasteZone?.addEventListener('click', () => problemPasteZone.focus());
  problemPasteZone?.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    const imageItem = Array.from(items).find((it) => (it.type || '').startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const blob = imageItem.getAsFile();
    if (!blob) return;
    const ext = (blob.type || 'image/png').includes('png') ? 'png' : 'jpg';
    teacherProblemClipboardFile = new File([blob], `pasted-problem-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
    if (problemFileInput) problemFileInput.value = '';
    updatePasteHint();
    renderProblemFilePreview();
  });
  clearPastedProblemBtn?.addEventListener('click', () => {
    teacherProblemClipboardFile = null;
    if (problemFileInput) problemFileInput.value = '';
    updatePasteHint();
    renderProblemFilePreview();
  });

  byId('newBoardBtn')?.addEventListener('click', async () => {
    const f = teacherProblemClipboardFile || byId('problemFileInput')?.files?.[0];
    try {
      const payload = await uploadProblemFile(f);
      socket?.emit('board:create', {
        className: state.className,
        title: byId('boardTitle').value.trim(),
        problemText: byId('problemText')?.value?.trim() || '',
        aiAnalysisEnabled: Boolean(byId('aiAnalysisEnabled')?.checked),
        ...payload,
        teacherToken: getTeacherToken(),
      });
    } catch (err) {
      alert(err.message || '문제 파일 업로드 실패');
      return;
    }
    teacherProblemClipboardFile = null;
    if (problemFileInput) problemFileInput.value = '';
    updatePasteHint();
    renderProblemFilePreview();
  });
  byId('runAiBtn')?.addEventListener('click', () => {
    socket?.emit('ai:analyze-board', { className: state.className, teacherToken: getTeacherToken() }, (ack = {}) => {
      if (!ack.ok) return alert(ack.message || 'AI 분석 실패');
      if (ack.insufficientForRanking) alert('분석은 완료했지만 제출이 2개 미만이라 후보 추천은 제한됩니다.');
    });
  });
  byId('clearFocusBtn')?.addEventListener('click', () => {
    socket?.emit('focus:clear', { className: state.className, teacherToken: getTeacherToken() });
  });

  byId('focusView')?.addEventListener('click', () => {
    if (!isTeacherAuthorized()) return;
    socket?.emit('focus:clear', { className: state.className, teacherToken: getTeacherToken() });
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isTeacherAuthorized()) return;
    if (byId('focusView')?.classList.contains('hidden')) return;
    socket?.emit('focus:clear', { className: state.className, teacherToken: getTeacherToken() });
  });

  byId('submitFileBtn')?.addEventListener('click', async () => submitFileFromInput('fileInput'));
}

function initManagePage() {
  if (!isTeacherAuthorized()) return go('./teacher-auth.html');
  registerSocket(renderManagePage);
  byId('exportCsvBtn')?.addEventListener('click', exportCsv);
}

if (page === 'role') initRolePage();
if (page === 'teacher-auth') initTeacherAuthPage();
if (page === 'join') initJoinPage();
if (page === 'past-classes') initPastClassesPage();
if (page === 'profile') initProfilePage();
if (page === 'board') initBoardPage();
if (page === 'manage') initManagePage();
  bindSocketStatus('profileStatus', { connecting: '서버 연결 중...', connected: '수업 입장 확인 중...', reconnecting: '재연결 시도 중...', failed: '재연결 실패. join 화면으로 돌아가 주세요.' });
