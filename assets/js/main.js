/* myBox 设计稿主脚本：封面取色（按 MaterialKolor 流程：kmpalette + material-color-utilities 0.4.0）、设备缩放、目录、演示交互 */
import * as M from '../vendor/mcu.js';

const P = window.MyBoxPosters, S = window.MyBoxShapes;
const ROLES = ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer', 'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'onSurface', 'onSurfaceVariant', 'outline', 'outlineVariant', 'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'scrim', 'shadow',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'tertiaryFixed', 'tertiaryFixedDim'];
const VARIANTS = { content: M.SchemeContent, tonal: M.SchemeTonalSpot, fidelity: M.SchemeFidelity, vibrant: M.SchemeVibrant, expressive: M.SchemeExpressive, neutral: M.SchemeNeutral, mono: M.SchemeMonochrome, rainbow: M.SchemeRainbow, fruit: M.SchemeFruitSalad }; // = MaterialKolor PaletteStyle
const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
const BRAND_SEED = M.argbFromHex('#9c2c2c'); // 「丝绒红」——没有封面时的品牌种子色

/* ---------- 取色：与 MaterialKolor 6.0（material-kolor-palette）相同的流程 ----------
 * rememberThemeColor → kmpalette（AndroidX Palette 的多平台移植）量化出色样 → material-color-utilities 的 Score 排名。
 * 下面逐行移植 kmpalette 的默认参数：缩到面积 ≤ 112×112、最多 16 个色样、默认过滤器（近黑、近白、肤色红线）。 */
