import { distance } from './utils.js';

const seatCenter = (s) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 });
const rowCol = (seats) => {
  const ys = [...new Set(seats.map((s) => Math.round(s.y / 8) * 8))].sort((a, b) => a - b);
  const xs = [...new Set(seats.map((s) => Math.round(s.x / 8) * 8))].sort((a, b) => a - b);
  return { ys, xs };
};
const rowIndex = (seat, ys) => ys.reduce((best, y, i) => (Math.abs(y - seat.y) < Math.abs(ys[best] - seat.y) ? i : best), 0);
const colIndex = (seat, xs) => xs.reduce((best, x, i) => (Math.abs(x - seat.x) < Math.abs(xs[best] - seat.x) ? i : best), 0);

export const evaluateArrangement = (state, seatMapByNo) => {
  const report = {
    score: 0,
    fixedSatisfied: 0,
    adjacencyConflicts: 0,
    rowConflicts: 0,
    colConflicts: 0,
    frontSatisfied: 0,
    backSatisfied: 0,
    nearTeacherSatisfied: 0,
    conflicts: [],
    unmet: [],
  };
  const seats = state.seats.filter((s) => !s.deleted && s.enabled);
  const { ys, xs } = rowCol(seats);

  const byNo = Object.fromEntries(state.students.map((s) => [s.번호, s]));

  state.students.forEach((st) => {
    const seat = seatMapByNo.get(st.번호);
    if (!seat) return;
    const ri = rowIndex(seat, ys);
    const rNorm = ys.length <= 1 ? 0 : ri / (ys.length - 1);
    const dDesk = distance(seatCenter(seat), seatCenter(state.desk));

    if (st.고정좌석 && st.고정좌석 === seat.id) {
      report.fixedSatisfied += 1;
      report.score += 8;
    }

    if (st.앞자리우선 && rNorm <= 0.4) { report.frontSatisfied += 1; report.score += 4; } else if (st.앞자리우선) { report.score -= 2; report.unmet.push(`${st.번호} 앞자리우선 미충족`); }
    if (st.시력배려 && (rNorm <= 0.35 || dDesk < 220)) { report.frontSatisfied += 1; report.nearTeacherSatisfied += 1; report.score += 6; } else if (st.시력배려) { report.score -= 4; report.unmet.push(`${st.번호} 시력배려 미충족`); }
    if (st.교탁근처우선 && dDesk < 260) { report.nearTeacherSatisfied += 1; report.score += 4; } else if (st.교탁근처우선) { report.score -= 2; }
    if ((st.뒤자리우선 || st.키큼) && rNorm >= 0.55) { report.backSatisfied += 1; report.score += 4; } else if (st.뒤자리우선 || st.키큼) { report.score -= 2; }

    const checkList = [
      ['인접금지', 'adjacencyConflicts', -12],
      ['같은줄금지', 'rowConflicts', -8],
      ['같은열금지', 'colConflicts', -8],
    ];
    checkList.forEach(([k, metric, penalty]) => {
      st[k].forEach((ref) => {
        const refSeat = seatMapByNo.get(ref);
        if (!refSeat) return;
        const dr = Math.abs(rowIndex(seat, ys) - rowIndex(refSeat, ys));
        const dc = Math.abs(colIndex(seat, xs) - colIndex(refSeat, xs));
        let violated = false;
        if (k === '인접금지') violated = dr <= 1 && dc <= 1;
        if (k === '같은줄금지') violated = dr === 0;
        if (k === '같은열금지') violated = dc === 0;
        if (violated) {
          report[metric] += 1;
          report.score += penalty;
          report.conflicts.push(`${st.번호}-${ref} ${k}`);
        }
      });
    });

    st.분리대상.forEach((ref) => {
      const refSeat = seatMapByNo.get(ref);
      if (!refSeat) return;
      const d = distance(seatCenter(seat), seatCenter(refSeat));
      if (d < 220) {
        report.score -= 5;
        report.conflicts.push(`${st.번호}-${ref} 분리거리 부족`);
      } else {
        report.score += 2;
      }
    });
  });

  report.score = Math.round(report.score);
  return report;
};
