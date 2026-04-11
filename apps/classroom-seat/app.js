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
    btnBuild: byId('btnBuild'), btnRandom: byId('btnRandom'), btnSmart: byId('btnSmart'), btnExam: byId('btnExam'), btnPrint: byId('btnPrint'), btnPrintExam: byId('btnPrintExam'), btnClear: byId('btnClear'),
    rows: byId('rows'), cols: byId('cols'), zoom: byId('zoom'), zoomLabel: byId('zoomLabel'), assignBehavior: byId('assignBehavior'), smartTry: byId('smartTry'),
    printTitle: byId('printTitle'), printFooter: byId('printFooter'), printFooterSub1: byId('printFooterSub1'), printFooterSub2: byId('printFooterSub2'),
    studentSearch: byId('studentSearch'), stats: byId('stats'), studentList: byId('studentList'), absenceSummary: byId('absenceSummary'), btnCopyAbsence: byId('btnCopyAbsence'),
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

  function normalizeSeatLabel(v) {
    return String(v == null ? '' : v).trim().replace(/[\s-]/g, '').toUpperCase();
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

  function snap(v) { return v; }
  function boardPoint(ev) {
    var rect = dom.board.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) / state.zoom, y: (ev.clientY - rect.top) / state.zoom };
  }

  function activeSeats() { return state.seats.filter(function (s) { return !s.deleted; }); }
  function usableSeats() { return state.seats.filter(function (s) { return !s.deleted && s.enabled; }); }
  function seatById(id) { return state.seats.find(function (s) { return s.id === id && !s.deleted; }) || null; }
  function sameNo(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); }
  function studentByNo(no) { return state.students.find(function (s) { return sameNo(s.번호, no); }) || null; }
  function seatByNo(no) { return state.seats.find(function (s) { return sameNo(s.studentNo, no) && !s.deleted; }) || null; }

  function generateGrid(cols, rows) {
    state.seats = [];
    var sx = 120, sy = 150, w = 88, h = 88, gx = 18, gy = 18;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var seat = createSeat(sx + c * (w + gx), sy + r * (h + gy));
        seat.label = String(r + 1) + String(c + 1);
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
      '같은열금지': '같은열금지', '인접금지': '인접금지', '메모': '메모',
      '결시': '결시', '결석': '결시', 'absent': '결시', '결시사유': '결시사유', '결석사유': '결시사유', 'absentreason': '결시사유'
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
        메모: String(idx('메모') >= 0 ? (r[idx('메모')] == null ? '' : r[idx('메모')]) : '').trim(),
        결시: asBool(idx('결시') >= 0 ? r[idx('결시')] : ''),
        결시사유: String(idx('결시사유') >= 0 ? (r[idx('결시사유')] == null ? '' : r[idx('결시사유')]) : '').trim()
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
    var labelMap = buildSeatLabelMap();

    state.students.forEach(function (s, i) {
      if (!s.번호) errors.push('행 ' + (i + 2) + ': 번호 없음');
      if (!s.이름) errors.push('행 ' + (i + 2) + ': 이름 없음');
      if (s.번호 && seen.has(s.번호)) errors.push('번호 중복: ' + s.번호);
      seen.add(s.번호);

      if (s.고정좌석) {
        var fixed = findSeatByFixedLabel(s.고정좌석, labelMap);
        if (!fixed.seat) errors.push(s.번호 + ' ' + s.이름 + ': 고정좌석 라벨(' + s.고정좌석 + ')이 없거나 중복입니다.');
        else if (!fixed.seat.enabled) errors.push(s.번호 + ' ' + s.이름 + ': 고정좌석 라벨(' + s.고정좌석 + ')이 비활성 좌석입니다.');
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

  function buildSeatLabelMap() {
    var map = new Map();
    state.seats.forEach(function (s) {
      if (s.deleted) return;
      var key = normalizeSeatLabel(s.label);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return map;
  }

  function findSeatByFixedLabel(rawLabel, labelMap) {
    var key = normalizeSeatLabel(rawLabel);
    if (!key) return { seat: null, reason: 'empty' };
    var seats = (labelMap || buildSeatLabelMap()).get(key) || [];
    if (seats.length !== 1) return { seat: null, reason: seats.length ? 'duplicate' : 'missing' };
    return { seat: seats[0], reason: null };
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

      if (st.고정좌석) {
        var fixed = findSeatByFixedLabel(st.고정좌석);
        if (fixed.seat && fixed.seat.id === seat.id) { r.fixedSatisfied += 1; r.score += 8; }
      }
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
    var labelMap = buildSeatLabelMap();

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
          var fixedSeat = findSeatByFixedLabel(st.고정좌석, labelMap).seat;
          if (!fixedSeat || !fixedSeat.enabled || used.has(fixedSeat.id)) { impossible = true; break; }
          chosen = fixedSeat;
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
      state.students.forEach(function (s) { s.번호 = normalizeNo(s.번호); s.결시 = !!s.결시; s.결시사유 = String(s.결시사유 || '').trim(); });
      state.seats = Array.isArray(d.seats) ? d.seats : [];
      state.seats.forEach(function (s) { s.studentNo = s.studentNo == null ? null : normalizeNo(s.studentNo); });
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
    return buildPrintHtmlWithMode({ exam: false });
  }

  function sortedStudents() {
    return state.students.slice().sort(function (a, b) { return a.번호.localeCompare(b.번호, 'ko', { numeric: true }); });
  }

  function getAbsenceInfo() {
    var sorted = sortedStudents();
    var absentees = sorted.filter(function (s) { return !!s.결시; });
    var total = sorted.length;
    var absentCount = absentees.length;
    var absentListText = absentees.map(function (s) {
      return s.번호 + '번 ' + s.이름 + (s.결시사유 ? '(' + s.결시사유 + ')' : '');
    }).join(', ');

    var numericNos = sorted.map(function (s) { return Number(String(s.번호).replace(/[^\d]/g, '')); })
      .filter(function (n) { return Number.isFinite(n) && n > 0; })
      .sort(function (a, b) { return a - b; });
    var firstNo = numericNos.length ? numericNos[0] : 0;
    var maxNo = numericNos.length ? numericNos[numericNos.length - 1] : 0;
    var seenNos = new Set(numericNos.map(function (n) { return String(n); }));
    var miss = [];
    if (firstNo > 0 && maxNo >= firstNo) {
      for (var i = firstNo; i <= maxNo; i += 1) {
        if (!seenNos.has(String(i))) miss.push(i);
      }
    }
    var endNo = sorted.length ? sorted[sorted.length - 1].번호 : '-';
    var missText = miss.length ? miss.join(', ') + '번' : '없음';
    var summary = absentCount > 0
      ? ('재적 ' + total + '명 결시 ' + absentCount + '명 결시자: ' + absentListText)
      : ('재적 ' + total + '명 결시 0명');
    return { total: total, absentCount: absentCount, absentees: absentees, summary: summary, endNo: endNo, missText: missText };
  }

  function buildPrintHtmlWithMode(opts) {
    var examMode = !!(opts && opts.exam);
    var title = state.settings.printTitle || '자리 배치표';
    var footer = state.settings.printFooter || '';
    var footerSub1 = state.settings.printFooterSub1 || '';
    var footerSub2 = state.settings.printFooterSub2 || '';
    var abs = getAbsenceInfo();

    var seats = activeSeats();
    var xVals = seats.map(function (s) { return s.x; }).sort(function (a, b) { return a - b; });
    var yVals = seats.map(function (s) { return s.y; }).sort(function (a, b) { return a - b; });

    function cluster(vals, gap) {
      var out = [];
      vals.forEach(function (v) {
        if (!out.length || Math.abs(v - out[out.length - 1]) > gap) out.push(v);
      });
      return out;
    }

    var cols = cluster(xVals, 44);
    var rows = cluster(yVals, 44);
    if (!cols.length) cols = [0];
    if (!rows.length) rows = [0];

    function nearIndex(v, list) {
      var idx = 0;
      for (var i = 1; i < list.length; i += 1) {
        if (Math.abs(v - list[i]) < Math.abs(v - list[idx])) idx = i;
      }
      return idx;
    }

    var printGap = Math.max(0.8, Math.min(2.1, 2.6 - Math.max(cols.length, rows.length) * 0.1));
    var usableWidth = 214;
    var usableHeight = 116;
    var seatWidth = Math.max(14, Math.min(44, Number(((usableWidth - printGap * Math.max(cols.length - 1, 0)) / cols.length).toFixed(2))));
    var seatHeight = Math.max(10, Math.min(25, Number(((usableHeight - printGap * Math.max(rows.length - 1, 0)) / rows.length).toFixed(2))));
    var seatFont = Math.max(7.4, Math.min(11.3, Number((Math.min(seatWidth, seatHeight) * 0.57).toFixed(2))));

    var matrix = [];
    for (var c = 0; c < cols.length; c += 1) {
      matrix[c] = [];
      for (var r = 0; r < rows.length; r += 1) matrix[c][r] = null;
    }
    seats.forEach(function (s) {
      var c = nearIndex(s.x, cols);
      var r = nearIndex(s.y, rows);
      if (s.enabled) matrix[c][r] = s;
    });

    var seatGrid = matrix.map(function (col) {
      var cells = col.map(function (seat) {
        if (!seat) return '<div class="seatCell skip"></div>';
        if (seat.studentNo == null) return '<div class="seatCell"><div class="seatText">&nbsp;</div></div>';
        var st = studentByNo(seat.studentNo);
        var txt = st ? (esc(st.번호) + '<br>' + esc(st.이름)) : (esc(seat.studentNo) + '<br>&nbsp;');
        return '<div class="seatCell"><div class="seatText">' + txt + '</div></div>';
      }).join('');
      return '<div class="seatCol">' + cells + '</div>';
    }).join('');

    var seatCounts = matrix.map(function (col) {
      return col.filter(function (seat) { return !!seat; }).length;
    }).filter(function (n) { return n > 0; });
    var seatLayoutText = seatCounts.length ? seatCounts.join('-') : '-';
    var maxRows = matrix.reduce(function (m, col) { return Math.max(m, col.length); }, 0);
    var examTableRows = '';
    for (var rr = 0; rr < maxRows; rr += 1) {
      var tds = '';
      for (var cc = 0; cc < matrix.length; cc += 1) {
        var seat = matrix[cc][rr];
        var stExam = seat && seat.studentNo != null ? studentByNo(seat.studentNo) : null;
        var v = '&nbsp;';
        if (stExam) {
          v = '<div class="cellNo">' + esc(stExam.번호) + '</div><div class="cellName">' + esc(stExam.이름) + '</div>' +
            (stExam.결시 ? '<div class="cellReason">결시' + (stExam.결시사유 ? ' (' + esc(stExam.결시사유) + ')' : '') + '</div>' : '');
        }
        tds += '<td>' + v + '</td>';
      }
      examTableRows += '<tr>' + tds + '</tr>';
    }

    var sorted = sortedStudents();
    var attendanceRows = Math.max(28, sorted.length);
    var attendanceHtml = '';
    for (var i = 0; i < attendanceRows; i += 1) {
      var st = sorted[i];
      var no = st ? esc(st.번호) : String(i + 1);
      var name = st ? esc(st.이름) : '';
      attendanceHtml += '<tr><td>' + (i + 1) + '</td><td>' + no + '</td><td>' + name + '</td><td></td></tr>';
    }

    if (examMode) {
      return '<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>' + esc(title) + '</title><style>' +
        '@page { size:A4 landscape; margin:0; }' +
        '*{ box-sizing:border-box; } html,body{ margin:0; padding:0; } body{ font-family:"Noto Serif KR","Noto Sans KR",serif; color:#111; }' +
        '.paper{ width:297mm; height:210mm; padding:16mm 20mm; position:relative; }' +
        '.title{ text-align:center; font-size:22pt; font-weight:700; margin:0 0 14mm; letter-spacing:1px; }' +
        '.meta{ font-size:21pt; line-height:1.7; margin:0 0 12mm; }' +
        '.seatTitle{ font-size:20pt; margin:0 0 4mm; }' +
        '.tableWrap{ width:62%; }' +
        'table{ width:100%; border-collapse:collapse; table-layout:fixed; }' +
        'td{ border:1px solid #333; text-align:center; height:17mm; padding:1.2mm 0.8mm; vertical-align:middle; }' +
        '.cellNo{ font-size:15pt; font-weight:700; line-height:1.1; } .cellName{ font-size:11pt; line-height:1.15; } .cellReason{ font-size:9pt; color:#7a2222; line-height:1.1; }' +
        '.corner{ position:absolute; width:6mm; height:6mm; border-color:#bfbfbf; }' +
        '.c1{ left:7mm; top:7mm; border-left:1px solid #bfbfbf; border-top:1px solid #bfbfbf; }' +
        '.c2{ right:7mm; top:7mm; border-right:1px solid #bfbfbf; border-top:1px solid #bfbfbf; }' +
        '.c3{ left:7mm; bottom:7mm; border-left:1px solid #bfbfbf; border-bottom:1px solid #bfbfbf; }' +
        '.c4{ right:7mm; bottom:7mm; border-right:1px solid #bfbfbf; border-bottom:1px solid #bfbfbf; }' +
        '</style></head><body><div class="paper">' +
        '<div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>' +
        '<div class="title">' + esc(title) + '</div>' +
        '<div class="meta">재적: ' + abs.total + '명<br>결시: ' + abs.absentCount + '명' +
        (abs.absentCount ? ' 결시자: ' + esc(abs.absentees.map(function (s) { return s.번호 + '번 ' + s.이름 + (s.결시사유 ? '(' + s.결시사유 + ')' : ''); }).join(', ')) : '') +
        '<br>결번: ' + esc(abs.missText.replace(/번$/, '')) + '</div>' +
        '<div class="seatTitle">좌석배치:' + esc(seatLayoutText) + '</div>' +
        '<div class="tableWrap"><table><tbody>' + examTableRows + '</tbody></table></div>' +
        '</div></body></html>';
    }

    return '<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>' + esc(title) + '</title><style>' +
      '@page { size:A4 landscape; margin:0; }' +
      '*{ box-sizing:border-box; } html,body{ margin:0; padding:0; } body{ font-family:"Noto Sans KR",system-ui,sans-serif; color:#111; }' +
      '.paper{ width:297mm; height:210mm; border:1px solid #666; padding:3mm; overflow:hidden; }' +
      '.title{ text-align:center; font-size:' + (examMode ? '20pt' : '14pt') + '; font-weight:800; margin:1mm 0 1.5mm; }' +
      '.sub{ text-align:center; font-size:' + (examMode ? '13pt' : '9pt') + '; margin:0 0 2mm; font-weight:' + (examMode ? '700' : '400') + '; }' +
      '.meta{ border:1px solid #555; padding:' + (examMode ? '2.3mm 2.2mm' : '1.6mm 2mm') + '; margin:0 0 2mm; background:#fafafa; font-size:' + (examMode ? '12.5pt' : '9pt') + '; line-height:' + (examMode ? '1.55' : '1.45') + '; font-weight:' + (examMode ? '700' : '400') + '; }' +
      '.main{ display:grid; grid-template-columns:1fr 56mm; gap:3mm; height:' + (examMode ? '171mm' : '183mm') + '; }' +
      '.leftCol{ display:grid; grid-template-rows:' + (examMode ? '1fr' : '3fr 1fr') + '; gap:3mm; }' +
      '.classroom{ border:1px solid #555; padding:3mm; position:relative; background:#f7f7f7; }' +
      '.classroomRot{ position:relative; height:100%; transform:' + (examMode ? 'none' : 'rotate(180deg)') + '; transform-origin:center; }' +
      '.inside{ border:1px solid #777; height:100%; padding:20mm 2.5mm 3.5mm; display:grid; align-items:start; justify-items:stretch; }' +
      '.seatsWrap{ display:flex; align-items:flex-start; justify-content:space-between; gap:' + printGap + 'mm; width:100%; }' +
      '.seatCol{ display:flex; flex-direction:column; }' +
      '.seatCell{ width:' + seatWidth + 'mm; height:' + seatHeight + 'mm; border:1px solid #666; display:flex; align-items:center; justify-content:center; text-align:center; line-height:1.12; font-size:' + seatFont + 'pt; font-weight:700; background:#fff; white-space:pre-line; }' +
      '.seatText{ transform:' + (examMode ? 'none' : 'rotate(180deg)') + '; }' +
      '.seatCell.skip{ border:none; background:transparent; }' +
      '.seatCell.disabled{ background:#ddd; color:#777; font-size:11pt; }' +
      '.desk{ position:absolute; left:50%; top:5.5mm; transform:translateX(-50%); width:72mm; height:12mm; border:1px solid #666; background:#e7ddb4; display:flex; align-items:center; justify-content:center; font-weight:800; z-index:10; }' +
      '.desk > span{ transform:' + (examMode ? 'none' : 'rotate(180deg)') + '; }' +
      '.footer{ border:1px solid #555; padding:4mm; text-align:center; background:#fafafa; }' +
      '.footer h3{ margin:0 0 2mm; font-size:12pt; }' +
      '.footer p{ margin:1mm 0; font-size:9pt; }' +
      '.att{ border:1px solid #555; padding:1.2mm; height:100%; }' +
      '.attTitle{ border:1px solid #555; text-align:center; font-weight:800; padding:1mm 0; margin-bottom:1.2mm; font-size:10pt; }' +
      'table{ width:100%; border-collapse:collapse; font-size:7.4pt; }' +
      'th,td{ border:1px solid #555; height:5.35mm; text-align:center; padding:0; } th{ background:#efefef; }' +
      '</style></head><body>' +
      '<div class="paper"><div class="title">' + esc(title) + '</div>' +
      (examMode ? '<div class="sub">[좌석배치]</div>' : '') +
      (examMode ? ('<div class="meta">[재적: ' + abs.total + '명] ' +
      '[결시:' + abs.absentCount + '명' + (abs.absentCount ? '(' + esc(abs.absentees.map(function (s) { return s.번호 + '번' + s.이름; }).join(', ')) + ')' : '') + '] ' +
      '[끝번호:' + esc(abs.endNo) + '번, 결번:' + esc(abs.missText) + ']</div>') : '') + '<div class="main">' +
      '<div class="leftCol"><div class="classroom"><div class="classroomRot"><div class="inside"><div class="seatsWrap">' + seatGrid + '</div></div><div class="desk"><span>교탁</span></div></div></div>' +
      (examMode ? '' : ('<div class="footer"><h3>' + esc(footer) + '</h3><p>' + esc(footerSub1) + '</p><p>' + esc(footerSub2) + '</p></div>')) + '</div>' +
      '<div class="att"><div class="attTitle">출석부</div><table><thead><tr><th>번</th><th>번호</th><th>이름</th><th>비고</th></tr></thead><tbody>' + attendanceHtml + '</tbody></table></div>' +
      '</div></div></body></html>';
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
      var st = studentByNo(s.studentNo);
      html += '<div class="seat ' + (s.enabled ? '' : 'disabled') + ' ' + (st && st.결시 ? 'absent ' : '') + (state.selectedSeatId === s.id ? 'selected' : '') + ' ' + (state.swapSeatId === s.id ? 'swapPick' : '') + '" ' +
        'data-sid="' + esc(s.id) + '" style="left:' + s.x + 'px;top:' + s.y + 'px;width:' + s.width + 'px;height:' + s.height + 'px;">' +
        (s.zone ? '<div class="zone">' + esc(s.zone) + '</div>' : '') +
        (s.enabled ? (st ? (esc(st.번호) + '<br>' + esc(st.이름) + (st.결시 ? '<br>(결시)' : '')) : esc(s.label || '빈자리')) : 'X') + '</div>';
    });
    dom.seatLayer.innerHTML = html;

    var assignedSet = new Set(state.seats.map(function (s) { return s.studentNo == null ? null : String(s.studentNo); }).filter(Boolean));
    var q = dom.studentSearch.value.trim();
    var visibleStudents = sortedStudents().filter(function (s) {
      if (!q) return true;
      return (s.번호 + ' ' + s.이름).indexOf(q) >= 0;
    });

    dom.studentList.innerHTML = visibleStudents.map(function (s) {
      var sex = s.성별 === 'M' ? '남' : (s.성별 === 'F' ? '여' : '미상');
      var assigned = assignedSet.has(String(s.번호)) ? '배정됨' : '미배정';
      return '<div class="studentItem ' + (state.selectedStudentNo === s.번호 ? 'selected' : '') + ' ' + (s.결시 ? 'absent' : '') + '" data-no="' + esc(s.번호) + '">' +
        '<button class="pickStudent" data-no="' + esc(s.번호) + '"><span>' + esc(s.번호) + ' ' + esc(s.이름) + '</span> <small class="studentMeta">(' + sex + ' · ' + assigned + (s.결시 ? ' · 결시' : '') + ')</small></button>' +
        '<div class="absentTools"><label><input type="checkbox" class="absentToggle" data-no="' + esc(s.번호) + '" ' + (s.결시 ? 'checked' : '') + '>결시</label>' +
        '<input class="absentReason" data-no="' + esc(s.번호) + '" type="text" placeholder="결시 사유" value="' + esc(s.결시사유 || '') + '"></div></div>';
    }).join('');
    var unassignedCount = state.students.filter(function (s) { return !assignedSet.has(String(s.번호)); }).length;
    var abs = getAbsenceInfo();
    dom.stats.textContent = '전체 ' + state.students.length + '명 / 미배정 ' + unassignedCount + '명 / 결시 ' + abs.absentCount + '명 / 사용가능 좌석 ' + usableSeats().length + '개';
    dom.absenceSummary.value = abs.summary;

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
      w.document.write(buildPrintHtmlWithMode({ exam: false }));
      w.document.close();
      setTimeout(function () { w.print(); }, 250);
    });

    dom.btnPrintExam.addEventListener('click', function () {
      syncOptions();
      var w = window.open('', 'print-seat-exam', 'width=1280,height=900');
      if (!w) { alert('팝업 차단 해제 후 다시 시도해주세요.'); return; }
      w.document.write(buildPrintHtmlWithMode({ exam: true }));
      w.document.close();
      setTimeout(function () { w.print(); }, 250);
    });

    dom.btnCopyAbsence.addEventListener('click', function () {
      var text = dom.absenceSummary.value || '';
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { state.msg.info = '결시 현황을 복사했습니다.'; render(); })
          .catch(function () { alert('복사에 실패했습니다.'); });
      } else {
        dom.absenceSummary.select();
        document.execCommand('copy');
        state.msg.info = '결시 현황을 복사했습니다.';
        render();
      }
    });

    [dom.zoom, dom.assignBehavior, dom.smartTry, dom.printTitle, dom.printFooter, dom.printFooterSub1, dom.printFooterSub2].forEach(function (el) {
      el.addEventListener('input', function () { syncOptions(); markDirty(); render(); });
    });

    dom.studentSearch.addEventListener('input', render);
    dom.studentList.addEventListener('click', function (e) {
      var item = e.target.closest('.pickStudent');
      if (!item) return;
      state.selectedStudentNo = item.getAttribute('data-no');
      render();
    });

    dom.studentList.addEventListener('change', function (e) {
      var toggle = e.target.closest('.absentToggle');
      if (!toggle) return;
      var no = toggle.getAttribute('data-no');
      var st = studentByNo(no);
      if (!st) return;
      st.결시 = !!toggle.checked;
      markDirty();
      render();
    });

    dom.studentList.addEventListener('input', function (e) {
      var reason = e.target.closest('.absentReason');
      if (!reason) return;
      var no = reason.getAttribute('data-no');
      var st = studentByNo(no);
      if (!st) return;
      st.결시사유 = reason.value.trim();
      markDirty();
      if (st.결시) render();
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
  state.msg.info = '준비되었습니다. 학생 파일을 불러오세요.';
  if (typeof XLSX === 'undefined' || !XLSX.read) {
    state.msg.warnings.push('xlsx.full.min.js가 로드되지 않아 .xlsx 불러오기를 사용할 수 없습니다.');
  }
  validateStudents();
  render();
})();