const KP_AREA = 112 * 112, KP_MAX = 16;
function rgbToHsl(r, g, b) { // AndroidX ColorUtils.RGBToHSL
  const rf = r / 255, gf = g / 255, bf = b / 255, max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf), d = max - min, l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    h = max === rf ? ((gf - bf) / d) % 6 : max === gf ? (bf - rf) / d + 2 : (rf - gf) / d + 4;
    s = d / (1 - Math.abs(2 * l - 1));
  }
  h = (h * 60) % 360; if (h < 0) h += 360;
  return [Math.min(360, Math.max(0, h)), Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l))];
}
const kpIgnore = rgb => { const [h, s, l] = rgbToHsl(rgb >> 16 & 255, rgb >> 8 & 255, rgb & 255); return l >= 0.95 || l <= 0.05 || (h >= 10 && h <= 37 && s <= 0.82); };
const roundEven = x => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 ? f + 1 : f); }; // kotlin.math.round
function kmPalette(pixels, maxColors = KP_MAX) { // kmpalette ColorCutQuantizer
  const qr = c => (c >> 10) & 31, qg = c => (c >> 5) & 31, qb = c => c & 31;
  const to888 = (r, g, b) => (0xff000000 | ((r << 3) & 255) << 16 | ((g << 3) & 255) << 8 | ((b << 3) & 255)) >>> 0;
  const hist = new Int32Array(1 << 15);
  for (const p of pixels) hist[((p >> 19 & 31) << 10) | ((p >> 11 & 31) << 5) | (p >> 3 & 31)]++;
  const colors = [];
  for (let c = 0; c < hist.length; c++) if (hist[c] > 0) { if (kpIgnore(to888(qr(c), qg(c), qb(c)))) hist[c] = 0; else colors.push(c); }
  if (colors.length <= maxColors) return colors.map(c => ({ rgb: to888(qr(c), qg(c), qb(c)), pop: hist[c] }));
  const swap = (dim, lo, hi) => { for (let i = lo; i <= hi; i++) { const c = colors[i]; if (dim === 1) colors[i] = qg(c) << 10 | qr(c) << 5 | qb(c); else if (dim === 2) colors[i] = qb(c) << 10 | qg(c) << 5 | qr(c); } };
  class Vbox {
    constructor(lo, hi) { this.lo = lo; this.hi = hi; this.fit(); }
    fit() {
      let r0 = 99, r1 = -1, g0 = 99, g1 = -1, b0 = 99, b1 = -1, n = 0;
      for (let i = this.lo; i <= this.hi; i++) { const c = colors[i]; n += hist[c]; r0 = Math.min(r0, qr(c)); r1 = Math.max(r1, qr(c)); g0 = Math.min(g0, qg(c)); g1 = Math.max(g1, qg(c)); b0 = Math.min(b0, qb(c)); b1 = Math.max(b1, qb(c)); }
      Object.assign(this, { r0, r1, g0, g1, b0, b1, pop: n });
    }
    get volume() { return (this.r1 - this.r0 + 1) * (this.g1 - this.g0 + 1) * (this.b1 - this.b0 + 1); }
    canSplit() { return this.hi - this.lo >= 1; }
    split() {
      const R = this.r1 - this.r0, G = this.g1 - this.g0, B = this.b1 - this.b0;
      const dim = R >= G && R >= B ? 0 : G >= R && G >= B ? 1 : 2;
      swap(dim, this.lo, this.hi);
      const part = colors.slice(this.lo, this.hi + 1).sort((a, b) => a - b); colors.splice(this.lo, part.length, ...part);
      swap(dim, this.lo, this.hi);
      const mid = Math.floor(this.pop / 2); let count = 0, sp = this.lo;
      for (let i = this.lo; i <= this.hi; i++) { count += hist[colors[i]]; if (count >= mid) { sp = Math.min(this.hi - 1, i); break; } }
      const nb = new Vbox(sp + 1, this.hi); this.hi = sp; this.fit(); return nb;
    }
    average() {
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = this.lo; i <= this.hi; i++) { const c = colors[i], k = hist[c]; n += k; r += k * qr(c); g += k * qg(c); b += k * qb(c); }
      return { rgb: to888(roundEven(r / n), roundEven(g / n), roundEven(b / n)), pop: n };
    }
  }
  // kmpalette 自带的二叉堆 PriorityQueue，按体积从大到小
  const heap = [], cmp = (a, b) => b.volume - a.volume;
  const offer = v => { heap.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (cmp(heap[i], heap[p]) < 0) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break; } };
  const poll = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && cmp(heap[l], heap[m]) < 0) m = l; if (r < heap.length && cmp(heap[r], heap[m]) < 0) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  offer(new Vbox(0, colors.length - 1));
  while (heap.length < maxColors) { const v = poll(); if (v && v.canSplit()) { offer(v.split()); offer(v); } else break; }
  return heap.map(v => v.average()).filter(s => !kpIgnore(s.rgb));
}
const seedCache = {};
function extract(id) {
  if (seedCache[id]) return seedCache[id];
  const src = P.canvas(id), sw = src.width, sh = src.height;
  const k = sw * sh > KP_AREA ? Math.sqrt(KP_AREA / (sw * sh)) : 1;
  const w = Math.max(1, Math.ceil(sw * k)), h = Math.max(1, Math.ceil(sh * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push(M.argbFromRgb(d[i], d[i + 1], d[i + 2]));
  const swatches = kmPalette(px);
  const quant = new Map(); swatches.forEach(s => quant.set(s.rgb, (quant.get(s.rgb) || 0) + s.pop));
  const ranked = M.Score.score(quant, { desired: 4, fallbackColorARGB: BRAND_SEED, filter: true });
  return (seedCache[id] = { seed: ranked[0], ranked, quant, small: c, w, h, pixels: px.length });
}
const SPEC = '2025'; // MaterialKolor 6.0 默认 ColorSpec.SpecVersion.SPEC_2025
const schemeCache = {};
function scheme(seed, dark = true, variant = 'content', contrast = 0) {
  const key = [seed, dark, variant, contrast].join('|');
  if (schemeCache[key]) return schemeCache[key];
  const s = new VARIANTS[variant](M.Hct.fromInt(seed), dark, contrast, SPEC);
  const out = {};
  for (const r of ROLES) { const v = s[r]; if (typeof v === 'number') out[r] = M.hexFromArgb(v); }
  out._palettes = { primary: s.primaryPalette, secondary: s.secondaryPalette, tertiary: s.tertiaryPalette, neutral: s.neutralPalette, neutralVariant: s.neutralVariantPalette };
  return (schemeCache[key] = out);
}
function apply(el, roles) { for (const r of ROLES) if (roles[r]) el.style.setProperty('--md-' + kebab(r), roles[r]); }

/* ---------- 页面主题 ---------- */
const state = { pageSeedId: 'p10', docDark: true };
try { const v = localStorage.getItem('mybox-doc-poster'); if (v && P.byId[v]) state.pageSeedId = v; } catch (e) {}
try { const v = localStorage.getItem('mybox-doc-dark'); if (v) state.docDark = v === '1'; } catch (e) {}

function themeApps() {
  const pageSeed = extract(state.pageSeedId).seed;
  document.querySelectorAll('.app').forEach(app => {
    const pid = app.dataset.themePoster;
    const dark = (app.dataset.mode || 'dark') === 'dark';
    const variant = app.dataset.variant || (pid ? 'content' : 'tonal');
    const seed = pid === 'brand' ? BRAND_SEED : (pid ? extract(pid).seed : pageSeed);
    apply(app, scheme(seed, dark, variant, parseFloat(app.dataset.contrast || 0)));
  });
}
function themePage() {
  const seed = extract(state.pageSeedId).seed;
  const roles = scheme(seed, state.docDark, 'tonal', 0);
  apply(document.documentElement, roles);
  document.documentElement.style.colorScheme = state.docDark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = roles.surfaceContainerLowest;
  document.querySelectorAll('.reel button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === state.pageSeedId));
  const ro = document.querySelector('.seed-readout');
  if (ro) { const hct = M.Hct.fromInt(seed); ro.innerHTML = `<i class="sw" style="background:${M.hexFromArgb(seed)}"></i>当前种子色 <code>${M.hexFromArgb(seed).toUpperCase()}</code> 色相 ${hct.hue.toFixed(0)}° 彩度 ${hct.chroma.toFixed(0)}，取自《${P.byId[state.pageSeedId].t}》`; }
  // 开场电视里的首页跟随选中的影片
  document.querySelectorAll('[data-follow="hero"]').forEach(el => {
    const p = P.byId[state.pageSeedId];
    el.querySelectorAll('[data-follow-bd]').forEach(n => { n.dataset.backdrop = p.id; });
    el.querySelectorAll('[data-follow-title]').forEach(n => n.textContent = p.t);
    el.querySelectorAll('[data-follow-meta]').forEach(n => n.innerHTML = `<span class="badge q">${p.remark}</span><span>${p.y}</span><i class="sep"></i><span>${p.r}</span><i class="sep"></i><span>${p.g}</span><i class="sep"></i><span style="color:var(--md-tertiary);font-weight:700">${p.s.toFixed(1)}</span>`);
    el.querySelectorAll('[data-follow-desc]').forEach(n => n.textContent = p.desc);
    el.dataset.themePoster = p.id;
  });
  P.paint(document);
  themeApps();
}

/* ---------- 设备缩放：按陈列宽度 zoom，保持 dp 尺寸真实 ---------- */
const DEV = { phone: [432, 912], 'phone-land': [912, 432], tablet: [1316, 836], 'tablet-port': [836, 1316], fold: [876, 804], tv: [976, 556], dual: [1174, 768], 'fold-table': [804, 900] };
function fit() {
  document.querySelectorAll('.dev').forEach(dev => {
    const z = dev.querySelector('.dev-zoom'); if (!z) return;
    const [w] = DEV[dev.dataset.dev] || [400];
    const avail = dev.clientWidth; const k = Math.min(1, avail / w);
    z.style.zoom = k.toFixed(4);
  });
}

/* ---------- 目录高亮 ---------- */
function scrollSpy() {
  const links = [...document.querySelectorAll('.toc a.ti[href^="#"]')];
  const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { links.forEach(l => l.classList.remove('on')); const a = map.get(e.target.id); if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest' }); } } });
  }, { rootMargin: '-30% 0px -65% 0px' });
  map.forEach((a, id) => { const t = document.getElementById(id); if (t) io.observe(t); });
  const toc = document.querySelector('.toc');
  document.querySelectorAll('[data-toc-toggle]').forEach(b => b.addEventListener('click', () => toc.classList.toggle('open')));
  document.querySelector('.toc-scrim')?.addEventListener('click', () => toc.classList.remove('open'));
  links.forEach(a => a.addEventListener('click', () => toc.classList.remove('open')));
}

/* ---------- 文档工具栏 ---------- */
function docBar() {
  const root = document.documentElement;
  const bind = (sel, fn, init) => { const b = document.querySelector(sel); if (!b) return; b.setAttribute('aria-pressed', init); b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); fn(v); }); fn(init); };
  bind('#tg-pins', v => root.classList.toggle('pins-off', !v), true);
  bind('#tg-blur', v => root.classList.toggle('no-blur', !v), true);
  bind('#tg-dark', v => { state.docDark = v; try { localStorage.setItem('mybox-doc-dark', v ? '1' : '0'); } catch (e) {} themePage(); }, state.docDark);
}

