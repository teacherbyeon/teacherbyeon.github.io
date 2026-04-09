import { downloadText } from './utils.js';
import { defaultState, MODES, generateGridSeats, getSeat, markDirty, clearAssignments } from './state.js';
import { parseRows, validateStudents } from './students.js';
import { addSeatAt, boardToWorld, deleteSeat, detectOverlapWarnings, endDrag, handleSeatClick, hitTestSeat, moveDrag, startDrag, toggleDisableSeat } from './seats.js';
import { assignExam, assignRandom, assignSmart, assignStudentToSeat } from './assign.js';
import { applyModeHint, renderAll } from './render.js';
import { printLayout } from './print.js';

const state = defaultState();
const $ = (id) => document.getElementById(id);
const dom = {
  board: $('board'),
  boardInner: $('boardInner'),
  seatLayer: $('seatLayer'),
  desk: $('desk'),
  modeButtons: [...document.querySelectorAll('[data-mode]')],
  studentFile: $('studentFile'),
  saveFile: $('saveFile'),
  loadJson: $('loadJson'),
  studentList: $('studentList'),
  studentSearch: $('studentSearch'),
  status: $('status'),
  stats: $('stats'),
  report: $('report'),
  unsaved: $('unsavedMark'),
  seatForm: $('seatForm'),
  noSeatSelected: $('noSeatSelected'),
  seatId: $('seatId'),
  seatLabel: $('seatLabel'),
  seatZone: $('seatZone'),
  seatEnabled: $('seatEnabled'),
  seatWidth: $('seatWidth'),
  seatHeight: $('seatHeight'),
  snapOn: $('snapOn'),
  snapGrid: $('snapGrid'),
  zoom: $('zoom'),
  zoomLabel: $('zoomLabel'),
  swapBehavior: $('swapBehavior'),
  tries: $('smartTries'),
  printTitle: $('printTitle'),
  printFooter: $('printFooter'),
  printFooterSub1: $('printFooterSub1'),
  printFooterSub2: $('printFooterSub2'),
};

const syncSettingsFromInputs = () => {
  state.snap.enabled = dom.snapOn.checked;
  state.snap.grid = Number(dom.snapGrid.value) || 16;
  state.zoom = Number(dom.zoom.value) || 1;
  dom.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  state.settings.swapBehavior = dom.swapBehavior.value;
  state.settings.smartTries = Number(dom.tries.value) || 200;
  state.settings.printTitle = dom.printTitle.value;
  state.settings.printFooter = dom.printFooter.value;
  state.settings.printFooterSub1 = dom.printFooterSub1.value;
  state.settings.printFooterSub2 = dom.printFooterSub2.value;
};

const setMode = (mode) => {
  state.mode = mode;
  state.swapSeatId = null;
  applyModeHint(state, dom);
  renderAll(state, dom);
};

const readStudents = async (file) => {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv') {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
    return parseRows(rows);
  }
  if (ext === 'xlsx') {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
    return parseRows(rows);
  }
  throw new Error('지원 파일: .xlsx, .csv');
};

const saveData = () => ({
  version: 2,
  students: state.students,
  seats: state.seats,
  desk: state.desk,
  board: state.board,
  settings: state.settings,
  selected: { seatId: state.selectedSeatId, studentNo: state.selectedStudentNo },
  assignmentReport: state.assignmentReport,
});

const loadData = (data) => {
  state.students = Array.isArray(data.students) ? data.students : [];
  state.seats = Array.isArray(data.seats) ? data.seats : [];
  if (data.desk) state.desk = data.desk;
  if (data.board) state.board = data.board;
  if (data.settings) state.settings = { ...state.settings, ...data.settings };
  state.assignmentReport = data.assignmentReport || null;
  dom.printTitle.value = state.settings.printTitle;
  dom.printFooter.value = state.settings.printFooter;
  dom.printFooterSub1.value = state.settings.printFooterSub1;
  dom.printFooterSub2.value = state.settings.printFooterSub2;
  state.messages.info = `불러오기 완료 (v${data.version || 1})`;
  state.dirty = false;
  validateStudents(state);
};

$('btnGenGrid').addEventListener('click', () => {
  if (!confirm('기존 좌석 배치/위치는 사라집니다. 다시 생성할까요?')) return;
  generateGridSeats(state, Number($('cols').value), Number($('rows').value));
  validateStudents(state);
  renderAll(state, dom);
});

