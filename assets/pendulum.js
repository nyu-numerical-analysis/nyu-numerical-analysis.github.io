// Background animation: a few double pendulums started from almost the same
// state, integrated with RK4. They move together at first, then chaos sets in
// and they separate; the system restarts periodically from a new state.
// They sit in the empty band right of the main text, below the table of
// contents, and are hidden when that band is too small. Clicking gives them a kick.
(function () {
  "use strict";

  const opts = Object.assign({
    count: 3,          // number of pendulums
    spread: 1e-3,      // difference between initial angles (rad)
    speed: 1.6,        // simulated time per second
    trail: 240,        // trail length (frames)
    restartEvery: 45,  // seconds between restarts (0 = never)
    maxLength: 60,     // arm length bounds (px)
    minLength: 25,
    content: "main.content", // elements that the pendulums must avoid
    toc: "#TOC",
    header: "#quarto-header",
    // Fallback when there is no main content (e.g. a test page): pivot as a
    // fraction of the viewport and arm length as a fraction of min(W, H)
    pivot: [0.5, 0.42],
    length: 0.1,
  }, window.PENDULUM_OPTIONS || {});

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  canvas.className = "pendulum-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let W, H, colors, pendulums, started, geom;

  function readColors() {
    const s = getComputedStyle(document.body);
    const get = (name, fallback) => (s.getPropertyValue(name).trim() || fallback);
    colors = {
      arm: get("--pendulum-arm-rgb", "120, 130, 150"),
      bobs: ["87, 6, 140", "0, 130, 160", "220, 110, 0"].map((rgb, i) => get(`--pendulum-${i + 1}-rgb`, rgb)),
      alpha: parseFloat(get("--pendulum-alpha", "0.6")),
    };
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = document.documentElement.clientWidth;
    H = document.documentElement.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  // geom = { x0, y0, l }: pivot and arm length, or null when hidden
  function layout() {
    const main = document.querySelector(opts.content);
    if (!main) {
      geom = { x0: opts.pivot[0] * W, y0: opts.pivot[1] * H, l: opts.length * Math.min(W, H) };
      return;
    }
    const bottomOf = (sel) => {
      const el = document.querySelector(sel);
      return el && el.offsetParent ? el.getBoundingClientRect().bottom : 0;
    };
    const left = main.getBoundingClientRect().right;
    const top = Math.max(0, bottomOf(opts.header), bottomOf(opts.toc));
    // The lower bob reaches 2l from the pivot in every direction
    const l = Math.min(opts.maxLength, (W - left) / 4.6, (H - top) / 4.6);
    geom = l < opts.minLength ? null : { x0: left + (W - left) / 2, y0: top + (H - top) / 2, l };
  }

  // Equal masses and lengths, g = l = 1: state [θ1, θ2, ω1, ω2]
  function rhs([t1, t2, w1, w2]) {
    const d = t1 - t2, den = 3 - Math.cos(2 * d);
    const a1 = (-3 * Math.sin(t1) - Math.sin(t1 - 2 * t2)
                - 2 * Math.sin(d) * (w2 * w2 + w1 * w1 * Math.cos(d))) / den;
    const a2 = 2 * Math.sin(d) * (2 * w1 * w1 + 2 * Math.cos(t1) + w2 * w2 * Math.cos(d)) / den;
    return [w1, w2, a1, a2];
  }

  function rk4(y, h) {
    const k1 = rhs(y);
    const k2 = rhs(y.map((v, i) => v + h / 2 * k1[i]));
    const k3 = rhs(y.map((v, i) => v + h / 2 * k2[i]));
    const k4 = rhs(y.map((v, i) => v + h * k3[i]));
    return y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }

  function restart(t) {
    // High-energy start so that the motion is chaotic
    const t1 = (0.6 + 0.3 * Math.random()) * Math.PI * (Math.random() < 0.5 ? -1 : 1);
    const t2 = (0.5 + 0.5 * Math.random()) * Math.PI * (Math.random() < 0.5 ? -1 : 1);
    pendulums = Array.from({ length: opts.count }, (_, k) => ({
      y: [t1, t2 + k * opts.spread, 0, 0], trail: [],
    }));
    started = t;
  }

  function kick() {
    for (const p of pendulums) { p.y[2] += 1.5; p.y[3] -= 1.5; }
  }

  function positions(y) {
    const { x0, y0, l } = geom;
    const x1 = x0 + l * Math.sin(y[0]), y1 = y0 + l * Math.cos(y[0]);
    return [x0, y0, x1, y1, x1 + l * Math.sin(y[1]), y1 + l * Math.cos(y[1])];
  }

  function draw(fade) {
    ctx.clearRect(0, 0, W, H);
    if (!geom) return;
    const { x0, y0, l } = geom;
    const a = colors.alpha * fade;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    pendulums.forEach((p, k) => {
      const rgb = colors.bobs[k % colors.bobs.length];
      // Trail of the lower bob (in units of l from the pivot), fading with age
      const n = p.trail.length, chunks = 12;
      const tx = (i) => x0 + l * p.trail[i][0], ty = (i) => y0 + l * p.trail[i][1];
      ctx.lineWidth = 1.2;
      for (let c = 0; c < chunks; c++) {
        const i0 = Math.floor(c * (n - 1) / chunks), i1 = Math.floor((c + 1) * (n - 1) / chunks);
        if (i1 <= i0) continue;
        ctx.strokeStyle = `rgba(${rgb}, ${a * (c + 1) / chunks})`;
        ctx.beginPath();
        ctx.moveTo(tx(i0), ty(i0));
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(tx(i), ty(i));
        ctx.stroke();
      }
      const [, , x1, y1, x2, y2] = positions(p.y);
      ctx.strokeStyle = `rgba(${colors.arm}, ${a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, 1.6 * a)})`;
      for (const [bx, by] of [[x1, y1], [x2, y2]]) {
        ctx.beginPath(); ctx.arc(bx, by, Math.max(2.5, l / 15), 0, 2 * Math.PI); ctx.fill();
      }
    });
    ctx.fillStyle = `rgba(${colors.arm}, ${a})`;
    ctx.beginPath(); ctx.arc(x0, y0, 2, 0, 2 * Math.PI); ctx.fill();
  }

  let last = null, frame = 0;
  function loop(now) {
    const t = now / 1000;
    const frameDt = last === null ? 1 / 60 : Math.min(t - last, 1 / 30);
    last = t;
    if (opts.restartEvery > 0 && t - started > opts.restartEvery) restart(t);

    const nsub = 8, h = opts.speed * frameDt / nsub;
    for (const p of pendulums) {
      for (let s = 0; s < nsub; s++) p.y = rk4(p.y, h);
      const [t1, t2] = p.y;
      p.trail.push([Math.sin(t1) + Math.sin(t2), Math.cos(t1) + Math.cos(t2)]);
      if (p.trail.length > opts.trail) p.trail.shift();
    }
    if (++frame % 30 === 0) { readColors(); layout(); }

    // Fade in after a restart and out before the next one
    const age = t - started, left = opts.restartEvery > 0 ? opts.restartEvery - age : Infinity;
    draw(Math.min(1, age / 1.5, left / 1.5));
    requestAnimationFrame(loop);
  }

  window.addEventListener("pointerdown", () => { if (!reduceMotion) kick(); }, { passive: true });
  window.addEventListener("resize", () => { resize(); if (reduceMotion) draw(1); });
  window.addEventListener("scroll", () => { layout(); if (reduceMotion) draw(1); }, { passive: true });

  // Exposed for tuning from the console or a test page
  window.pendulum = { opts, restart: () => restart(performance.now() / 1000), kick };

  resize();
  readColors();
  restart(performance.now() / 1000);
  if (reduceMotion) draw(1);
  else requestAnimationFrame(loop);
})();
