(() => {
  const grid = 40;

  const ws = document.getElementById('ws');
  const exprEl = document.getElementById('expr');
  const countEl = document.getElementById('count');
  const targetEl = document.getElementById('target'); // 목표식/설명 입력칸(있으면 저장)

  if (!ws || !exprEl || !countEl) {
    alert('index.html에 ws/expr/count 요소가 없습니다. id를 확인하세요.');
    return;
  }

  /** @type {Array<{id:string,type:'unit'|'x'|'x2',orient:'v'|'h',sign:1|-1,x:number,y:number,w:number,h:number}>} */
  let tiles = [];
  let selectedId = null;

  // ---------- 모드 전환 ----------
  // x: 기존(부호 포함)
  // square: (a+b)^2 면적(부호는 의미 없게 처리하지만 "기존 기능" 유지 위해 삭제/생성은 그대로 가능)
  let mode = 'x'; // 'x' 또는 'square'

  // (a+b)^2에서 a,b 길이(시각화 비율; 수학적 값이 아니라 길이 비율)
  const A = 7 * grid;
  const B = 3 * grid;

  // ---------- Undo ----------
  const UNDO_MAX = 50;
  /** @type {Array<{mode:string, tiles:any[], selectedId:any, targetText:string}>} */
  let undoStack = [];

  const cloneTiles = (arr) => arr.map(t => ({ ...t }));

  const getSnapshot = () => ({
    mode, // ✅ 모드도 되돌리기 대상
    tiles: cloneTiles(tiles),
    selectedId,
    targetText: targetEl ? targetEl.value : ''
  });

  const pushUndo = () => {
    undoStack.push(getSnapshot());
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  };

  const applySnapshot = (snap) => {
    mode = snap.mode || 'x';
    tiles = cloneTiles(snap.tiles || []);
    selectedId = snap.selectedId ?? null;
    if (targetEl && typeof snap.targetText === 'string') targetEl.value = snap.targetText;
    render();
  };

  const undo = () => {
    const snap = undoStack.pop();
    if (!snap) return;
    applySnapshot(snap);
  };

  // ---------- 유틸 ----------
  const snap = (v) => Math.round(v / grid) * grid;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const newId = () => 't' + Math.random().toString(16).slice(2);

  // ✅ 모드에 따라 같은 type이라도 크기만 바꿔 쓰는 핵심 함수
  const sizeByType = (type, orient = 'v') => {
    // x 모드(기존)
    if (mode === 'x') {
      if (type === 'unit') return { w: 2 * grid, h: 2 * grid };
      if (type === 'x') {
        return orient === 'h'
          ? { w: 6 * grid, h: 2 * grid }
          : { w: 2 * grid, h: 6 * grid };
      }
      if (type === 'x2') return { w: 6 * grid, h: 6 * grid };
    }

    // square 모드: unit -> b^2, x -> ab(회전), x2 -> a^2
    if (mode === 'square') {
      if (type === 'unit') return { w: B, h: B }; // b^2
      if (type === 'x') {
        return orient === 'h'
          ? { w: A, h: B } // ab (가로)
          : { w: B, h: A }; // ab (세로)
      }
      if (type === 'x2') return { w: A, h: A }; // a^2
    }

    return { w: 2 * grid, h: 2 * grid };
  };

  // ✅ (중요) 기존 코드에 없던 tileLabel 추가
  const tileLabel = (t) => {
    if (mode === 'square') {
      // 면적 모델: 부호 표시는 의미 없으니 라벨은 양수로 통일(기존 기능은 유지)
      if (t.type === 'x2') return 'a²';
      if (t.type === 'x') return 'ab';
      if (t.type === 'unit') return 'b²';
      return '';
    }

    // x 모드(기존)
    const s = t.sign === 1 ? '' : '−';
    if (t.type === 'unit') return s + '1';
    if (t.type === 'x') return s + 'x';
    if (t.type === 'x2') return s + 'x²';
    return '';
  };

  // ---------- 팔레트 버튼 글자(라벨) 모드에 따라 변경 ----------
  const updatePaletteLabels = () => {
    const setBtn = (selector, text) => {
      const el = document.querySelector(selector);
      if (el) el.textContent = text;
    };

    if (mode === 'x') {
      setBtn('[data-add="x2:+1"]', '+x²');
      setBtn('[data-add="x2:-1"]', '-x²');
      setBtn('[data-add="x:+1"]',  '+x (세로)');
      setBtn('[data-add="xH:+1"]', '+x (가로)');
      setBtn('[data-add="x:-1"]',  '-x (세로)');
      setBtn('[data-add="xH:-1"]', '-x (가로)');
      setBtn('[data-add="unit:+1"]', '+1');
      setBtn('[data-add="unit:-1"]', '-1');
    } else {
      // square 모드: 같은 버튼을 a²/ab/b²로 보이게
      setBtn('[data-add="x2:+1"]', 'a²');
      //setBtn('[data-add="x2:-1"]', 'a²(삭제용)'); // 음수는 사실 면적모델에선 안 쓰지만, 기존 기능 유지용
      setBtn('[data-add="x:+1"]',  'ab (세로)');
      setBtn('[data-add="x:-1"]',  'ab(세로·삭제용)');
      setBtn('[data-add="xH:+1"]', 'ab (가로)');
      setBtn('[data-add="xH:-1"]', 'ab(가로·삭제용)');
      setBtn('[data-add="unit:+1"]', 'b²');
      setBtn('[data-add="unit:-1"]', 'b²(삭제용)');
    }
  };


  // ---------- 수식 계산 (x 모드용: 기존 유지) ----------
  const computeExprX = () => {
    let a = 0, b = 0, c = 0;
    for (const t of tiles) {
      if (t.type === 'x2') a += t.sign;
      if (t.type === 'x') b += t.sign;
      if (t.type === 'unit') c += t.sign;
    }
    return { a, b, c };
  };

  const formatExprX = ({ a, b, c }) => {
    const parts = [];
    const pushTerm = (coef, sym) => {
      if (coef === 0) return;
      const sign = coef > 0 ? '+' : '−';
      const abs = Math.abs(coef);
      const mag = (abs === 1 && sym !== '') ? '' : String(abs);
      parts.push({ sign, text: mag + sym });
    };

    pushTerm(a, 'x²');
    pushTerm(b, 'x');
    pushTerm(c, '');

    if (parts.length === 0) return '0';

    return parts.map((p, i) => {
      if (i === 0) return (p.sign === '+' ? '' : '−') + p.text;
      return ` ${p.sign} ${p.text}`;
    }).join('');
  };

  // ---------- 수식 계산 (square 모드용) ----------
  // square 모드에서는 "개수"로만 의미를 읽는다(부호는 무시)
  const computeExprSquare = () => {
    let a2 = 0, ab = 0, b2 = 0;
    for (const t of tiles) {
      if (t.type === 'x2') a2 += 1;    // a^2
      if (t.type === 'x') ab += 1;     // ab
      if (t.type === 'unit') b2 += 1;  // b^2
    }
    return { a2, ab, b2 };
  };

  // (a+b)^2 완성 판정(간단하지만 핵심만)
  // - 정사각형(가로=세로)이고
  // - 빈틈/겹침 없이 채워졌고
  // - 조각 개수가 (a^2=1, ab=2, b^2=1)이면 "표준 완성"으로 표시
  const checkSquareCompletion = () => {
    if (mode !== 'square') return { ok: false, msg: '' };
    if (tiles.length === 0) return { ok: false, msg: '' };

    // bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tiles) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + t.w);
      maxY = Math.max(maxY, t.y + t.h);
    }
    const W = maxX - minX;
    const H = maxY - minY;
    if (W <= 0 || H <= 0) return { ok: false, msg: '' };
    if (W !== H) return { ok: false, msg: '아직 정사각형이 아닙니다.' };
    if (W % grid !== 0) return { ok: false, msg: '격자에 맞춰 배치하세요.' };

    const cols = W / grid;
    const rows = H / grid;
    const filled = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (const t of tiles) {
      const sx = (t.x - minX) / grid;
      const sy = (t.y - minY) / grid;
      const cw = t.w / grid;
      const ch = t.h / grid;

      if (![sx, sy, cw, ch].every(Number.isInteger)) {
        return { ok: false, msg: '격자에 맞춰 배치하세요.' };
      }

      for (let r = sy; r < sy + ch; r++) {
        for (let c = sx; c < sx + cw; c++) {
          if (r < 0 || r >= rows || c < 0 || c >= cols) return { ok: false, msg: '' };
          if (filled[r][c]) return { ok: false, msg: '겹치는 타일이 있습니다.' };
          filled[r][c] = true;
        }
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!filled[r][c]) return { ok: false, msg: '빈틈이 있습니다.' };
      }
    }

    const { a2, ab, b2 } = computeExprSquare();
    if (a2 === 1 && ab === 2 && b2 === 1) {
      return { ok: true, msg: '✅ (a+b)² 완성!  a² + 2ab + b²' };
    }
    return { ok: true, msg: '✅ 정사각형은 완성! (조각 개수를 확인해보세요)' };
  };

  // ---------- 상단 표시 ----------
  const updateTopbar = () => {
    if (mode === 'square') {
      const { a2, ab, b2 } = computeExprSquare();
      // 표시를 조금 더 수학적으로
      exprEl.textContent = `식: ${formatExprSquare({ a2, ab, b2 })}`;
      countEl.textContent = `타일 ${tiles.length}개 (a²:${a2}, ab:${ab}, b²:${b2})`;

      // 상태 메시지는 target input을 방해하지 않게 count 뒤에 붙이지 않고,
      // 목표식 입력칸에 직접 쓰셔도 되고, 여기서는 title에만 살짝 보여줌
      const chk = checkSquareCompletion();
      ws.title = chk.msg || '';
      return;
    }

    const { a, b, c } = computeExprX();
    exprEl.textContent = `식: ${formatExprX({ a, b, c })}`;
    countEl.textContent = `타일 ${tiles.length}개 (x²:${a}, x:${b}, 1:${c})`;
    ws.title = '';
  };

  // ---------- 선택 표시만 갱신(전체 render 금지) ----------
  const setSelected = (id, el) => {
    selectedId = id;
    document.querySelectorAll('.tile.selected').forEach(n => n.classList.remove('selected'));
    if (el) el.classList.add('selected');
  };

  // ---------- 타일 생성 ----------
  const addTile = (typeKey, sign) => {
    let type = typeKey; // unit | x | x2 | xH
    let orient = 'v';

    if (typeKey === 'xH') {
      type = 'x';
      orient = 'h';
    }

    const { w, h } = sizeByType(type, orient);
    const t = {
      id: newId(),
      type,
      orient,
      sign: sign > 0 ? 1 : -1,
      x: snap(40),
      y: snap(40),
      w,
      h
    };

    pushUndo();
    tiles.push(t);
    selectedId = t.id;
    render();
  };

  // ---------- 드래그(마우스+터치) ----------
  function makeDraggable(el, t) {
    const getPoint = (e) => {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    const onDown = (e) => {
      if (e.touches && e.touches.length > 1) return;

      e.preventDefault();
      setSelected(t.id, el);

      const prevZ = el.style.zIndex;
      el.style.zIndex = '999';

      const start = getPoint(e);
      const origX = t.x;
      const origY = t.y;

      // 이동 undo 판단용
      const startX0 = t.x;
      const startY0 = t.y;

      const onMove = (ev) => {
        if (ev.touches && ev.touches.length > 1) return;
        ev.preventDefault();
        const p = getPoint(ev);
        const dx = p.x - start.x;
        const dy = p.y - start.y;

        t.x = snap(origX + dx);
        t.y = snap(origY + dy);

        t.x = clamp(t.x, 0, ws.clientWidth - t.w);
        t.y = clamp(t.y, 0, ws.clientHeight - t.h);

        el.style.left = t.x + 'px';
        el.style.top = t.y + 'px';
      };

      const onUp = () => {
        el.style.zIndex = prevZ;

        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);

        // ✅ 실제로 움직였으면 undo 기록
        if (t.x !== startX0 || t.y !== startY0) pushUndo();

        updateTopbar();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
  }

  // ---------- 렌더 ----------
  const render = () => {
    ws.innerHTML = '';

    for (const t of tiles) {
      // ✅ 모드가 바뀌면 기존 타일의 w/h도 바뀌어야 함 (가장 중요!)
      const wh = sizeByType(t.type, t.orient);
      t.w = wh.w;
      t.h = wh.h;

      // 화면 밖으로 나가면 살짝 보정
      t.x = clamp(t.x, 0, ws.clientWidth - t.w);
      t.y = clamp(t.y, 0, ws.clientHeight - t.h);

      const el = document.createElement('div');
      el.className = `tile ${t.sign > 0 ? 'pos' : 'neg'} ${t.id === selectedId ? 'selected' : ''}`;
      el.style.left = t.x + 'px';
      el.style.top = t.y + 'px';
      el.style.width = t.w + 'px';
      el.style.height = t.h + 'px';
      el.textContent = tileLabel(t);
      el.dataset.id = t.id;

      makeDraggable(el, t);
      ws.appendChild(el);
    }

    updateTopbar();
  };

  // ---------- 팔레트 버튼 연결 ----------
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [type, s] = btn.dataset.add.split(':');
      addTile(type, Number(s));
    });
  });

  // ---------- 정리(자동 정렬) ----------
  const btnArrange = document.getElementById('btnArrange');
  if (btnArrange) {
    btnArrange.addEventListener('click', () => {
      pushUndo();

      const order = { x2: 0, x: 1, unit: 2 };
      tiles.sort((p, q) => {
        const a = order[p.type] - order[q.type];
        if (a !== 0) return a;
        const b = (q.sign - p.sign);
        if (b !== 0) return b;
        return (p.orient === 'h' ? 1 : 0) - (q.orient === 'h' ? 1 : 0);
      });

      let x = grid, y = grid;
      const margin = grid;

      for (const t of tiles) {
        const wh = sizeByType(t.type, t.orient);
        t.w = wh.w;
        t.h = wh.h;

        t.x = x;
        t.y = y;

        x += t.w + margin;
        if (x + t.w > ws.clientWidth) {
          x = grid;
          y += 10 * grid;
        }
      }

      render();
    });
  }

  // ---------- 전체 삭제 ----------
  const btnClear = document.getElementById('btnClear');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      pushUndo();
      tiles = [];
      selectedId = null;
      render();
    });
  }

  // ---------- Delete/Backspace로 삭제 ----------
  window.addEventListener('keydown', (e) => {
    // Undo 단축키는 아래 별도 핸들러가 있어서 여기서 건드리지 않음
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      pushUndo();
      tiles = tiles.filter(t => t.id !== selectedId);
      selectedId = null;
      render();
    }
  });

  // ---------- 빈 곳 클릭하면 선택 해제 ----------
  ws.addEventListener('mousedown', (e) => {
    if (e.target === ws) setSelected(null, null);
  });
  ws.addEventListener('touchstart', (e) => {
    if (e.target === ws) setSelected(null, null);
  }, { passive: true });

  // ---------- 목표/설명 입력칸: 로컬 저장 ----------
  if (targetEl) {
    const key = 'algebra_tiles_target_text';
    const saved = localStorage.getItem(key);
    if (saved !== null) targetEl.value = saved;

    targetEl.addEventListener('input', () => {
      localStorage.setItem(key, targetEl.value);
    });
  }

  // ---------- Undo 버튼 ----------
  const btnUndo = document.getElementById('btnUndo');
  if (btnUndo) btnUndo.addEventListener('click', undo);

  // Ctrl+Z / Cmd+Z
  window.addEventListener('keydown', (e) => {
    const isZ = (e.key === 'z' || e.key === 'Z');
    const isUndoKey = isZ && (e.ctrlKey || e.metaKey);
    if (isUndoKey) {
      e.preventDefault();
      undo();
    }
  });

  // ---------- 모드 전환 버튼 ----------
  const btnToggleMode = document.getElementById('btnToggleMode');
  if (btnToggleMode) {
    btnToggleMode.addEventListener('click', () => {
      pushUndo();
      mode = (mode === 'x') ? 'square' : 'x';
      updatePaletteLabels();

      // ✅ 모드 전환 시 기존 타일을 유지하면서 의미/크기/라벨만 바뀌게
      // (원하면 tiles=[]로 초기화도 가능하지만, 지금 요청은 "유지" 쪽이 더 자연스러움)
      render();
    });
  }

  // square 모드용(1은 생략, 0은 항 제거)
  const formatExprSquare = ({ a2, ab, b2 }) => {
    const parts = [];
    const pushTerm = (coef, sym) => {
      if (coef === 0) return;
      // square 모드는 음수 계수 없음(개수), 그래도 형태는 동일하게
      const sign = '+';
      const abs = Math.abs(coef);
      const mag = (abs === 1) ? '' : String(abs);
      parts.push({ sign, text: mag + sym });
    };

    pushTerm(a2, 'a²');
    pushTerm(ab, 'ab');
    pushTerm(b2, 'b²');

    if (parts.length === 0) return '0';

    // 첫 항은 + 생략
    return parts.map((p, i) => (i === 0 ? '' : ' + ') + p.text).join('');
  };


  // 최초 렌더
  updatePaletteLabels();
  render();
})();
