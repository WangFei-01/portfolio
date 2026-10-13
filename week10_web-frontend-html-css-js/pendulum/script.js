/* =============================================================
 * 单摆模拟器 · 脚本
 * ---------------------------------------------------------------
 *  · RK4 数值积分物理
 *  · Canvas 2D 渲染
 *  · 4 个天体预设按钮 → easeInOutCubic 平滑过渡重力
 *  · localStorage 自动保存 + 启动恢复 (防御性 JSON 反序列化)
 *  · RAF 动画循环 + DPR / ResizeObserver 自适应
 *  · 触屏友好 (touch-action: none)
 * ============================================================= */
(() => {
  "use strict";

  // ───────────── 常量 & 默认值 ─────────────
  const STORAGE_KEY = "pendulum.config.v1";
  const TRANSITION_MS = 600;

  const SCENES = Object.freeze({
    earth:   { g: 9.81,  label: "地球" },
    moon:    { g: 1.62,  label: "月球" },
    jupiter: { g: 24.79, label: "木星" },
    space:   { g: 0.20,  label: "太空" },
  });

  const DEFAULTS = Object.freeze({
    g: 9.81,
    L: 1.5,
    damping: 0.05,
    theta0: (28 * Math.PI) / 180,
    paused: false,
    activeScene: "earth",
  });

  const SLIDER_BOUNDS = Object.freeze({
    g:     { min: 0,    max: 30,   step: 0.01  },
    L:     { min: 0.3,  max: 3,    step: 0.01  },
    d:     { min: 0,    max: 0.5,  step: 0.005 },
    theta: { min: 0,    max: 89,   step: 0.5   },
  });

  // ───────────── 持久化 ─────────────
  function loadConfig() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[pendulum] localStorage 读取或 JSON 解析失败, 回退到默认配置:", err);
    }
    const out = { ...DEFAULTS };
    if (parsed && typeof parsed === "object") {
      for (const k of Object.keys(DEFAULTS)) {
        if (k === "activeScene") {
          if (Object.prototype.hasOwnProperty.call(SCENES, parsed[k])) {
            out.activeScene = parsed[k];
          }
        } else {
          const v = parsed[k];
          if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
        }
      }
    }
    return out;
  }

  let saveTimer = null;
  function persistDebounced(now) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          g: state.g,
          L: state.L,
          damping: state.damping,
          theta: state.theta,
          paused: state.paused,
          activeScene: state.activeScene,
        }));
        statusEl.textContent = "已自动保存 · " + new Date().toLocaleTimeString();
      } catch (err) {
        console.warn("[pendulum] localStorage 写入失败:", err);
        statusEl.textContent = "⚠️ 保存失败 (无痕模式?)";
      }
    }, 200);
  }

  // ───────────── State ─────────────
  const state = {
    g: DEFAULTS.g,
    L: DEFAULTS.L,
    damping: DEFAULTS.damping,
    theta: DEFAULTS.theta0,
    omega: 0,
    paused: DEFAULTS.paused,
    activeScene: DEFAULTS.activeScene,
  };

  // smooth g transition (eased lerp)
  const transition = { active: false, from: 0, to: 0, start: 0, duration: TRANSITION_MS };

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function startTransition(targetG) {
    transition.active = true;
    transition.from = state.g;
    transition.to = targetG;
    transition.start = performance.now();
    transition.duration = TRANSITION_MS;
  }

  function tickTransition(now) {
    if (!transition.active) return;
    const t = Math.min(1, (now - transition.start) / transition.duration);
    state.g = transition.from + (transition.to - transition.from) * easeInOutCubic(t);
    syncGSlider();
    syncLegend();
    if (t >= 1) transition.active = false;
  }

  // ───────────── DOM ─────────────
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const canvas   = $("#canvas");
  const ctx      = canvas.getContext("2d");

  const sliders  = {
    g:     $("#g-slider"),
    L:     $("#L-slider"),
    d:     $("#d-slider"),
    theta: $("#theta-slider"),
  };

  const displays = {
    g:     document.querySelector('[data-display="g"]'),
    L:     document.querySelector('[data-display="L"]'),
    d:     document.querySelector('[data-display="d"]'),
    theta: document.querySelector('[data-display="theta"]'),
  };

  const legendEls = {
    g:     $("#legend-g"),
    L:     $("#legend-L"),
    theta: $("#legend-theta"),
  };

  const capsules   = $$('.capsule');
  const toggleBtn  = $("#toggle-btn");
  const resetBtn   = $("#reset-btn");
  const clearBtn   = $("#clear-btn");
  const statusEl   = $("#status");

  // ───────────── DPR & Resize ─────────────
  function resize() {
    const dpr  = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    canvas.width  = Math.floor(rect.width  * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));

  // ───────────── UI sync ─────────────
  function syncGSlider() {
    sliders.g.value = state.g;
    displays.g.textContent = state.g.toFixed(2);
    if (legendEls.g) legendEls.g.textContent = state.g.toFixed(2);
  }

  function syncActiveScene() {
    capsules.forEach(c => {
      const isActive = c.dataset.scene === state.activeScene;
      c.setAttribute("aria-checked", String(isActive));
    });
  }

  function syncAllUI() {
    sliders.g.value     = state.g;
    sliders.L.value     = state.L;
    sliders.d.value     = state.damping;
    sliders.theta.value = (state.theta * 180) / Math.PI;
    displays.g.textContent     = state.g.toFixed(2);
    displays.L.textContent     = state.L.toFixed(2);
    displays.d.textContent     = state.damping.toFixed(3);
    displays.theta.textContent = ((state.theta * 180) / Math.PI).toFixed(0);
    if (legendEls.g)     legendEls.g.textContent     = state.g.toFixed(2);
    if (legendEls.L)     legendEls.L.textContent     = state.L.toFixed(2);
    if (legendEls.theta) legendEls.theta.textContent = ((state.theta * 180) / Math.PI).toFixed(0);
    toggleBtn.textContent = state.paused ? "▶ 继续" : "⏸ 暂停";
    toggleBtn.classList.toggle("is-paused", state.paused);
    syncActiveScene();
  }

  // ───────────── Event Wiring ─────────────
  sliders.g.addEventListener("input", () => {
    state.g = parseFloat(sliders.g.value);
    transition.active = false;       // 取消任何进行中的过渡
    state.activeScene = "custom";    // 标记为自定义
    syncGSlider();
    syncActiveScene();
    persistDebounced();
  });

  sliders.L.addEventListener("input", () => {
    state.L = parseFloat(sliders.L.value);
    displays.L.textContent = state.L.toFixed(2);
    if (legendEls.L) legendEls.L.textContent = state.L.toFixed(2);
    persistDebounced();
  });

  sliders.d.addEventListener("input", () => {
    state.damping = parseFloat(sliders.d.value);
    displays.d.textContent = state.damping.toFixed(3);
    persistDebounced();
  });

  sliders.theta.addEventListener("input", () => {
    state.theta = (parseFloat(sliders.theta.value) * Math.PI) / 180;
    state.omega = 0;
    displays.theta.textContent = parseFloat(sliders.theta.value).toFixed(0);
    if (legendEls.theta) legendEls.theta.textContent = parseFloat(sliders.theta.value).toFixed(0);
    persistDebounced();
  });

  capsules.forEach(c => c.addEventListener("click", () => {
    const scene = c.dataset.scene;
    if (!Object.prototype.hasOwnProperty.call(SCENES, scene)) return;
    state.activeScene = scene;
    startTransition(SCENES[scene].g);
    syncActiveScene();
    persistDebounced();
  }));

  toggleBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    toggleBtn.textContent = state.paused ? "▶ 继续" : "⏸ 暂停";
    toggleBtn.classList.toggle("is-paused", state.paused);
    persistDebounced();
  });

  resetBtn.addEventListener("click", () => {
    Object.assign(state, {
      g: DEFAULTS.g,
      L: DEFAULTS.L,
      damping: DEFAULTS.damping,
      theta: DEFAULTS.theta0,
      omega: 0,
      paused: false,
      activeScene: "earth",
    });
    transition.active = false;
    syncAllUI();
    persistDebounced();
  });

  clearBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("[pendulum] 清缓存失败:", err);
    }
    Object.assign(state, {
      g: DEFAULTS.g,
      L: DEFAULTS.L,
      damping: DEFAULTS.damping,
      theta: DEFAULTS.theta0,
      omega: 0,
      paused: false,
      activeScene: "earth",
    });
    transition.active = false;
    syncAllUI();
    statusEl.textContent = "已清空本地缓存，使用默认值";
  });

  // 同步滑块 step/min/max 以便即便 span 调整也始终合法
  Object.entries(SLIDER_BOUNDS).forEach(([k, b]) => {
    const input = ({ g: sliders.g, L: sliders.L, d: sliders.d, theta: sliders.theta })[k];
    if (!input) return;
    input.min = b.min; input.max = b.max; input.step = b.step;
  });

  // ───────────── Physics (RK4) ─────────────
  function derivs(theta, omega) {
    return {
      dTheta: omega,
      dOmega: -(state.g / state.L) * Math.sin(theta) - state.damping * omega,
    };
  }

  function stepRK4(dt) {
    const { theta, omega } = state;
    const k1 = derivs(theta,                          omega);
    const k2 = derivs(theta + k1.dTheta * dt / 2,      omega + k1.dOmega * dt / 2);
    const k3 = derivs(theta + k2.dTheta * dt / 2,      omega + k2.dOmega * dt / 2);
    const k4 = derivs(theta + k3.dTheta * dt,          omega + k3.dOmega * dt);
    state.theta = theta + (k1.dTheta + 2*k2.dTheta + 2*k3.dTheta + k4.dTheta) * dt / 6;
    state.omega = omega + (k1.dOmega + 2*k2.dOmega + 2*k3.dOmega + k4.dOmega) * dt / 6;
  }

  // ───────────── Render ─────────────
  const trail = []; // 最多 80 个轨迹点
  const TRAIL_MAX = 80;

  function render(now) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    // 网格
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 40) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const pivotX = w / 2;
    const pivotY = Math.min(60, h * 0.10);
    const pxPerMeter = Math.min(w * 0.36, h * 0.55) / 2;

    const bobX = pivotX + state.L * pxPerMeter * Math.sin(state.theta);
    const bobY = pivotY + state.L * pxPerMeter * Math.cos(state.theta);

    // trail
    if (trail.length > 1) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }

    if (!state.paused) {
      trail.push({ x: bobX, y: bobY });
      if (trail.length > TRAIL_MAX) trail.shift();
    }

    // rod
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    // pivot
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    ctx.fill();

    // bob (active scene accent, slight pulse based on g)
    const accent = SCENES[state.activeScene] ? "var(--accent, #38bdf8)" : "#a78bfa";
    ctx.fillStyle = accent;
    ctx.shadowColor = "rgba(56,189,248,0.55)";
    ctx.shadowBlur = 18 + Math.abs(state.g) * 0.3;
    ctx.beginPath();
    ctx.arc(bobX, bobY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ───────────── Animation loop ─────────────
  let lastTime = performance.now();

  function animate(now) {
    tickTransition(now);

    if (!state.paused) {
      // 子步进: 当 dt 较大时切成多个更小的 dt, 保持数值稳定
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      const sub = Math.max(1, Math.ceil(dt / 0.005));
      const subDt = dt / sub;
      for (let i = 0; i < sub; i++) stepRK4(subDt);
    }
    lastTime = now;

    render(now);
    requestAnimationFrame(animate);
  }

  // ───────────── Boot ─────────────
  const cfg = loadConfig();
  Object.assign(state, {
    g: cfg.g,
    L: cfg.L,
    damping: cfg.damping,
    theta: cfg.theta,
    omega: 0,
    paused: !!cfg.paused,
    activeScene: cfg.activeScene && SCENES[cfg.activeScene] ? cfg.activeScene : "earth",
  });

  syncAllUI();
  statusEl.textContent = "✅ 已从本地缓存恢复上次参数";

  // 等一帧让 layout 完成, 再开始 RAF
  requestAnimationFrame((t) => {
    lastTime = t;
    resize();
    requestAnimationFrame(animate);
  });

  // 暴露: 调试 + 自动化测试
  window.__pendulum = { state, SCENES, loadConfig, resetConfig: () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  } };
})();