/* ---------- 取色实验室 ---------- */
function lab() {
  const el = document.getElementById('color-lab'); if (!el) return;
  const st = { id: 'p4', variant: 'content', dark: true, contrast: 0 };
  const thumbs = el.querySelector('.lab-thumbs');
  thumbs.innerHTML = P.CATALOG.slice(0, 18).map(p => `<button data-id="${p.id}" data-poster="${p.id}" aria-label="${p.t}" title="${p.t}"></button>`).join('');
  const render = () => {
    const ex = extract(st.id), roles = scheme(ex.seed, st.dark, st.variant, st.contrast);
    el.querySelector('.big').dataset.poster = st.id;
    thumbs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === st.id));
    const pix = el.querySelector('.pix'); const pc = pix.getContext('2d'); pix.width = ex.w; pix.height = ex.h; pc.drawImage(ex.small, 0, 0); el.querySelectorAll('.qsize').forEach(n => n.textContent = `${ex.w} × ${ex.h}`);
    const tot = [...ex.quant.values()].reduce((a, b) => a + b, 0);
    const top = [...ex.quant.entries()].sort((a, b) => b[1] - a[1]);
    el.querySelector('.qbar').innerHTML = top.map(([c, n]) => `<i style="flex:${n};background:${M.hexFromArgb(c)}" title="${M.hexFromArgb(c)} ${(n / tot * 100).toFixed(1)}%"></i>`).join('');
    el.querySelector('.qcount').textContent = ex.quant.size;
    el.querySelector('.seeds').innerHTML = ex.ranked.map((c, i) => { const h = M.Hct.fromInt(c); return `<span class="sd ${i ? '' : 'win'}"><i style="background:${M.hexFromArgb(c)}"></i>${M.hexFromArgb(c).toUpperCase()}<br>H${h.hue.toFixed(0)} C${h.chroma.toFixed(0)}</span>`; }).join('');
    const R = (bg, fg, name, wide) => `<div class="rl ${wide ? 'wide' : ''}" style="background:${roles[bg]};color:${roles[fg]}"><span>${name}</span><b>${roles[bg].toUpperCase()}</b></div>`;
    el.querySelector('.roles').innerHTML =
      R('primary', 'onPrimary', 'primary') + R('primaryContainer', 'onPrimaryContainer', 'primaryContainer') + R('secondary', 'onSecondary', 'secondary') + R('secondaryContainer', 'onSecondaryContainer', 'secondaryContainer') +
      R('tertiary', 'onTertiary', 'tertiary') + R('tertiaryContainer', 'onTertiaryContainer', 'tertiaryContainer') + R('error', 'onError', 'error') + R('errorContainer', 'onErrorContainer', 'errorContainer') +
      R('surfaceContainerLowest', 'onSurface', 'containerLowest') + R('surfaceContainerLow', 'onSurface', 'containerLow') + R('surfaceContainer', 'onSurface', 'container') + R('surfaceContainerHigh', 'onSurface', 'containerHigh') +
      R('surfaceContainerHighest', 'onSurface', 'containerHighest') + R('surface', 'onSurfaceVariant', 'surface / onSurfaceVariant') + R('inverseSurface', 'inverseOnSurface', 'inverseSurface') + R('outlineVariant', 'onSurface', 'outlineVariant');
    const pal = roles._palettes;
    el.querySelector('.ramps').innerHTML = ['primary', 'secondary', 'tertiary', 'neutral'].map(k => `<div class="ramp">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99].map(t => `<i style="background:${M.hexFromArgb(pal[k].tone(t))};color:${t > 55 ? '#000' : '#fff'}">${t}</i>`).join('')}</div>`).join('');
    const prev = el.querySelector('.lab-preview .app');
    prev.dataset.themePoster = st.id; prev.dataset.variant = st.variant; prev.dataset.mode = st.dark ? 'dark' : 'light'; prev.dataset.contrast = st.contrast;
    prev.querySelectorAll('[data-lab-bd]').forEach(n => n.dataset.backdrop = st.id);
    prev.querySelectorAll('[data-lab-poster]').forEach(n => n.dataset.poster = st.id);
    const p = P.byId[st.id];
    prev.querySelectorAll('[data-lab-title]').forEach(n => n.textContent = p.t);
    prev.querySelectorAll('[data-lab-meta]').forEach(n => n.textContent = `${p.y} / ${p.r} / ${p.g}`);
    apply(prev, roles);
    P.paint(el);
  };
  thumbs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { st.id = b.dataset.id; render(); } });
  el.querySelectorAll('[data-variant]').forEach(b => b.addEventListener('click', () => { st.variant = b.dataset.variant; el.querySelectorAll('[data-variant]').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); }));
  el.querySelectorAll('[data-labmode]').forEach(b => b.addEventListener('click', () => { st.dark = b.dataset.labmode === 'dark'; el.querySelectorAll('[data-labmode]').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); }));
  el.querySelectorAll('[data-contrast]').forEach(b => b.addEventListener('click', () => { st.contrast = parseFloat(b.dataset.contrast); el.querySelectorAll('[data-contrast]').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); }));
  render();
}

