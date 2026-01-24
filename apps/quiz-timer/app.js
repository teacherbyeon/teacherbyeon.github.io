(() => {
  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

  // WebAudio beep (no external file)
  const beep = (freq = 880, ms = 120) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.0001;
      o.start();

      const now = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);

      setTimeout(() => {
        o.stop();
        ctx.close();
      }, ms + 80);
    } catch {
      // ignore
    }
  };

  // ---------- State ----------
  const LS_KEY = "quiz_timer_v1";
  const load = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch { return {}; }
  };
  const save = (patch) => {
    const cur = load();
    const next = { ...cur, ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    return next;
  };

  let settings = load();
  let base = clamp(Number(settings.baseSeconds ?? 180), 5, 60 * 60);
  let remaining = clamp(Number(settings.remaining ?? base), 0, 60 * 60);
  let running = false;
  let lastTick = null;

  let hintVisible = Boolean(settings.hintVisible ?? false);
  let optBeepEnd = Boolean(settings.optBeepEnd ?? true);
  let optBeep10 = Boolean(settings.optBeep10 ?? false);

  // Beep control so 10s warning doesn't repeat
  let didBeep10 = false;
  let didBeepEnd = false;

  // ---------- Elements ----------
  const timeText = $("#timeText");
  const stateText = $("#stateText");
  const timerArea = $(".timerArea");

  const promptText = $("#promptText");
  const hintText = $("#hintText");

  const panel = $("#panel");
  const scrim = $("#scrim");
  const btnPanel = $("#btnPanel");
  const btnClosePanel = $("#btnClosePanel");

  const btnStartPause = $("#btnStartPause");
  const btnReset = $("#btnReset");

  const baseSeconds = $("#baseSeconds");
  const btnApplyBase = $("#btnApplyBase");

  const promptInput = $("#promptInput");
  const hintInput = $("#hintInput");
  const btnApplyText = $("#btnApplyText");
  const btnToggleHint = $("#btnToggleHint");

  const optBeepEndEl = $("#optBeepEnd");
  const optBeep10El = $("#optBeep10");

  const btnFullscreen = $("#btnFullscreen");

  // ---------- Init UI from storage ----------
  const initText = () => {
    const p = settings.promptText ?? "문제를 풀어보세요.";
    const h = settings.hintText ?? "";
    promptText.textContent = p;
    promptInput.value = p;
    hintInput.value = h;
    hintText.textContent = hintVisible ? h : "";
  };

  const initOptions = () => {
    baseSeconds.value = String(base);
    optBeepEndEl.checked = optBeepEnd;
    optBeep10El.checked = optBeep10;
  };

  // ---------- Panel ----------
  const openPanel = () => {
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    btnPanel.setAttribute("aria-expanded", "true");
    scrim.hidden = false;
  };
  const closePanel = () => {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    btnPanel.setAttribute("aria-expanded", "false");
    scrim.hidden = true;
  };
  const togglePanel = () => (panel.classList.contains("open") ? closePanel() : openPanel());

  // ---------- Timer Logic ----------
  const setRunning = (next) => {
    running = next;
    lastTick = performance.now();
    btnStartPause.textContent = running ? "일시정지" : "시작";
    stateText.textContent = running ? "진행중" : "준비/일시정지";
  };

  const applyVisual = () => {
    timerArea.classList.remove("warn", "danger");
    if (remaining <= 10 && remaining > 0) timerArea.classList.add("danger");
    else if (remaining <= 30 && remaining > 0) timerArea.classList.add("warn");
    if (remaining <= 0) timerArea.classList.add("danger");
  };

  const render = () => {
    timeText.textContent = fmt(remaining);
    applyVisual();
  };

  const resetBeepFlags = () => {
    didBeep10 = false;
    didBeepEnd = false;
  };

  const resetToBase = () => {
    remaining = base;
    save({ baseSeconds: base, remaining });
    render();
    resetBeepFlags();
    stateText.textContent = "준비";
  };

  const addSeconds = (delta) => {
    remaining = clamp(remaining + delta, 0, 60 * 60);
    save({ remaining });
    render();
  };

  const tick = (t) => {
    if (!running) return;
    const now = t ?? performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    remaining -= dt;

    // 10-second warning beep (once)
    if (optBeep10 && !didBeep10 && remaining <= 10 && remaining > 9.2) {
      didBeep10 = true;
      beep(740, 120);
    }

    // End handling
    if (remaining <= 0) {
      remaining = 0;
      setRunning(false);
      if (optBeepEnd && !didBeepEnd) {
        didBeepEnd = true;
        beep(880, 180);
        setTimeout(() => beep(660, 180), 220);
      }
      stateText.textContent = "종료";
    }

    save({ remaining });
    render();

    requestAnimationFrame(tick);
  };

  // ---------- Fullscreen ----------
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  // ---------- Events ----------
  btnPanel.addEventListener("click", togglePanel);
  btnClosePanel.addEventListener("click", closePanel);
  scrim.addEventListener("click", closePanel);

  btnStartPause.addEventListener("click", () => {
    if (remaining <= 0) resetToBase();
    setRunning(!running);
    resetBeepFlags();
    if (running) requestAnimationFrame(tick);
  });

  // "길게 눌러 리셋" UX
  let resetHoldTimer = null;
  const startHold = () => {
    resetHoldTimer = setTimeout(() => {
      setRunning(false);
      resetToBase();
    }, 650);
  };
  const cancelHold = () => {
    if (resetHoldTimer) clearTimeout(resetHoldTimer);
    resetHoldTimer = null;
  };
  btnReset.addEventListener("mousedown", startHold);
  btnReset.addEventListener("touchstart", startHold, { passive: true });
  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((ev) =>
    btnReset.addEventListener(ev, cancelHold)
  );

  // 시간 조정 프리셋
  document.querySelectorAll("[data-add]").forEach((b) => {
    b.addEventListener("click", () => {
      const delta = Number(b.getAttribute("data-add"));
      addSeconds(delta);
    });
  });

  btnApplyBase.addEventListener("click", () => {
    const v = clamp(Number(baseSeconds.value || 0), 5, 60 * 60);
    base = v;
    // 현재 남은 시간이 "기본 시간"보다 길게 필요없으면 보통 기본으로 맞추는 편이 자연스러움
    remaining = v;
    settings = save({ baseSeconds: base, remaining });
    render();
    resetBeepFlags();
  });

  btnApplyText.addEventListener("click", () => {
    const p = (promptInput.value || "").trim() || "문제를 풀어보세요.";
    const h = (hintInput.value || "").trim();
    settings = save({ promptText: p, hintText: h });
    promptText.textContent = p;
    hintText.textContent = hintVisible ? h : "";
  });

  btnToggleHint.addEventListener("click", () => {
    hintVisible = !hintVisible;
    settings = save({ hintVisible });
    const h = (hintInput.value || "").trim();
    hintText.textContent = hintVisible ? h : "";
  });

  optBeepEndEl.addEventListener("change", () => {
    optBeepEnd = optBeepEndEl.checked;
    settings = save({ optBeepEnd });
  });
  optBeep10El.addEventListener("change", () => {
    optBeep10 = optBeep10El.checked;
    settings = save({ optBeep10 });
  });

  btnFullscreen.addEventListener("click", toggleFullscreen);

  // 단축키
  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    const typing = tag === "input" || tag === "textarea";
    if (typing) return;

    if (e.key === " ") {
      e.preventDefault();
      btnStartPause.click();
    } else if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      setRunning(false);
      resetToBase();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      addSeconds(10);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      addSeconds(-10);
    } else if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === "Escape") {
      closePanel();
    }
  });

  // ---------- Boot ----------
  // storage refresh (in case it changed)
  settings = load();
  base = clamp(Number(settings.baseSeconds ?? 180), 5, 60 * 60);
  remaining = clamp(Number(settings.remaining ?? base), 0, 60 * 60);
  hintVisible = Boolean(settings.hintVisible ?? false);
  optBeepEnd = Boolean(settings.optBeepEnd ?? true);
  optBeep10 = Boolean(settings.optBeep10 ?? false);

  initText();
  initOptions();
  render();
})();
