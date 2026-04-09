import { clamp } from './utils.js';
import { MODES, createSeat, getSeat, markDirty } from './state.js';

export const boardToWorld = (state, boardEl, clientX, clientY) => {
  const rect = boardEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / state.zoom,
    y: (clientY - rect.top) / state.zoom,
  };
};

const snap = (state, v) => (state.snap.enabled ? Math.round(v / state.snap.grid) * state.snap.grid : v);

export const addSeatAt = (state, x, y) => {
  const seat = createSeat(snap(state, x), snap(state, y));
  state.seats.push(seat);
  state.selectedSeatId = seat.id;
  markDirty(state);
};

export const deleteSeat = (state, seatId) => {
  const seat = getSeat(state, seatId);
  if (!seat) return;
  seat.deleted = true;
  seat.studentNo = null;
  if (state.selectedSeatId === seatId) state.selectedSeatId = null;
  markDirty(state);
};

export const toggleDisableSeat = (state, seatId) => {
  const seat = getSeat(state, seatId);
  if (!seat) return;
  seat.enabled = !seat.enabled;
  if (!seat.enabled) seat.studentNo = null;
  markDirty(state);
};

export const hitTestSeat = (state, x, y) => state.seats.find((s) => !s.deleted
  && x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) || null;

export const startDrag = (state, itemType, id, pointer) => {
  if (state.mode === MODES.DELETE || state.mode === MODES.DISABLE) return;
  state.drag = { itemType, id, start: pointer };
};

export const moveDrag = (state, pointer) => {
  if (!state.drag) return;
  const d = state.drag;
  if (d.itemType === 'seat') {
    const seat = getSeat(state, d.id);
    if (!seat) return;
    const dx = pointer.x - d.start.x;
    const dy = pointer.y - d.start.y;
    seat.x = clamp(snap(state, seat.x + dx), 0, state.board.width - seat.width);
    seat.y = clamp(snap(state, seat.y + dy), 0, state.board.height - seat.height);
    d.start = pointer;
  } else if (d.itemType === 'desk') {
    const dx = pointer.x - d.start.x;
    const dy = pointer.y - d.start.y;
    state.desk.x = clamp(snap(state, state.desk.x + dx), 0, state.board.width - state.desk.width);
    state.desk.y = clamp(snap(state, state.desk.y + dy), 0, state.board.height - state.desk.height);
    d.start = pointer;
  }
  markDirty(state);
};

export const endDrag = (state) => { state.drag = null; };

export const handleSeatClick = (state, seatId) => {
  const seat = getSeat(state, seatId);
  if (!seat) return;

  if (state.mode === MODES.DELETE) return deleteSeat(state, seatId);
  if (state.mode === MODES.DISABLE) return toggleDisableSeat(state, seatId);

  state.selectedSeatId = seatId;
  if (state.mode === MODES.SWAP) {
    if (!state.swapSeatId) {
      state.swapSeatId = seatId;
      return;
    }
    if (state.swapSeatId === seatId) {
      state.swapSeatId = null;
      return;
    }
    const a = getSeat(state, state.swapSeatId);
    const b = seat;
    [a.studentNo, b.studentNo] = [b.studentNo, a.studentNo];
    state.swapSeatId = null;
    markDirty(state);
  }
};

export const detectOverlapWarnings = (state) => {
  const warnings = [];
  const seats = state.seats.filter((s) => !s.deleted);
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const a = seats[i];
      const b = seats[j];
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (overlapX * overlapY > 1200) warnings.push(`좌석 겹침 경고: ${a.id} / ${b.id}`);
    }
  }
  return warnings;
};
