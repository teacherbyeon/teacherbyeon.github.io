import { shuffle } from './utils.js';
import { seatByNo, usableSeats, markDirty } from './state.js';
import { evaluateArrangement } from './scoring.js';

const emptyUsableSeats = (state) => usableSeats(state).filter((s) => !s.studentNo);

export const assignRandom = (state) => {
  const assigned = new Set(state.seats.map((s) => s.studentNo).filter(Boolean));
  const pool = shuffle(state.students.filter((s) => !assigned.has(s.번호)).slice());
  pool.forEach((st) => {
    const empties = emptyUsableSeats(state);
    if (!empties.length) return;
    empties[Math.floor(Math.random() * empties.length)].studentNo = st.번호;
  });
  markDirty(state);
};

export const assignExam = (state) => {
  const sortedStudents = state.students.slice().sort((a, b) => a.번호.localeCompare(b.번호, 'ko', { numeric: true }));
  const seats = usableSeats(state).slice().sort((a, b) => a.x - b.x || a.y - b.y);
  state.seats.forEach((s) => { s.studentNo = null; });
  for (let i = 0; i < Math.min(sortedStudents.length, seats.length); i += 1) seats[i].studentNo = sortedStudents[i].번호;
  markDirty(state);
};

const candidateScore = (state, st, seat, seatMap) => {
  let score = 0;
  const ys = [...new Set(usableSeats(state).map((s) => s.y))].sort((a, b) => a - b);
  const row = ys.reduce((best, y, i) => (Math.abs(seat.y - y) < Math.abs(seat.y - ys[best]) ? i : best), 0);
  const rNorm = ys.length <= 1 ? 0 : row / (ys.length - 1);
  const dDesk = Math.hypot((seat.x - state.desk.x), (seat.y - state.desk.y));

  if (st.앞자리우선) score += (1 - rNorm) * 8;
  if (st.시력배려) score += (1 - rNorm) * 10 + (dDesk < 260 ? 8 : 0);
  if (st.교탁근처우선) score += dDesk < 260 ? 8 : 0;
  if (st.뒤자리우선 || st.키큼) score += rNorm * 8;

  const compare = (targetNo) => seatMap.get(targetNo);
  st.인접금지.forEach((no) => {
    const t = compare(no); if (!t) return;
    const near = Math.abs(t.x - seat.x) <= seat.width + 8 && Math.abs(t.y - seat.y) <= seat.height + 8;
    if (near) score -= 100;
  });
  st.같은줄금지.forEach((no) => {
    const t = compare(no); if (!t) return;
    if (Math.abs(t.y - seat.y) < seat.height * 0.45) score -= 90;
  });
  st.같은열금지.forEach((no) => {
    const t = compare(no); if (!t) return;
    if (Math.abs(t.x - seat.x) < seat.width * 0.45) score -= 90;
  });
  st.분리대상.forEach((no) => {
    const t = compare(no); if (!t) return;
    const d = Math.hypot(t.x - seat.x, t.y - seat.y);
    score += Math.min(8, d / 40);
  });

  return score + Math.random() * 0.1;
};

export const assignSmart = (state, tries = 200) => {
  const usable = usableSeats(state);
  if (!usable.length) return null;

  let best = null;

  for (let t = 0; t < tries; t += 1) {
    const seatAssignments = new Map();
    const usedSeat = new Set();
    const seatMap = new Map();
    const order = state.students.slice().sort((a, b) => {
      const wa = (a.고정좌석 ? 100 : 0) + a.인접금지.length + a.같은줄금지.length + a.같은열금지.length + a.분리대상.length;
      const wb = (b.고정좌석 ? 100 : 0) + b.인접금지.length + b.같은줄금지.length + b.같은열금지.length + b.분리대상.length;
      return wb - wa || Math.random() - 0.5;
    });

    let impossible = false;
    for (const st of order) {
      let chosen = null;
      if (st.고정좌석) {
        const fixed = usable.find((s) => s.id === st.고정좌석);
        if (!fixed || usedSeat.has(fixed.id)) {
          impossible = true;
          break;
        }
        chosen = fixed;
      } else {
        const candidates = shuffle(usable.filter((s) => !usedSeat.has(s.id)).slice())
          .map((seat) => ({ seat, score: candidateScore(state, st, seat, seatMap) }))
          .sort((a, b) => b.score - a.score);
        chosen = candidates[0]?.seat || null;
      }
      if (!chosen) { impossible = true; break; }
      usedSeat.add(chosen.id);
      seatAssignments.set(st.번호, chosen.id);
      seatMap.set(st.번호, chosen);
    }
    if (impossible) continue;
    const report = evaluateArrangement(state, seatMap);
    if (!best || report.score > best.report.score) best = { seatAssignments, report };
  }

  if (!best) return null;
  state.seats.forEach((s) => { s.studentNo = null; });
  best.seatAssignments.forEach((seatId, no) => {
    const seat = state.seats.find((s) => s.id === seatId);
    if (seat) seat.studentNo = no;
  });
  state.assignmentReport = best.report;
  markDirty(state);
  return best.report;
};

export const assignStudentToSeat = (state, studentNo, seatId) => {
  const seat = state.seats.find((s) => s.id === seatId && !s.deleted && s.enabled);
  if (!seat) return;
  const prev = seatByNo(state, studentNo);
  if (prev) prev.studentNo = null;
  if (!seat.studentNo) {
    seat.studentNo = studentNo;
  } else if (state.settings.swapBehavior === 'move') {
    if (prev) prev.studentNo = seat.studentNo;
    seat.studentNo = studentNo;
  } else {
    const a = seat.studentNo;
    seat.studentNo = studentNo;
    if (prev) prev.studentNo = a;
  }
  state.selectedStudentNo = null;
  markDirty(state);
};
