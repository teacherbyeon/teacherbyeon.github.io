(function () {
  'use strict';

  var MODE_LABEL = {
    select: '선택 모드',
    add: '좌석 추가 모드',
    delete: '좌석 삭제 모드',
    disable: '좌석 사용불가(X) 모드',
    assign: '학생 배정 모드',
    swap: '자리 바꾸기 모드'
  };

  var state = {
    version: 2,
    dirty: false,
    mode: 'select',
    seats: [],
    students: [],
    selectedSeatId: null,
    selectedStudentNo: null,
    swapSeatId: null,
    drag: null,
    zoom: 1,
    snapOn: true,
    snapGrid: 16,
    assignmentReport: null,
    settings: {
      assignBehavior: 'swap',
      smartTry: 200,
      printTitle: '자리 배치표',
      printFooter: '',
      printFooterSub1: '',
      printFooterSub2: ''
    },
    desk: { id: 'DESK', x: 450, y: 40, width: 340, height: 56, label: '교탁' },
    msg: { errors: [], warnings: [], info: '' }
  };

  var dom = {
    boardWrap: byId('boardWrap'), board: byId('board'), seatLayer: byId('seatLayer'), desk: byId('desk'),
    modeBadge: byId('modeBadge'), unsavedMark: byId('unsavedMark'),
    modeButtons: [].slice.call(document.querySelectorAll('[data-mode]')),
    studentFile: byId('studentFile'), btnLoadPlan: byId('btnLoadPlan'), planFile: byId('planFile'), btnSavePlan: byId('btnSavePlan'),
    btnBuild: byId('btnBuild'), btnAddSeat: byId('btnAddSeat'), btnRandom: byId('btnRandom'), btnSmart: byId('btnSmart'), btnExam: byId('btnExam'), btnPrint: byId('btnPrint'), btnClear: byId('btnClear'),
    rows: byId('rows'), cols: byId('cols'), snapOn: byId('snapOn'), snapGrid: byId('snapGrid'), zoom: byId('zoom'), zoomLabel: byId('zoomLabel'), assignBehavior: byId('assignBehavior'), smartTry: byId('smartTry'),
    printTitle: byId('printTitle'), printFooter: byId('printFooter'), printFooterSub1: byId('printFooterSub1'), printFooterSub2: byId('printFooterSub2'),
    studentSearch: byId('studentSearch'), stats: byId('stats'), studentList: byId('studentList'),
    seatEmpty: byId('seatEmpty'), seatEditor: byId('seatEditor'), seatId: byId('seatId'), seatLabel: byId('seatLabel'), seatZone: byId('seatZone'), seatEnabled: byId('seatEnabled'), seatWidth: byId('seatWidth'), seatHeight: byId('seatHeight'),
    report: byId('report'), status: byId('status')
  };

  function byId(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]; }); }
  function uid() { return 'S' + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-4); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function asBool(v) { var t = String(v == null ? '' : v).trim().toLowerCase(); return ['1', 'y', 'yes', 'true', 't', 'on', '예', '네'].indexOf(t) >= 0; }
  function normalizeNo(v) {
    var raw = String(v == null ? '' : v).trim();
    if (!raw) return '';
    var n = Number(raw);
    if (Number.isFinite(n) && /^-?\d+(\.0+)?$/.test(raw)) return String(Math.trunc(n));
    return raw;
  }
  function normalizeGender(v) {
    var t = String(v == null ? '' : v).trim().toLowerCase();
    if (['남', '남자', 'm', 'male'].indexOf(t) >= 0) return 'M';
    if (['여', '여자', 'f', 'female'].indexOf(t) >= 0) return 'F';
    return 'U';
  }
  function parseRefList(v) {
    return String(v == null ? '' : v).split(/[;,/|\s]+/).map(normalizeNo).filter(Boolean);
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function createSeat(x, y) {
    return { id: uid(), x: x, y: y, width: 88, height: 88, enabled: true, deleted: false, label: '', zone: '', studentNo: null };
  }

  function markDirty(v) { state.dirty = v !== false; refreshDirty(); }
  function refreshDirty() { dom.unsavedMark.textContent = state.dirty ? '● 저장되지 않은 변경사항 있음' : '저장됨'; }

  function setMode(mode) {
    state.mode = mode;
    state.msg.info = MODE_LABEL[mode] + '입니다.';
    state.swapSeatId = null;
    dom.modeBadge.textContent = '현재 모드: ' + MODE_LABEL[mode];
    dom.modeButtons.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === mode); });
    render();
  }

  function syncOptions() {
    state.snapOn = dom.snapOn.checked;
    state.snapGrid = Number(dom.snapGrid.value) || 16;
    state.zoom = Number(dom.zoom.value) || 1;
    dom.zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    state.settings.assignBehavior = dom.assignBehavior.value;
    state.settings.smartTry = Number(dom.smartTry.value) || 200;
    state.settings.printTitle = dom.printTitle.value;
    state.settings.printFooter = dom.printFooter.value;
    state.settings.printFooterSub1 = dom.printFooterSub1.value;
    state.settings.printFooterSub2 = dom.printFooterSub2.value;
    dom.board.style.transform = 'scale(' + state.zoom + ')';
  }

  function snap(v) { return state.snapOn ? Math.round(v / state.snapGrid) * state.snapGrid : v; }
  function boardPoint(ev) {
    var rect = dom.board.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) / state.zoom, y: (ev.clientY - rect.top) / state.zoom };
  }

  function activeSeats() { return state.seats.filter(function (s) { return !s.deleted; }); }
  function usableSeats() { return state.seats.filter(function (s) { return !s.deleted && s.enabled; }); }
  function seatById(id) { return state.seats.find(function (s) { return s.id === id && !s.deleted; }) || null; }
  function seatByNo(no) { return state.seats.find(function (s) { return s.studentNo === no && !s.deleted; }) || null; }

  function generateGrid(cols, rows) {
    state.seats = [];
    var sx = 120, sy = 150, w = 88, h = 88, gx = 18, gy = 18;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var seat = createSeat(sx + c * (w + gx), sy + r * (h + gy));
        seat.label = (r + 1) + '-' + (c + 1);
        state.seats.push(seat);
      }
    }
    state.selectedSeatId = null;
    state.selectedStudentNo = null;
    state.swapSeatId = null;
    state.assignmentReport = null;
    markDirty();
  }

  function hitSeat(x, y) {
    return state.seats.find(function (s) {
      return !s.deleted && x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height;
    }) || null;
  }

  function deskHit(x, y) {
    var d = state.desk;
    return x >= d.x && x <= d.x + d.width && y >= d.y && y <= d.y + d.height;
  }

  function detectSeatOverlapWarnings() {
    var ws = [];
    var list = activeSeats();
    for (var i = 0; i < list.length; i += 1) {
      for (var j = i + 1; j < list.length; j += 1) {
        var a = list[i], b = list[j];
        var ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        var oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        if (ox * oy > 1200) ws.push('좌석 겹침 경고: ' + a.id + ' / ' + b.id);
      }
    }
    return ws;
  }

  function parseRows(rows) {
    var alias = {
      '번호': '번호', 'no': '번호', '학번': '번호',
      '이름': '이름', 'name': '이름',
      '성별': '성별', 'gender': '성별', '고정좌석': '고정좌석', 'fixedseat': '고정좌석',
      '앞자리우선': '앞자리우선', '뒤자리우선': '뒤자리우선', '교탁근처우선': '교탁근처우선',
      '시력배려': '시력배려', '키큼': '키큼', '분리대상': '분리대상', '같은줄금지': '같은줄금지',
      '같은열금지': '같은열금지', '인접금지': '인접금지', '메모': '메모'
    };
    function normHeader(v) {
      return String(v == null ? '' : v)
        .replace(/\uFEFF/g, '')
        .replace(/\u00A0/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
    }

    var headerRowIndex = -1;
    var headers = [];
    for (var r = 0; r < Math.min(rows.length, 15); r += 1) {
      var candidate = (rows[r] || []).map(function (h) { return alias[normHeader(h)] || String(h == null ? '' : h).trim(); });
      if (candidate.indexOf('번호') >= 0 && candidate.indexOf('이름') >= 0) {
        headers = candidate;
        headerRowIndex = r;
        break;
      }
    }
    if (headerRowIndex < 0) throw new Error('오류: 헤더에 "번호", "이름"이 반드시 있어야 합니다.');

    function idx(name) { return headers.indexOf(name); }

    return rows.slice(headerRowIndex + 1).map(function (r) {
      return {
        번호: normalizeNo(r[idx('번호')]),
        이름: String(r[idx('이름')] == null ? '' : r[idx('이름')]).trim(),
        성별: normalizeGender(idx('성별') >= 0 ? r[idx('성별')] : ''),
        고정좌석: idx('고정좌석') >= 0 ? String(r[idx('고정좌석')] == null ? '' : r[idx('고정좌석')]).trim() || null : null,
        앞자리우선: asBool(idx('앞자리우선') >= 0 ? r[idx('앞자리우선')] : ''),
        뒤자리우선: asBool(idx('뒤자리우선') >= 0 ? r[idx('뒤자리우선')] : ''),
        교탁근처우선: asBool(idx('교탁근처우선') >= 0 ? r[idx('교탁근처우선')] : ''),
        시력배려: asBool(idx('시력배려') >= 0 ? r[idx('시력배려')] : ''),
        키큼: asBool(idx('키큼') >= 0 ? r[idx('키큼')] : ''),
        분리대상: parseRefList(idx('분리대상') >= 0 ? r[idx('분리대상')] : ''),
        같은줄금지: parseRefList(idx('같은줄금지') >= 0 ? r[idx('같은줄금지')] : ''),
        같은열금지: parseRefList(idx('같은열금지') >= 0 ? r[idx('같은열금지')] : ''),
        인접금지: parseRefList(idx('인접금지') >= 0 ? r[idx('인접금지')] : ''),
        메모: String(idx('메모') >= 0 ? (r[idx('메모')] == null ? '' : r[idx('메모')]) : '').trim()
      };
    }).filter(function (s) { return s.번호 || s.이름; });
  }

  function readStudentFile(file) {
    var ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'csv') {
      return file.text().then(function (text) {
        var rows = parseCsvRows(text);
        return parseRows(rows);
      });
    }
    if (ext === 'xlsx') {
      if (typeof XLSX === 'undefined' || !XLSX.read) {
        throw new Error('xlsx.full.min.js 라이브러리 로드에 실패했습니다. 프로그램 폴더에 실제 xlsx.full.min.js 파일이 있는지 확인하세요.');
      }
      return file.arrayBuffer().then(function (buf) {
        try {
          var wb = XLSX.read(buf, { type: 'array' });
          var sheetName = wb.SheetNames.find(function (name) {
            var ws = wb.Sheets[name];
            var ref = ws && ws['!ref'];
            return !!ref;
          }) || wb.SheetNames[0];
          var sheet = wb.Sheets[sheetName];
          var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
          return parseRows(rows);
        } catch (e) {
          var msg = String((e && e.message) || e || '');
          if (/Unknown Namespace|Unsupported|corrupt|encrypted|password/i.test(msg)) {
            throw new Error('엑셀 파일을 읽지 못했습니다. 파일 형식(.xlsx) 확인 후 다시 시도하거나, CSV로 저장해서 불러오세요.');
          }
          throw new Error('엑셀 파일 읽기 실패: ' + (msg || '알 수 없는 오류'));
        }
      });
    }
    throw new Error('지원 파일 형식: .xlsx, .csv');
  }

  function parseCsvRows(text) {
    var rows = [];
    var row = [];
    var cur = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i += 1) {
      var ch = text[i];
      var next = text[i + 1];
      if (ch === '\"') {
        if (inQuotes && next === '\"') { cur += '\"'; i += 1; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        row.push(cur); cur = '';
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && next === '\n') i += 1;
        row.push(cur); cur = '';
        if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
        row = [];
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
    return rows;
  }

  function validateStudents() {
    var errors = [], warnings = [];
    var seen = new Set();
    var allNos = new Set(state.students.map(function (s) { return s.번호; }));

    state.students.forEach(function (s, i) {
      if (!s.번호) errors.push('행 ' + (i + 2) + ': 번호 없음');
      if (!s.이름) errors.push('행 ' + (i + 2) + ': 이름 없음');
      if (s.번호 && seen.has(s.번호)) errors.push('번호 중복: ' + s.번호);
      seen.add(s.번호);

      if (s.고정좌석) {
        var seat = seatById(s.고정좌석);
        if (!seat) errors.push(s.번호 + ' ' + s.이름 + ': 고정좌석(' + s.고정좌석 + ')이 없습니다.');
      }

      ['분리대상', '같은줄금지', '같은열금지', '인접금지'].forEach(function (k) {
        s[k].forEach(function (ref) {
          if (!allNos.has(ref)) warnings.push(s.번호 + ': ' + k + ' 참조(' + ref + ') 학생이 없습니다.');
        });
      });
    });

    if (state.students.length > usableSeats().length) {
      errors.push('학생 수(' + state.students.length + ')가 사용 가능한 좌석 수(' + usableSeats().length + ')보다 많습니다.');
    }

    state.msg.errors = errors;
    state.msg.warnings = warnings;
    return { errors: errors, warnings: warnings };
  }

  function assignRandom() {
    var assigned = new Set(state.seats.map(function (s) { return s.studentNo; }).filter(Boolean));
    var pool = shuffle(state.students.filter(function (s) { return !assigned.has(s.번호); }).slice());
    pool.forEach(function (st) {
      var empties = usableSeats().filter(function (s) { return !s.studentNo; });
      if (!empties.length) return;
      empties[Math.floor(Math.random() * empties.length)].studentNo = st.번호;
    });
    markDirty();
  }

  function assignExam() {
    var sorted = state.students.slice().sort(function (a, b) { return a.번호.localeCompare(b.번호, 'ko', { numeric: true }); });
    var seats = usableSeats().slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    state.seats.forEach(function (s) { s.studentNo = null; });
    for (var i = 0; i < Math.min(sorted.length, seats.length); i += 1) seats[i].studentNo = sorted[i].번호;
    markDirty();
  }

  function seatRankInfo() {
    var seats = usableSeats();
    var ys = Array.from(new Set(seats.map(function (s) { return Math.round(s.y / 8) * 8; }))).sort(function (a, b) { return a - b; });
    var xs = Array.from(new Set(seats.map(function (s) { return Math.round(s.x / 8) * 8; }))).sort(function (a, b) { return a - b; });
    return { ys: ys, xs: xs };
  }

  function nearestIndex(val, arr) {
    var best = 0;
    for (var i = 1; i < arr.length; i += 1) if (Math.abs(arr[i] - val) < Math.abs(arr[best] - val)) best = i;
    return best;
  }

  function evalArrangement(seatMapByNo) {
    var info = seatRankInfo();
    var r = { score: 0, fixedSatisfied: 0, adjacencyConflicts: 0, rowConflicts: 0, colConflicts: 0, frontSatisfied: 0, backSatisfied: 0, nearTeacherSatisfied: 0, conflicts: [], unmet: [] };

    state.students.forEach(function (st) {
      var seat = seatMapByNo.get(st.번호); if (!seat) return;
      var row = nearestIndex(seat.y, info.ys); var rowNorm = info.ys.length <= 1 ? 0 : row / (info.ys.length - 1);
      var dDesk = Math.hypot((seat.x + seat.width / 2) - (state.desk.x + state.desk.width / 2), (seat.y + seat.height / 2) - (state.desk.y + state.desk.height / 2));

      if (st.고정좌석 && st.고정좌석 === seat.id) { r.fixedSatisfied += 1; r.score += 8; }
      if (st.앞자리우선 && rowNorm <= 0.4) { r.frontSatisfied += 1; r.score += 4; } else if (st.앞자리우선) { r.score -= 2; r.unmet.push(st.번호 + ' 앞자리우선 미충족'); }
      if (st.시력배려 && (rowNorm <= 0.35 || dDesk < 220)) { r.frontSatisfied += 1; r.nearTeacherSatisfied += 1; r.score += 6; } else if (st.시력배려) { r.score -= 4; r.unmet.push(st.번호 + ' 시력배려 미충족'); }
      if (st.교탁근처우선 && dDesk < 260) { r.nearTeacherSatisfied += 1; r.score += 4; } else if (st.교탁근처우선) { r.score -= 2; }
      if ((st.뒤자리우선 || st.키큼) && rowNorm >= 0.55) { r.backSatisfied += 1; r.score += 4; } else if (st.뒤자리우선 || st.키큼) { r.score -= 2; }

      st.인접금지.forEach(function (ref) {
        var t = seatMapByNo.get(ref); if (!t) return;
        var dr = Math.abs(nearestIndex(seat.y, info.ys) - nearestIndex(t.y, info.ys));
        var dc = Math.abs(nearestIndex(seat.x, info.xs) - nearestIndex(t.x, info.xs));
        if (dr <= 1 && dc <= 1) { r.adjacencyConflicts += 1; r.score -= 12; r.conflicts.push(st.번호 + '-' + ref + ' 인접금지'); }
      });
      st.같은줄금지.forEach(function (ref) {
        var t = seatMapByNo.get(ref); if (!t) return;
        if (nearestIndex(seat.y, info.ys) === nearestIndex(t.y, info.ys)) { r.rowConflicts += 1; r.score -= 8; r.conflicts.push(st.번호 + '-' + ref + ' 같은줄금지'); }
      });
      st.같은열금지.forEach(function (ref) {
        var t = seatMapByNo.get(ref); if (!t) return;
        if (nearestIndex(seat.x, info.xs) === nearestIndex(t.x, info.xs)) { r.colConflicts += 1; r.score -= 8; r.conflicts.push(st.번호 + '-' + ref + ' 같은열금지'); }
      });
      st.분리대상.forEach(function (ref) {
        var t = seatMapByNo.get(ref); if (!t) return;
        var d = Math.hypot((seat.x + seat.width / 2) - (t.x + t.width / 2), (seat.y + seat.height / 2) - (t.y + t.height / 2));
        if (d < 220) { r.score -= 5; r.conflicts.push(st.번호 + '-' + ref + ' 분리거리 부족'); } else r.score += 2;
      });
    });

    r.score = Math.round(r.score);
    return r;
  }

  function candidateSeatScore(st, seat, seatMap) {
    var info = seatRankInfo();
    var row = nearestIndex(seat.y, info.ys);
    var rowNorm = info.ys.length <= 1 ? 0 : row / (info.ys.length - 1);
    var dDesk = Math.hypot(seat.x - state.desk.x, seat.y - state.desk.y);
    var score = 0;

    if (st.앞자리우선) score += (1 - rowNorm) * 8;
    if (st.시력배려) score += (1 - rowNorm) * 10 + (dDesk < 260 ? 8 : 0);
    if (st.교탁근처우선) score += dDesk < 260 ? 8 : 0;
    if (st.뒤자리우선 || st.키큼) score += rowNorm * 8;

    st.인접금지.forEach(function (no) { var t = seatMap.get(no); if (!t) return; if (Math.abs(t.x - seat.x) <= seat.width + 8 && Math.abs(t.y - seat.y) <= seat.height + 8) score -= 100; });
    st.같은줄금지.forEach(function (no) { var t = seatMap.get(no); if (!t) return; if (Math.abs(t.y - seat.y) < seat.height * 0.45) score -= 90; });
    st.같은열금지.forEach(function (no) { var t = seatMap.get(no); if (!t) return; if (Math.abs(t.x - seat.x) < seat.width * 0.45) score -= 90; });
    st.분리대상.forEach(function (no) { var t = seatMap.get(no); if (!t) return; score += Math.min(8, Math.hypot(t.x - seat.x, t.y - seat.y) / 40); });

    return score + Math.random() * 0.1;
  }

  function assignSmart() {
    var usable = usableSeats();
    if (!usable.length) return false;
    var best = null;
    var tries = state.settings.smartTry;

    for (var t = 0; t < tries; t += 1) {
      var assignments = new Map();
      var used = new Set();
      var seatMap = new Map();
      var order = state.students.slice().sort(function (a, b) {
        var wa = (a.고정좌석 ? 100 : 0) + a.인접금지.length + a.같은줄금지.length + a.같은열금지.length + a.분리대상.length;
        var wb = (b.고정좌석 ? 100 : 0) + b.인접금지.length + b.같은줄금지.length + b.같은열금지.length + b.분리대상.length;
        return wb - wa || (Math.random() - 0.5);
      });

      var impossible = false;
      for (var i = 0; i < order.length; i += 1) {
        var st = order[i];
        var chosen = null;
        if (st.고정좌석) {
          var fixed = usable.find(function (s) { return s.id === st.고정좌석; });
          if (!fixed || used.has(fixed.id)) { impossible = true; break; }
          chosen = fixed;
        } else {
          var candidates = shuffle(usable.filter(function (s) { return !used.has(s.id); }).slice())
            .map(function (seat) { return { seat: seat, score: candidateSeatScore(st, seat, seatMap) }; })
            .sort(function (a, b) { return b.score - a.score; });
          chosen = candidates.length ? candidates[0].seat : null;
        }
        if (!chosen) { impossible = true; break; }
        used.add(chosen.id);
        assignments.set(st.번호, chosen.id);
        seatMap.set(st.번호, chosen);
      }

      if (impossible) continue;
      var report = evalArrangement(seatMap);
      if (!best || report.score > best.report.score) best = { assignments: assignments, report: report };
    }

    if (!best) return false;
    state.seats.forEach(function (s) { s.studentNo = null; });
    best.assignments.forEach(function (seatId, no) { var seat = seatById(seatId); if (seat) seat.studentNo = no; });
    state.assignmentReport = best.report;
    markDirty();
    return true;
  }

  function assignStudentToSeat(studentNo, targetSeat) {
    var prevSeat = seatByNo(studentNo);
    if (!targetSeat.enabled) return;

    if (!targetSeat.studentNo) {
      if (prevSeat) prevSeat.studentNo = null;
      targetSeat.studentNo = studentNo;
    } else {
      if (state.settings.assignBehavior === 'move') {
        var old = targetSeat.studentNo;
        targetSeat.studentNo = studentNo;
        if (prevSeat) prevSeat.studentNo = old;
      } else {
        var other = targetSeat.studentNo;
        targetSeat.studentNo = studentNo;
        if (prevSeat) prevSeat.studentNo = other;
      }
    }
    state.selectedStudentNo = null;
    markDirty();
  }

  function clearAssignments() {
    state.seats.forEach(function (s) { s.studentNo = null; });
    state.assignmentReport = null;
    state.selectedStudentNo = null;
    markDirty();
  }

  function savePlan() {
    var data = {
      version: 2,
      students: state.students,
      seats: state.seats,
      desk: state.desk,
      settings: state.settings,
      assignmentReport: state.assignmentReport
    };
    var text = JSON.stringify(data, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '자리배치_저장_v2.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    state.dirty = false;
    refreshDirty();
  }

  function loadPlan(file) {
    return file.text().then(function (t) {
      var d = JSON.parse(t);
      state.students = Array.isArray(d.students) ? d.students : [];
      state.seats = Array.isArray(d.seats) ? d.seats : [];
      if (d.desk) state.desk = d.desk;
      if (d.settings) state.settings = Object.assign({}, state.settings, d.settings);
      state.assignmentReport = d.assignmentReport || null;

      dom.assignBehavior.value = state.settings.assignBehavior || 'swap';
      dom.smartTry.value = state.settings.smartTry || 200;
      dom.printTitle.value = state.settings.printTitle || '';
      dom.printFooter.value = state.settings.printFooter || '';
      dom.printFooterSub1.value = state.settings.printFooterSub1 || '';
      dom.printFooterSub2.value = state.settings.printFooterSub2 || '';
      state.msg.info = '배치 불러오기 완료';
      validateStudents();
      state.dirty = false;
      refreshDirty();
      render();
    });
  }

  function buildPrintHtml() {
    var title = state.settings.printTitle || '자리 배치표';
    function mm(px) { return Number((px * 0.22).toFixed(2)); }
    var seatBlocks = activeSeats().map(function (s) {
      var st = state.students.find(function (x) { return x.번호 === s.studentNo; });
      var txt = !s.enabled ? 'X' : st ? (esc(st.번호) + '<br>' + esc(st.이름)) : esc(s.label || '');
      return '<div class="pseat ' + (s.enabled ? '' : 'disabled') + '" style="left:' + mm(s.x) + 'mm;top:' + mm(s.y) + 'mm;width:' + mm(s.width) + 'mm;height:' + mm(s.height) + 'mm;">' + txt + '</div>';
    }).join('');

    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      '@page{size:A4 landscape;margin:8mm}body{font-family:system-ui,sans-serif;margin:0}.title{text-align:center;font-size:18px;font-weight:800;margin:0 0 4mm}' +
      '.paper{height:184mm;border:1px solid #666;position:relative}.board{position:absolute;left:4mm;top:6mm;width:205mm;height:171mm;border:1px solid #999;background:#f7f7f7}.desk{position:absolute;border:1px solid #555;background:#e2d4ad;display:flex;align-items:center;justify-content:center;font-weight:700}' +
      '.pseat{position:absolute;border:1px solid #444;background:#fff;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.14}.disabled{background:#ddd;font-size:18pt}.meta{position:absolute;right:4mm;top:6mm;width:70mm;border:1px solid #aaa;padding:2mm;font-size:9pt}' +
      '</style></head><body><h1 class="title">' + esc(title) + '</h1><div class="paper"><div class="board"><div class="desk" style="left:' + mm(state.desk.x) + 'mm;top:' + mm(state.desk.y) + 'mm;width:' + mm(state.desk.width) + 'mm;height:' + mm(state.desk.height) + 'mm;">' + esc(state.desk.label) + '</div>' + seatBlocks + '</div>' +
      '<div class="meta"><h3>문구</h3><p>' + esc(state.settings.printFooter || '') + '</p><p>' + esc(state.settings.printFooterSub1 || '') + '</p><p>' + esc(state.settings.printFooterSub2 || '') + '</p></div></div></body></html>';
  }

  function render() {
    syncOptions();

    dom.desk.style.left = state.desk.x + 'px';
    dom.desk.style.top = state.desk.y + 'px';
    dom.desk.style.width = state.desk.width + 'px';
    dom.desk.style.height = state.desk.height + 'px';
    dom.desk.textContent = state.desk.label;

    var html = '';
    activeSeats().forEach(function (s) {
      var st = state.students.find(function (x) { return x.번호 === s.studentNo; });
      html += '<div class="seat ' + (s.enabled ? '' : 'disabled') + ' ' + (state.selectedSeatId === s.id ? 'selected' : '') + ' ' + (state.swapSeatId === s.id ? 'swapPick' : '') + '" ' +
        'data-sid="' + esc(s.id) + '" style="left:' + s.x + 'px;top:' + s.y + 'px;width:' + s.width + 'px;height:' + s.height + 'px;">' +
        (s.zone ? '<div class="zone">' + esc(s.zone) + '</div>' : '') +
        (s.enabled ? (st ? (esc(st.번호) + '<br>' + esc(st.이름)) : esc(s.label || '빈자리')) : 'X') + '</div>';
    });
    dom.seatLayer.innerHTML = html;

    var assignedSet = new Set(state.seats.map(function (s) { return s.studentNo; }).filter(Boolean));
    var q = dom.studentSearch.value.trim();
    var unassigned = state.students.filter(function (s) {
      if (assignedSet.has(s.번호)) return false;
      if (!q) return true;
      return (s.번호 + ' ' + s.이름).indexOf(q) >= 0;
    });

    dom.studentList.innerHTML = unassigned.map(function (s) {
      var sex = s.성별 === 'M' ? '남' : (s.성별 === 'F' ? '여' : '미상');
      return '<button class="studentItem ' + (state.selectedStudentNo === s.번호 ? 'selected' : '') + '" data-no="' + esc(s.번호) + '"><span>' + esc(s.번호) + ' ' + esc(s.이름) + '</span><small>' + sex + '</small></button>';
    }).join('');
    dom.stats.textContent = '전체 ' + state.students.length + '명 / 미배정 ' + unassigned.length + '명 / 사용가능 좌석 ' + usableSeats().length + '개';

    var seat = seatById(state.selectedSeatId);
    dom.seatEmpty.style.display = seat ? 'none' : 'block';
    dom.seatEditor.style.display = seat ? 'grid' : 'none';
    if (seat) {
      dom.seatId.textContent = seat.id;
      dom.seatLabel.value = seat.label || '';
      dom.seatZone.value = seat.zone || '';
      dom.seatEnabled.checked = !!seat.enabled;
      dom.seatWidth.value = seat.width;
      dom.seatHeight.value = seat.height;
    }

    if (!state.assignmentReport) {
      dom.report.innerHTML = '<span class="muted">자동 배정 후 요약이 표시됩니다.</span>';
    } else {
      var r = state.assignmentReport;
      dom.report.innerHTML =
        '<div><b>전체 점수:</b> ' + r.score + '점</div>' +
        '<div>고정좌석 충족: ' + r.fixedSatisfied + '명</div>' +
        '<div>인접금지 충돌: ' + r.adjacencyConflicts + '건</div>' +
        '<div>같은줄금지 충돌: ' + r.rowConflicts + '건</div>' +
        '<div>같은열금지 충돌: ' + r.colConflicts + '건</div>' +
        '<div>앞자리/시력 우선 충족: ' + r.frontSatisfied + '명</div>' +
        '<div>교탁근처 선호 충족: ' + r.nearTeacherSatisfied + '명</div>' +
        '<div>뒤자리(키큼 포함) 충족: ' + r.backSatisfied + '명</div>' +
        '<details><summary>충돌 학생 목록</summary><pre>' + esc(r.conflicts.join('\n') || '없음') + '</pre></details>' +
        '<details><summary>제약 미충족 목록</summary><pre>' + esc(r.unmet.join('\n') || '없음') + '</pre></details>';
    }

    var msgLines = [];
    if (state.msg.info) msgLines.push('ℹ️ ' + state.msg.info);
    state.msg.errors.forEach(function (e) { msgLines.push('❌ ' + e); });
    state.msg.warnings.forEach(function (w) { msgLines.push('⚠️ ' + w); });
    dom.status.textContent = msgLines.join('\n') || '준비 완료';
  }

  function bindEvents() {
    dom.modeButtons.forEach(function (btn) { btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); }); });

    dom.btnAddSeat.addEventListener('click', function () { setMode('add'); });
    dom.btnBuild.addEventListener('click', function () {
      if (!confirm('기존 좌석 배치와 위치가 사라집니다. 정말 다시 생성할까요?')) return;
      generateGrid(Number(dom.cols.value), Number(dom.rows.value));
      validateStudents();
      render();
    });
    dom.btnRandom.addEventListener('click', function () { assignRandom(); render(); });
    dom.btnExam.addEventListener('click', function () { assignExam(); render(); });
    dom.btnClear.addEventListener('click', function () { clearAssignments(); render(); });
    dom.btnSmart.addEventListener('click', function () {
      syncOptions();
      var vr = validateStudents();
      if (vr.errors.length) return render();
      if (!assignSmart()) state.msg.errors = ['자동 배정에 실패했습니다. 고정좌석/제약 조건을 확인해주세요.'];
      render();
    });

    dom.btnSavePlan.addEventListener('click', savePlan);
    dom.btnLoadPlan.addEventListener('click', function () { dom.planFile.value = ''; dom.planFile.click(); });
    dom.planFile.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      loadPlan(f).catch(function (err) { alert('불러오기 실패: ' + (err.message || err)); });
    });

    dom.btnPrint.addEventListener('click', function () {
      syncOptions();
      var w = window.open('', 'print-seat', 'width=1280,height=900');
      if (!w) { alert('팝업 차단 해제 후 다시 시도해주세요.'); return; }
      w.document.write(buildPrintHtml());
      w.document.close();
      setTimeout(function () { w.print(); }, 250);
    });

    [dom.snapOn, dom.snapGrid, dom.zoom, dom.assignBehavior, dom.smartTry, dom.printTitle, dom.printFooter, dom.printFooterSub1, dom.printFooterSub2].forEach(function (el) {
      el.addEventListener('input', function () { syncOptions(); markDirty(); render(); });
    });

    dom.studentSearch.addEventListener('input', render);
    dom.studentList.addEventListener('click', function (e) {
      var item = e.target.closest('.studentItem');
      if (!item) return;
      state.selectedStudentNo = item.getAttribute('data-no');
      render();
    });

    dom.studentFile.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      state.msg.errors = [];
      readStudentFile(f).then(function (list) {
        state.students = list;
        state.selectedStudentNo = null;
        state.msg.info = '학생 명단 불러오기 완료: ' + list.length + '명';
        validateStudents();
        markDirty();
        render();
      }).catch(function (err) {
        state.msg.errors = [String(err.message || err)];
        render();
      });
    });

    dom.board.addEventListener('pointerdown', function (e) {
      var p = boardPoint(e);
      var seat = hitSeat(p.x, p.y);

      if (state.mode === 'add' && !seat && !deskHit(p.x, p.y)) {
        var newSeat = createSeat(snap(p.x - 44), snap(p.y - 44));
        state.seats.push(newSeat);
        state.selectedSeatId = newSeat.id;
        markDirty();
        render();
        return;
      }

      if (deskHit(p.x, p.y) && state.mode === 'select') {
        state.drag = { type: 'desk', start: p };
        return;
      }

      if (!seat) return;

      if (state.mode === 'delete') {
        seat.deleted = true;
        seat.studentNo = null;
        state.selectedSeatId = null;
      } else if (state.mode === 'disable') {
        seat.enabled = !seat.enabled;
        if (!seat.enabled) seat.studentNo = null;
        state.selectedSeatId = seat.id;
      } else if (state.mode === 'assign' && state.selectedStudentNo) {
        assignStudentToSeat(state.selectedStudentNo, seat);
        state.selectedSeatId = seat.id;
      } else {
        state.selectedSeatId = seat.id;
        if (state.mode === 'swap') {
          if (!state.swapSeatId) state.swapSeatId = seat.id;
          else if (state.swapSeatId === seat.id) state.swapSeatId = null;
          else {
            var a = seatById(state.swapSeatId);
            var b = seat;
            var temp = a.studentNo; a.studentNo = b.studentNo; b.studentNo = temp;
            state.swapSeatId = null;
          }
        }
      }

      if (state.mode === 'select') {
        state.drag = { type: 'seat', id: seat.id, start: p };
      }
      markDirty();
      render();
    });

    dom.board.addEventListener('pointermove', function (e) {
      if (!state.drag) return;
      var p = boardPoint(e);
      var dx = p.x - state.drag.start.x;
      var dy = p.y - state.drag.start.y;

      if (state.drag.type === 'desk') {
        state.desk.x = clamp(snap(state.desk.x + dx), 0, 1300 - state.desk.width);
        state.desk.y = clamp(snap(state.desk.y + dy), 0, 820 - state.desk.height);
      } else if (state.drag.type === 'seat') {
        var s = seatById(state.drag.id);
        if (s) {
          s.x = clamp(snap(s.x + dx), 0, 1300 - s.width);
          s.y = clamp(snap(s.y + dy), 0, 820 - s.height);
        }
      }
      state.drag.start = p;
      markDirty();
      render();
    });

    window.addEventListener('pointerup', function () {
      state.drag = null;
      state.msg.warnings = state.msg.warnings.filter(function (w) { return w.indexOf('좌석 겹침') !== 0; }).concat(detectSeatOverlapWarnings());
      render();
    });

    [dom.seatLabel, dom.seatZone, dom.seatEnabled, dom.seatWidth, dom.seatHeight].forEach(function (el) {
      el.addEventListener('input', function () {
        var s = seatById(state.selectedSeatId); if (!s) return;
        s.label = dom.seatLabel.value;
        s.zone = dom.seatZone.value;
        s.enabled = dom.seatEnabled.checked;
        s.width = Math.max(40, Number(dom.seatWidth.value) || s.width);
        s.height = Math.max(40, Number(dom.seatHeight.value) || s.height);
        markDirty();
        render();
      });
    });

    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  generateGrid(6, 4);
  syncOptions();
  bindEvents();
  state.msg.info = '오프라인 배포용으로 준비되었습니다. 학생 파일을 불러오세요.';
  if (typeof XLSX === 'undefined' || !XLSX.read) {
    state.msg.warnings.push('xlsx.full.min.js가 로드되지 않아 .xlsx 불러오기를 사용할 수 없습니다.');
  }
  validateStudents();
  render();
})();
