import { uid } from './utils.js';

export const MODES = {
  SELECT: 'select',
  ADD: 'add-seat',
  DELETE: 'delete-seat',
  DISABLE: 'disable-seat',
  ASSIGN: 'assign',
  SWAP: 'swap',
};

export const defaultState = () => ({
  version: 2,
  dirty: false,
  mode: MODES.SELECT,
  selectedSeatId: null,
  selectedStudentNo: null,
  swapSeatId: null,
  drag: null,
  snap: { enabled: true, grid: 16 },
  zoom: 1,
  board: { width: 1400, height: 900 },
  desk: { id: 'desk', x: 480, y: 40, width: 360, height: 52, label: '교탁' },
  settings: {
    swapBehavior: 'swap',
    smartTries: 200,
    printTitle: '자리 배치표',
    printFooter: '교과 선생님 항상 감사드립니다!',
    printFooterSub1: '수업시간에 행복한 배움이 이어지길 바랍니다.',
    printFooterSub2: '급훈 : 예의, 신뢰, 존중',
  },
  students: [],
  seats: [],
  assignmentReport: null,
  messages: { errors: [], warnings: [], info: '' },
});

export const createSeat = (x = 100, y = 140) => ({
  id: uid('S'),
  x,
  y,
  width: 88,
  height: 88,
  enabled: true,
  deleted: false,
  label: '',
  zone: '',
  studentNo: null,
});

export const markDirty = (state, v = true) => { state.dirty = v; };

export const getSeat = (state, seatId) => state.seats.find((s) => s.id === seatId && !s.deleted) || null;

export const activeSeats = (state) => state.seats.filter((s) => !s.deleted);

export const usableSeats = (state) => state.seats.filter((s) => !s.deleted && s.enabled);

export const seatByNo = (state, no) => state.seats.find((s) => s.studentNo === no && !s.deleted) || null;

export const clearAssignments = (state) => {
  state.seats.forEach((s) => { s.studentNo = null; });
  state.selectedStudentNo = null;
  state.assignmentReport = null;
  markDirty(state);
};

export const generateGridSeats = (state, cols, rows) => {
  const seatW = 88;
  const seatH = 88;
  const gapX = 18;
  const gapY = 18;
  const startX = 120;
  const startY = 150;
  state.seats = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const seat = createSeat(startX + c * (seatW + gapX), startY + r * (seatH + gapY));
      seat.label = `${r + 1}-${c + 1}`;
      state.seats.push(seat);
    }
  }
  state.selectedSeatId = null;
  state.swapSeatId = null;
  markDirty(state);
};