$('btnRandom').addEventListener('click', () => { assignRandom(state); renderAll(state, dom); });
$('btnExam').addEventListener('click', () => { assignExam(state); renderAll(state, dom); });
$('btnClearAssign').addEventListener('click', () => { clearAssignments(state); renderAll(state, dom); });
$('btnSmart').addEventListener('click', () => {
  syncSettingsFromInputs();
  const vr = validateStudents(state);
  if (vr.errors.length) return renderAll(state, dom);
  const report = assignSmart(state, state.settings.smartTries);
  if (!report) state.messages.errors = ['스마트 배정 실패: 고정좌석/제약 조건 확인 필요'];
  renderAll(state, dom);
});
$('btnAddSeat').addEventListener('click', () => setMode(MODES.ADD));
$('btnPrint').addEventListener('click', () => { syncSettingsFromInputs(); if (!printLayout(state)) alert('팝업 차단 해제 후 재시도'); });
$('btnSave').addEventListener('click', () => downloadText('자리배치_v2.json', JSON.stringify(saveData(), null, 2)));
$('btnLoad').addEventListener('click', () => dom.loadJson.click());

 dom.modeButtons.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

 dom.studentSearch.addEventListener('input', () => renderAll(state, dom));
 dom.studentList.addEventListener('click', (e) => {
  const item = e.target.closest('.student-item');
  if (!item) return;
  state.selectedStudentNo = item.dataset.no;
  renderAll(state, dom);
 });

 dom.studentFile.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    state.students = await readStudents(f);
    state.selectedStudentNo = null;
    validateStudents(state);
    markDirty(state);
  } catch (err) {
    state.messages.errors = [err.message || String(err)];
  }
  renderAll(state, dom);
 });

 dom.loadJson.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const text = await f.text();
  loadData(JSON.parse(text));
  renderAll(state, dom);
 });

 dom.board.addEventListener('pointerdown', (e) => {
  const p = boardToWorld(state, dom.boardInner, e.clientX, e.clientY);
  const seat = hitTestSeat(state, p.x, p.y);
  const deskRect = state.desk;
  const deskHit = p.x >= deskRect.x && p.x <= deskRect.x + deskRect.width && p.y >= deskRect.y && p.y <= deskRect.y + deskRect.height;

  if (state.mode === MODES.ADD && !seat && !deskHit) {
    addSeatAt(state, p.x - 44, p.y - 44);
    renderAll(state, dom);
    return;
  }

  if (deskHit) {
    startDrag(state, 'desk', 'desk', p);
    return;
  }

  if (seat) {
    if (state.mode === MODES.DELETE) deleteSeat(state, seat.id);
    else if (state.mode === MODES.DISABLE) toggleDisableSeat(state, seat.id);
    else if (state.mode === MODES.ASSIGN && state.selectedStudentNo) assignStudentToSeat(state, state.selectedStudentNo, seat.id);
    else handleSeatClick(state, seat.id);
    startDrag(state, 'seat', seat.id, p);
    renderAll(state, dom);
  }
 });

 dom.board.addEventListener('pointermove', (e) => {
  if (!state.drag) return;
  const p = boardToWorld(state, dom.boardInner, e.clientX, e.clientY);
  moveDrag(state, p);
  renderAll(state, dom);
 });
 window.addEventListener('pointerup', () => {
  endDrag(state);
  state.messages.warnings = [...state.messages.warnings.filter((w) => !w.startsWith('좌석 겹침')), ...detectOverlapWarnings(state)];
  renderAll(state, dom);
 });

 [dom.seatLabel, dom.seatZone, dom.seatEnabled, dom.seatWidth, dom.seatHeight].forEach((el) => el.addEventListener('input', () => {
  const s = getSeat(state, state.selectedSeatId);
  if (!s) return;
  s.label = dom.seatLabel.value;
  s.zone = dom.seatZone.value;
  s.enabled = dom.seatEnabled.checked;
  s.width = Math.max(40, Number(dom.seatWidth.value) || s.width);
  s.height = Math.max(40, Number(dom.seatHeight.value) || s.height);
  markDirty(state);
  renderAll(state, dom);
 }));

 [dom.snapOn, dom.snapGrid, dom.zoom, dom.swapBehavior, dom.tries, dom.printTitle, dom.printFooter, dom.printFooterSub1, dom.printFooterSub2]
  .forEach((el) => el.addEventListener('input', () => { syncSettingsFromInputs(); markDirty(state); renderAll(state, dom); }));

 generateGridSeats(state, 6, 4);
 syncSettingsFromInputs();
 applyModeHint(state, dom);
 renderAll(state, dom);
