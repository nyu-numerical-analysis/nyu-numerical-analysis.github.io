// Background animation: damped wave equation u_tt + γ u_t = c² Δu solved with
// P1 finite elements (lumped mass, leapfrog) on a jittered triangular mesh.
// The mouse forces the surface as it moves; a click drops a Gaussian bump.
(function () {
  "use strict";

  const opts = Object.assign({
    spacing: 34,      // mesh size h (CSS px)
    jitter: 0.22,     // node perturbation, fraction of h
    speed: 240,       // wave speed c (px/s)
    damping: 0.35,    // uniform damping γ (1/s)
    sponge: 3,        // extra damping near the viewport edges (1/s)
    bumpEvery: 6,     // seconds between spontaneous bumps (0 = never)
    bumpAmp: 1,
    bumpWidth: 1.8,   // Gaussian width, in units of h
    mouseGain: 0.05,
    mouseWidth: 1.5,  // forcing width, in units of h
    lift: 6,          // vertical displacement of nodes per unit of u (px)
    levels: 6,        // number of color buckets per sign
  }, window.FEM_WAVE_OPTIONS || {});

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.createElement("canvas");
  canvas.className = "fem-wave-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let W, H, N, x, y, u, uPrev, Ku, minv, gamma, ea, eb, ek, kd;
  let colors;
  let mouse = { x: -1e4, y: -1e4, speed: 0 };
  let lastBump = 0;

  function readColors() {
    const s = getComputedStyle(document.body);
    const rgb = (name, fallback) => (s.getPropertyValue(name).trim() || fallback);
    colors = {
      mesh: rgb("--fem-mesh-rgb", "120, 130, 150"),
      crest: rgb("--fem-crest-rgb", "87, 6, 140"),
      trough: rgb("--fem-trough-rgb", "30, 120, 200"),
      base: parseFloat(s.getPropertyValue("--fem-base-alpha")) || 0.14,
      peak: parseFloat(s.getPropertyValue("--fem-peak-alpha")) || 0.6,
    };
  }

  function build() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Nodes: rows offset by h/2, extending one cell beyond the viewport
    const h = opts.spacing, dy = h * Math.sqrt(3) / 2;
    const nx = Math.ceil(W / h) + 3, ny = Math.ceil(H / dy) + 3;
    N = nx * ny;
    x = new Float64Array(N); y = new Float64Array(N);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n = j * nx + i;
        x[n] = (i - 1) * h + (j % 2) * h / 2 + (Math.random() - 0.5) * 2 * opts.jitter * h;
        y[n] = (j - 1) * dy + (Math.random() - 0.5) * 2 * opts.jitter * h;
      }
    }

    const tris = [];
    const node = (j, i) => j * nx + i;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (j % 2 === 0) {
          tris.push([node(j, i), node(j, i + 1), node(j + 1, i)]);
          tris.push([node(j, i + 1), node(j + 1, i + 1), node(j + 1, i)]);
        } else {
          tris.push([node(j, i), node(j + 1, i + 1), node(j + 1, i)]);
          tris.push([node(j, i), node(j, i + 1), node(j + 1, i + 1)]);
        }
      }
    }

    // Assemble P1 stiffness (diagonal + one entry per edge) and lumped mass
    const mass = new Float64Array(N);
    kd = new Float64Array(N);
    const edges = new Map();
    for (const t of tris) {
      const [p, q, r] = t;
      const b = [y[q] - y[r], y[r] - y[p], y[p] - y[q]];
      const c = [x[r] - x[q], x[p] - x[r], x[q] - x[p]];
      const area = Math.abs((x[q] - x[p]) * (y[r] - y[p]) - (x[r] - x[p]) * (y[q] - y[p])) / 2;
      for (let a = 0; a < 3; a++) {
        mass[t[a]] += area / 3;
        kd[t[a]] += (b[a] * b[a] + c[a] * c[a]) / (4 * area);
        for (let e = a + 1; e < 3; e++) {
          const lo = Math.min(t[a], t[e]), hi = Math.max(t[a], t[e]);
          const key = lo * N + hi;
          edges.set(key, (edges.get(key) || 0) + (b[a] * b[e] + c[a] * c[e]) / (4 * area));
        }
      }
    }
    const ne = edges.size;
    ea = new Int32Array(ne); eb = new Int32Array(ne); ek = new Float64Array(ne);
    let k = 0;
    for (const [key, val] of edges) {
      ea[k] = Math.floor(key / N); eb[k] = key % N; ek[k] = val; k++;
    }

    minv = new Float64Array(N);
    gamma = new Float64Array(N);
    const band = 3 * h;
    for (let n = 0; n < N; n++) {
      minv[n] = 1 / mass[n];
      const d = Math.min(x[n], y[n], W - x[n], H - y[n]);
      const s = d < band ? Math.pow(1 - Math.max(d, 0) / band, 2) : 0;
      gamma[n] = opts.damping + opts.sponge * s;
    }

    u = new Float64Array(N); uPrev = new Float64Array(N); Ku = new Float64Array(N);
    readColors();
  }

  function bump(cx, cy, amp) {
    const s2 = Math.pow(opts.bumpWidth * opts.spacing, 2);
    for (let n = 0; n < N; n++) {
      const r2 = (x[n] - cx) ** 2 + (y[n] - cy) ** 2;
      if (r2 < 9 * s2) {
        const g = amp * Math.exp(-r2 / s2);
        u[n] += g; uPrev[n] += g;  // zero initial velocity
      }
    }
  }

  function step(dt) {
    for (let n = 0; n < N; n++) Ku[n] = kd[n] * u[n];
    for (let e = 0; e < ek.length; e++) {
      const a = ea[e], b = eb[e], k = ek[e];
      Ku[a] += k * u[b];
      Ku[b] += k * u[a];
    }

    const c2dt2 = opts.speed * opts.speed * dt * dt;
    const fw2 = Math.pow(opts.mouseWidth * opts.spacing, 2);
    // Forcing acts as an acceleration proportional to the cursor speed
    const fAmp = opts.mouseGain * Math.min(mouse.speed, 1500) * dt * dt;
    for (let n = 0; n < N; n++) {
      let f = 0;
      if (fAmp > 0) {
        const r2 = (x[n] - mouse.x) ** 2 + (y[n] - mouse.y) ** 2;
        if (r2 < 9 * fw2) f = fAmp * Math.exp(-r2 / fw2);
      }
      const g = gamma[n] * dt / 2;
      const next = (2 * u[n] - (1 - g) * uPrev[n] - c2dt2 * minv[n] * Ku[n] + f) / (1 + g);
      uPrev[n] = u[n];
      u[n] = next;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const L = opts.levels, vmax = 0.5;
    const paths = { pos: [], neg: [] };
    for (let l = 0; l <= L; l++) { paths.pos.push(new Path2D()); paths.neg.push(new Path2D()); }
    for (let e = 0; e < ek.length; e++) {
      const a = ea[e], b = eb[e];
      const v = (u[a] + u[b]) / 2;
      const l = Math.min(L, Math.floor(Math.abs(v) / vmax * L));
      const p = (v >= 0 ? paths.pos : paths.neg)[l];
      p.moveTo(x[a], y[a] - opts.lift * u[a]);
      p.lineTo(x[b], y[b] - opts.lift * u[b]);
    }
    ctx.lineWidth = 1;
    for (let l = 0; l <= L; l++) {
      const t = l / L;
      const alpha = colors.base + (colors.peak - colors.base) * t;
      for (const sign of ["pos", "neg"]) {
        const rgb = l === 0 ? colors.mesh : (sign === "pos" ? colors.crest : colors.trough);
        ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
        ctx.stroke(paths[sign][l]);
      }
    }
  }

  let last = null, frame = 0;
  function loop(now) {
    const t = now / 1000;
    const frameDt = last === null ? 1 / 60 : Math.min(t - last, 1 / 30);
    last = t;
    if (opts.bumpEvery > 0 && t - lastBump > opts.bumpEvery) {
      lastBump = t;
      bump(W * (0.15 + 0.7 * Math.random()), H * (0.15 + 0.7 * Math.random()), opts.bumpAmp);
    }
    // Leapfrog is stable for c dt ≲ h/2 on this mesh; take a safety margin
    const dtMax = 0.25 * opts.spacing / opts.speed;
    const nsub = Math.ceil(frameDt / dtMax);
    for (let s = 0; s < nsub; s++) step(frameDt / nsub);
    mouse.speed *= 0.85;
    if (++frame % 30 === 0) readColors();
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("pointermove", (ev) => {
    const now = performance.now();
    if (mouse.t !== undefined) {
      const dt = Math.max((now - mouse.t) / 1000, 1e-3);
      const v = Math.hypot(ev.clientX - mouse.x, ev.clientY - mouse.y) / dt;
      mouse.speed = 0.5 * mouse.speed + 0.5 * v;
    }
    mouse.x = ev.clientX; mouse.y = ev.clientY; mouse.t = now;
  }, { passive: true });
  window.addEventListener("pointerdown", (ev) => {
    if (!reduceMotion) bump(ev.clientX, ev.clientY, opts.bumpAmp);
  }, { passive: true });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { build(); if (reduceMotion) draw(); }, 200);
  });

  // Exposed for tuning from the console or a test page
  window.femWave = { opts, rebuild: build, bump: (cx, cy, a) => bump(cx, cy, a ?? opts.bumpAmp) };

  build();
  if (reduceMotion) {
    draw();
  } else {
    bump(W / 2, H / 2, opts.bumpAmp);
    requestAnimationFrame(loop);
  }
})();