/* ---------- 形状库 ---------- */
function shapeLib() {
  const el = document.getElementById('shape-lib'); if (!el) return;
  const names = { circle: '圆 Circle', oval: '椭圆 Oval', square: '方 Square', slanted: '斜方 Slanted', pill: '胶囊 Pill', arch: '拱 Arch', triangle: '三角 Triangle', pentagon: '五边 Pentagon', gem: '宝石 Gem', cookie4: '曲奇 4', cookie6: '曲奇 6', cookie7: '曲奇 7', cookie9: '曲奇 9', cookie12: '曲奇 12', sunny: '晴日 Sunny', verySunny: '烈日 Very sunny', clover4: '四叶 Clover 4', clover8: '八叶 Clover 8', softBurst: '柔爆 Soft burst', burst: '爆裂 Burst', flower: '花 Flower' };
  el.innerHTML = Object.entries(names).map(([k, n]) => `<figure data-shape-host><i data-shape="${k}" data-shape-hover="${k === 'circle' ? 'cookie9' : k === 'cookie9' ? 'circle' : 'sunny'}"></i>${n}</figure>`).join('');
}

/* ---------- 交互小演示：data-tabs 切换、源胶囊滑动 ---------- */
function demos() {
  const repo = 'https://github.com/mytv-android/myBox/issues/new';
  document.querySelectorAll('[data-fb]').forEach(a => {
    a.href = `${repo}?title=${encodeURIComponent(`[${a.dataset.fb}] `)}&body=${encodeURIComponent('设备（手机 / 平板 / 电视 / 折叠屏 / 双屏）：\n\n意见：\n')}`;
    a.target = '_blank'; a.rel = 'noopener';
  });
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const tabs = group.querySelectorAll('[data-tab]'), panes = group.querySelectorAll('[data-pane]');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.toggle('on', x === t));
      panes.forEach(p => p.hidden = p.dataset.pane !== t.dataset.tab);
    }));
  });
  document.querySelectorAll('[data-pick]').forEach(list => {
    list.addEventListener('click', e => {
      const it = e.target.closest('[data-pick-item]'); if (!it) return;
      list.querySelectorAll('[data-pick-item]').forEach(x => x.classList.toggle('on', x === it));
      const target = list.dataset.pick && document.querySelector(list.dataset.pick);
      if (target && it.dataset.label) target.textContent = it.dataset.label;
    });
  });
}

/* ---------- 启动 ---------- */
async function boot() {
  S.init(document);
  await P.ready();
  document.querySelector('.reel')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.pageSeedId = b.dataset.id; try { localStorage.setItem('mybox-doc-poster', b.dataset.id); } catch (e) {}
    themePage();
  });
  shapeLib(); S.refresh(document);
  themePage();
  lab();
  docBar();
  scrollSpy();
  demos();
  fit(); new ResizeObserver(fit).observe(document.querySelector('.main'));
  window.addEventListener('resize', fit);
  document.documentElement.classList.add('ready');
}
boot();
