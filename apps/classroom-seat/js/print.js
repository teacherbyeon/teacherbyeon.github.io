import { esc } from './utils.js';

const mm = (px) => Number((px * 0.22).toFixed(2));

export const buildPrintHtml = (state) => {
  const title = state.settings.printTitle || '자리 배치표';
  const seats = state.seats.filter((s) => !s.deleted);
  const seatBlocks = seats.map((s) => {
    const st = state.students.find((x) => x.번호 === s.studentNo);
    const txt = !s.enabled ? 'X' : st ? `${esc(st.번호)}<br>${esc(st.이름)}` : esc(s.label || '');
    return `<div class="p-seat ${s.enabled ? '' : 'disabled'}" style="left:${mm(s.x)}mm;top:${mm(s.y)}mm;width:${mm(s.width)}mm;height:${mm(s.height)}mm;">${txt}</div>`;
  }).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
  @page { size:A4 landscape; margin:8mm; }
  body{font-family:system-ui,sans-serif;margin:0;color:#111}
  .title{text-align:center;font-weight:800;font-size:18px;margin:0 0 4mm}
  .paper{border:1px solid #666; height:185mm; position:relative; overflow:hidden}
  .board{position:absolute; left:4mm; top:6mm; width:205mm; height:172mm; border:1px solid #aaa; background:#f7f7f7}
  .desk{position:absolute;background:#e2d4ad;border:1px solid #555;display:flex;align-items:center;justify-content:center;font-weight:700}
  .p-seat{position:absolute;border:1px solid #444;border-radius:2mm;background:#fff;font-size:9pt;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.15}
  .p-seat.disabled{background:#ddd;font-size:18pt}
  .meta{position:absolute; right:4mm; top:6mm; width:70mm; border:1px solid #aaa; padding:2mm; font-size:9pt}
  .meta h3{margin:0 0 2mm;font-size:10pt}
  </style></head><body>
  <h1 class="title">${esc(title)}</h1>
  <div class="paper">
    <div class="board">
      <div class="desk" style="left:${mm(state.desk.x)}mm;top:${mm(state.desk.y)}mm;width:${mm(state.desk.width)}mm;height:${mm(state.desk.height)}mm;">${esc(state.desk.label)}</div>
      ${seatBlocks}
    </div>
    <div class="meta">
      <h3>메모</h3>
      <p>${esc(state.settings.printFooter || '')}</p>
      <p>${esc(state.settings.printFooterSub1 || '')}</p>
      <p>${esc(state.settings.printFooterSub2 || '')}</p>
    </div>
  </div></body></html>`;
};

export const printLayout = (state) => {
  const w = window.open('', 'print_layout', 'width=1280,height=900');
  if (!w) return false;
  w.document.write(buildPrintHtml(state));
  w.document.close();
  setTimeout(() => w.print(), 280);
  return true;
};
