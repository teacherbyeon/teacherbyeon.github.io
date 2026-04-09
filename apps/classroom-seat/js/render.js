import { esc } from './utils.js';
import { MODES, activeSeats } from './state.js';

export const renderAll = (state, dom) => {
  renderBoard(state, dom);
  renderStudents(state, dom);
  renderMode(state, dom);
  renderMessages(state, dom);
  renderSeatEditor(state, dom);
  renderReport(state, dom);
  dom.unsaved.textContent = state.dirty ? '● 저장되지 않은 변경사항 있음' : '저장됨';
};

export const renderBoard = (state, dom) => {
  dom.boardInner.style.width = `${state.board.width}px`;
  dom.boardInner.style.height = `${state.board.height}px`;
  dom.boardInner.style.transform = `scale(${state.zoom})`;
  dom.boardInner.style.transformOrigin = 'top left';

  const desk = dom.boardInner.querySelector('.desk');
  desk.style.left = `${state.desk.x}px`;
  desk.style.top = `${state.desk.y}px`;
  desk.style.width = `${state.desk.width}px`;
  desk.style.height = `${state.desk.height}px`;
  desk.textContent = state.desk.label;

  dom.seatLayer.innerHTML = '';
  activeSeats(state).forEach((s) => {
    const el = document.createElement('div');
    const st = state.students.find((x) => x.번호 === s.studentNo);
    el.className = `seat ${s.enabled ? '' : 'disabled'} ${state.selectedSeatId === s.id ? 'selected' : ''} ${state.swapSeatId === s.id ? 'swap-pick' : ''}`;
    el.dataset.sid = s.id;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    el.style.width = `${s.width}px`;
    el.style.height = `${s.height}px`;
    const zone = s.zone ? `<div class="zone">${esc(s.zone)}</div>` : '';
    if (!s.enabled) el.innerHTML = `${zone}<div class="seat-label">X</div>`;
    else if (!st) el.innerHTML = `${zone}<div class="seat-label">${esc(s.label || '빈자리')}</div>`;
    else el.innerHTML = `${zone}<div class="seat-label">${esc(st.번호)}<br>${esc(st.이름)}</div>`;
    dom.seatLayer.appendChild(el);
  });
};

export const renderStudents = (state, dom) => {
  const keyword = dom.studentSearch.value.trim();
  const assignedNos = new Set(state.seats.map((s) => s.studentNo).filter(Boolean));
  const rows = state.students.filter((s) => {
    if (assignedNos.has(s.번호)) return false;
    if (!keyword) return true;
    return `${s.번호} ${s.이름}`.includes(keyword);
  });
  dom.studentList.innerHTML = rows.map((s) => `<button class="student-item ${state.selectedStudentNo === s.번호 ? 'selected' : ''}" data-no="${esc(s.번호)}">
      <span>${esc(s.번호)} ${esc(s.이름)}</span><small>${s.성별 === 'M' ? '남' : s.성별 === 'F' ? '여' : '미상'}</small>
    </button>`).join('');
  dom.stats.textContent = `전체 ${state.students.length}명 / 미배정 ${rows.length}명 / 좌석 ${state.seats.filter((s) => !s.deleted && s.enabled).length}개`;
};

export const renderMode = (state, dom) => {
  dom.modeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === state.mode));
};

export const renderMessages = (state, dom) => {
  const lines = [];
  if (state.messages.info) lines.push(`ℹ️ ${state.messages.info}`);
  state.messages.errors.forEach((e) => lines.push(`❌ ${e}`));
  state.messages.warnings.forEach((w) => lines.push(`⚠️ ${w}`));
  dom.status.textContent = lines.join('\n') || '준비 완료';
};

export const renderSeatEditor = (state, dom) => {
  const seat = state.seats.find((s) => s.id === state.selectedSeatId && !s.deleted);
  dom.seatForm.style.display = seat ? 'grid' : 'none';
  dom.noSeatSelected.style.display = seat ? 'none' : 'block';
  if (!seat) return;
  dom.seatId.textContent = seat.id;
  dom.seatLabel.value = seat.label || '';
  dom.seatZone.value = seat.zone || '';
  dom.seatEnabled.checked = seat.enabled;
  dom.seatWidth.value = seat.width;
  dom.seatHeight.value = seat.height;
};

export const renderReport = (state, dom) => {
  const r = state.assignmentReport;
  if (!r) {
    dom.report.innerHTML = '<div class="muted">스마트 배정 후 결과가 여기에 표시됩니다.</div>';
    return;
  }
  dom.report.innerHTML = `
    <div><b>전체 점수:</b> ${r.score}점</div>
    <div>고정좌석 충족: ${r.fixedSatisfied}명</div>
    <div>인접금지 충돌: ${r.adjacencyConflicts}건</div>
    <div>같은줄금지 충돌: ${r.rowConflicts}건</div>
    <div>같은열금지 충돌: ${r.colConflicts}건</div>
    <div>앞자리/시력 우선 충족: ${r.frontSatisfied}명</div>
    <div>교탁근처 선호 충족: ${r.nearTeacherSatisfied}명</div>
    <div>뒤자리(키큼 포함) 충족: ${r.backSatisfied}명</div>
    <details><summary>충돌 목록</summary><pre>${esc(r.conflicts.join('\n') || '없음')}</pre></details>
    <details><summary>미충족 목록</summary><pre>${esc(r.unmet.join('\n') || '없음')}</pre></details>
  `;
};

export const applyModeHint = (state, dom) => {
  const hints = {
    [MODES.SELECT]: '선택 모드: 좌석 선택/드래그',
    [MODES.ADD]: '좌석 추가 모드: 보드 빈 공간 클릭',
    [MODES.DELETE]: '좌석 삭제 모드: 좌석 클릭 시 완전 삭제',
    [MODES.DISABLE]: '좌석 비활성화 모드: 클릭 시 사용불가(X) 토글',
    [MODES.ASSIGN]: '학생 배정 모드: 학생 선택 후 좌석 클릭',
    [MODES.SWAP]: 'SWAP 모드: 좌석 2개를 순서대로 클릭',
  };
  state.messages.info = hints[state.mode];
};
