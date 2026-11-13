/* M3 Expressive 形状库（近似实现）+ 形变 + LoadingIndicator + 波浪进度
   形状统一用 120 个等角采样点表示（极坐标半径），因此任意两个形状之间都能逐点插值形变，
   与 Compose 的 MaterialShapes + Morph 的观感一致。 */
(function () {
  const N = 120;
  const TAU = Math.PI * 2;
  const softmaxPoly = (n, rot, k) => (x, y) => {
    let s = 0; const a = Math.cos(Math.PI / n);
    for (let i = 0; i < n; i++) { const t = rot + i * TAU / n; s += Math.exp(((x * Math.cos(t) + y * Math.sin(t)) - a) / k); }
    return k * Math.log(s);
  };
  const sdBox = (hx, hy, rr) => (x, y) => { const qx = Math.abs(x) - hx + rr, qy = Math.abs(y) - hy + rr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; };
  const sdPill = (hx, hy) => (x, y) => { const r = hy; const px = Math.max(Math.abs(x) - (hx - r), 0); return Math.hypot(px, y) - r; };
  const sdArch = (x, y) => { if (y < 0) return Math.hypot(x, y) - 1; return sdBox(1, 1, .18)(x, y); };

  const POLAR = {
    circle: () => 1,
    oval: t => 1 / Math.sqrt(Math.cos(t) ** 2 + (Math.sin(t) / .72) ** 2),
    cookie4: t => .88 + .12 * Math.cos(4 * (t - Math.PI / 4)),
    cookie6: t => .9 + .1 * Math.cos(6 * t),
    cookie7: t => .91 + .09 * Math.cos(7 * (t + Math.PI / 2)),
    cookie9: t => .93 + .07 * Math.cos(9 * (t + Math.PI / 2)),
    cookie12: t => .94 + .06 * Math.cos(12 * t),
    sunny: t => .87 + .13 * Math.cos(8 * t),
    verySunny: t => .78 + .22 * Math.cos(8 * t),
    clover4: t => .6 + .4 * Math.pow(Math.abs(Math.cos(2 * (t - Math.PI / 4))), .55),
    clover8: t => .72 + .28 * Math.pow(Math.abs(Math.cos(4 * t)), .6),
    softBurst: t => .86 + .14 * Math.cos(10 * t),
    burst: t => .78 + .22 * Math.cos(12 * t),
    flower: t => .72 + .28 * Math.pow(Math.abs(Math.cos(3 * t)), .7),
  };
  const SDF = {
    square: sdBox(1, 1, .3),
    slanted: (x, y) => sdBox(.9, .9, .28)(x + y * .18, y),
    pill: sdPill(1, .56),
    pillV: (x, y) => sdPill(1, .56)(y, x),
    triangle: softmaxPoly(3, Math.PI / 2, .12),
    pentagon: softmaxPoly(5, Math.PI / 2, .1),
    gem: softmaxPoly(6, 0, .1),
    arch: sdArch,
  };

  function sample(name) {
    const out = new Float32Array(N);
    if (POLAR[name]) { for (let i = 0; i < N; i++) out[i] = POLAR[name](-Math.PI / 2 + i * TAU / N); }
    else {
      const f = SDF[name];
      for (let i = 0; i < N; i++) {
        const t = -Math.PI / 2 + i * TAU / N, c = Math.cos(t), s = Math.sin(t);
        let lo = 0, hi = 2; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; f(m * c, m * s) < 0 ? lo = m : hi = m; }
        out[i] = lo;
      }
    }
    let mx = 0; out.forEach(v => mx = Math.max(mx, v)); for (let i = 0; i < N; i++) out[i] /= mx;
    return out;
  }
  const LIB = {}; Object.keys(POLAR).concat(Object.keys(SDF)).forEach(k => LIB[k] = sample(k));

  function pathFrom(r, { cx = .5, cy = .5, s = .5, rot = 0 } = {}) {
    let d = '';
    for (let i = 0; i < N; i++) { const t = -Math.PI / 2 + i * TAU / N + rot; const x = cx + Math.cos(t) * r[i] * s, y = cy + Math.sin(t) * r[i] * s; d += (i ? 'L' : 'M') + x.toFixed(4) + ' ' + y.toFixed(4); }
    return d + 'Z';
  }
  function lerp(a, b, t) { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = a[i] + (b[i] - a[i]) * t; return o; }
  // 弹簧插值（阻尼 0.6，刚度 380）的近似曲线：可略过冲
  function spring(t) { const z = .62, w = 14; return 1 - Math.exp(-z * w * t) * Math.cos(w * Math.sqrt(1 - z * z) * t); }

  // 注入 objectBoundingBox 剪裁路径，供 CSS clip-path: url(#sh-xxx) 使用
  function injectDefs() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
    const defs = document.createElementNS(ns, 'defs'); svg.appendChild(defs);
    for (const k of Object.keys(LIB)) {
      const cp = document.createElementNS(ns, 'clipPath'); cp.id = 'sh-' + k; cp.setAttribute('clipPathUnits', 'objectBoundingBox');
      const p = document.createElementNS(ns, 'path'); p.setAttribute('d', pathFrom(LIB[k])); cp.appendChild(p); defs.appendChild(cp);
      document.documentElement.style.setProperty('--shape-' + k.toLowerCase(), `url(#sh-${k})`);
    }
    document.body.appendChild(svg);
  }

  // 元素形状：data-shape="cookie9"；data-shape-hover="sunny" 时悬停/聚焦形变
  let uid = 0;
  function bindShapes(root = document) {
    root.querySelectorAll('[data-shape]').forEach(el => {
      if (el._shaped) return; el._shaped = true;
      const from = el.dataset.shape, to = el.dataset.shapeHover;
      if (!to) { el.style.clipPath = `url(#sh-${from})`; return; }
      const ns = 'http://www.w3.org/2000/svg', id = 'shm-' + (++uid);
      const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
      const cp = document.createElementNS(ns, 'clipPath'); cp.id = id; cp.setAttribute('clipPathUnits', 'objectBoundingBox');
      const p = document.createElementNS(ns, 'path'); p.setAttribute('d', pathFrom(LIB[from])); cp.appendChild(p); svg.appendChild(cp); document.body.appendChild(svg);
      el.style.clipPath = `url(#${id})`;
      let cur = LIB[from], anim = 0, rot = 0;
      const go = (target, targetRot) => {
        const start = cur, t0 = performance.now(), r0 = rot; cancelAnimationFrame(anim);
        const step = now => { const t = Math.min(1, (now - t0) / 520), e = spring(t); cur = lerp(start, LIB[target], e); rot = r0 + (targetRot - r0) * e; p.setAttribute('d', pathFrom(cur, { rot })); if (t < 1) anim = requestAnimationFrame(step); };
        anim = requestAnimationFrame(step);
      };
      const host = el.closest('[data-shape-host]') || el;
      host.addEventListener('mouseenter', () => go(to, Math.PI / 8)); host.addEventListener('mouseleave', () => go(from, 0));
      host.addEventListener('focusin', () => go(to, Math.PI / 8)); host.addEventListener('focusout', () => go(from, 0));
    });
  }

  // LoadingIndicator：7 个形状循环形变 + 旋转（M3 Expressive 规格序列）
  const SEQ = ['softBurst', 'cookie9', 'pentagon', 'pill', 'sunny', 'cookie4', 'oval'];
  const loaders = new Set();
  function mountLoaders(root = document) {
    root.querySelectorAll('.loading-ind').forEach(el => {
      if (el._mounted) return; el._mounted = true;
      el.innerHTML = '<svg viewBox="-1 -1 2 2"><path/></svg>';
      loaders.add(el.querySelector('path'));
    });
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick(now) {
    const per = 650, k = Math.floor(now / per), t = (now % per) / per;
    const a = LIB[SEQ[k % SEQ.length]], b = LIB[SEQ[(k + 1) % SEQ.length]];
    const e = spring(Math.min(1, t * 1.4));
    const r = lerp(a, b, e); const rot = (k + e) * (Math.PI / 2.4) + now / 2600;
    const d = pathFrom(r, { cx: 0, cy: 0, s: .92, rot });
    loaders.forEach(p => p.setAttribute('d', d));
    if (!reduce) requestAnimationFrame(tick);
  }

  // 波浪进度条：<svg class="wavy" data-v="0.42">（已播段为波浪，剩余段为直线 + 末端停止点）
  function drawWavy(root = document) {
    root.querySelectorAll('svg.wavy').forEach(svg => {
      const W = parseFloat(svg.dataset.w) || 200, v = Math.max(0, Math.min(1, parseFloat(svg.dataset.v) || 0));
      const H = 10, mid = H / 2, amp = parseFloat(svg.dataset.amp) || 2.2, wl = 16, x1 = 2 + (W - 4) * v;
      let d = `M2 ${mid}`; for (let x = 2; x <= x1; x += 1) d += `L${x} ${(mid + Math.sin((x - 2) / wl * TAU) * amp).toFixed(2)}`;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
      svg.innerHTML = `<path class="w-act" d="${d}"/>${x1 + 8 < W - 4 ? `<path class="w-trk" d="M${x1 + 8} ${mid}L${W - 4} ${mid}"/><circle class="w-stop" cx="${W - 3}" cy="${mid}" r="1.6"/>` : ''}`;
    });
  }

  window.MyBoxShapes = {
    LIB, N, pathFrom, lerp, spring, names: Object.keys(LIB),
    init(root) { injectDefs(); bindShapes(root); mountLoaders(root); drawWavy(root); requestAnimationFrame(tick); },
    refresh(root) { bindShapes(root); mountLoaders(root); drawWavy(root); },
  };
})();
