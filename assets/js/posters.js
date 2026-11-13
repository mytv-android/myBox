/* myBox 设计稿 —— 虚构片库 + 程序化海报
   所有片名、海报均为虚构，避免使用真实影片素材。海报用 Canvas 现场绘制，
   取色演示直接读取这些像素，因此「从封面取色」在本页是真实运行的。 */
(function () {
  const CATALOG = [
    { id: 'p1', t: '长夜将尽', en: 'THE LONG NIGHT ENDS', y: 2026, g: '悬疑 / 剧情', r: '中国大陆', s: 8.7, kind: '剧集', remark: '更新至 12 集', motif: 'sun', pal: ['#0b1433', '#3a2466', '#f3a53a', '#ff6a3d'], dir: '沈既白', act: ['周砚', '林知夏', '顾远山', '许棠'], desc: '暴雨夜的连环失踪案，把退休刑警和他当年放走的嫌疑人重新拴在一起。天亮之前，两人必须找到第七个孩子。', title: 'bottom' },
    { id: 'p2', t: '北纬零度', en: 'LATITUDE ZERO', y: 2025, g: '科幻 / 冒险', r: '中国大陆', s: 8.2, kind: '电影', remark: '4K HDR', motif: 'rings', pal: ['#030b1c', '#0b2f55', '#4fd1ff', '#b3f0ff'], dir: '陆川行', act: ['江屿', '苏蔓', '何一舟'], desc: '赤道上空的轨道电梯在一夜之间停摆，最后一班轿厢里困着十二个人和一个不该存在的信号。', title: 'top' },
    { id: 'p3', t: '潮汐之城', en: 'CITY OF TIDES', y: 2026, g: '爱情 / 剧情', r: '中国香港', s: 7.9, kind: '电影', remark: '蓝光', motif: 'sea', pal: ['#ffb199', '#ff6f91', '#fff1c1', '#2b2e83'], dir: '温以宁', act: ['陈默', '叶小舟'], desc: '每年只有一次大潮能淹没旧城的码头，也只有那一天，她会回来。', title: 'vertical' },
    { id: 'p4', t: '霓虹不眠', en: 'NEON NEVER SLEEPS', y: 2025, g: '犯罪 / 动作', r: '中国台湾', s: 8.0, kind: '剧集', remark: '全 10 集', motif: 'city', pal: ['#12002b', '#45006b', '#ff2fa6', '#2ff3ff'], dir: '高屿森', act: ['魏崇', '杜若', '梁一'], desc: '夜班出租车司机在后座捡到一部还在通话的手机，电话那头报出了他的名字。', title: 'bottom' },
    { id: 'p5', t: '山河故梦', en: 'DREAMS OF THE OLD LAND', y: 2026, g: '古装 / 历史', r: '中国大陆', s: 8.9, kind: '剧集', remark: '更新至 28 集', motif: 'ink', pal: ['#efe6d2', '#c9bfa8', '#1d3b36', '#b3261e'], dir: '秦怀古', act: ['萧景行', '宁晚照', '谢长安', '裴昭'], desc: '王朝覆灭前的最后十年，一位修史官决定把不该写进史书的事，一件件写下来。', title: 'vertical' },
    { id: 'p6', t: '第七号站台', en: 'PLATFORM SEVEN', y: 2024, g: '悬疑 / 惊悚', r: '日本', s: 7.6, kind: '电影', remark: '中字', motif: 'train', pal: ['#0a0f12', '#1d2a2e', '#ffb100', '#e4572e'], dir: '早川慎', act: ['佐仓遥', '森田一'], desc: '末班车开走后，第七号站台的广播又响了一次。', title: 'top' },
    { id: 'p7', t: '白昼流星', en: 'DAYLIGHT METEOR', y: 2025, g: '科幻 / 家庭', r: '中国大陆', s: 8.1, kind: '电影', remark: '杜比视界', motif: 'grid', pal: ['#1b0638', '#7a1d6e', '#ffcf4a', '#ff4d6d'], dir: '林知遥', act: ['安然', '许一诺'], desc: '一颗只在白天出现的流星，让一个小镇的人重新抬起头。', title: 'bottom' },
    { id: 'p8', t: '雪落无声', en: 'SILENT SNOW', y: 2026, g: '剧情 / 家庭', r: '韩国', s: 8.4, kind: '剧集', remark: '全 16 集', motif: 'snow', pal: ['#dbe9f6', '#7fa4c9', '#20324a', '#f4f7fb'], dir: '朴叙然', act: ['金素妍', '李在昊'], desc: '在一座冬天比夏天长的小城里，一家人用十六封信学会道别。', title: 'top' },
    { id: 'p9', t: '野火', en: 'WILDFIRE', y: 2025, g: '动作 / 灾难', r: '美国', s: 7.4, kind: '电影', remark: 'HDR10', motif: 'fire', pal: ['#120403', '#3d0b05', '#ff7a1a', '#ffd166'], dir: 'M. Holloway', act: ['R. Vance', 'J. Okafor'], desc: '山火逼近只有一条出路的峡谷小镇，消防队长必须在日落前做出选择。', title: 'bottom' },
    { id: 'p10', t: '风过长安', en: 'WIND OVER CHANG\'AN', y: 2026, g: '古装 / 悬疑', r: '中国大陆', s: 8.5, kind: '剧集', remark: '独播', motif: 'palace', pal: ['#2a0b0b', '#6b1515', '#f2c14e', '#ffe8a3'], dir: '季长风', act: ['顾青辞', '沈落', '李慕白'], desc: '上元夜，长安城一百零八坊同时熄灯。不良帅只有一个时辰。', title: 'vertical' },
    { id: 'p11', t: '深海回声', en: 'ECHOES OF THE DEEP', y: 2024, g: '纪录片 / 自然', r: '英国', s: 9.3, kind: '纪录片', remark: '全 6 集', motif: 'deep', pal: ['#00121f', '#003b5c', '#3ee6c1', '#a6fff0'], dir: 'E. Lindqvist', act: ['旁白 D. Ashford'], desc: '在一千米以下的黑暗里，生命用光彼此说话。', title: 'bottom' },
    { id: 'p12', t: '小镇夏日', en: 'SMALL TOWN SUMMER', y: 2025, g: '喜剧 / 青春', r: '中国大陆', s: 7.8, kind: '电影', remark: '高清', motif: 'blocks', pal: ['#fff3c4', '#ffd36e', '#2f9e6e', '#ff6b4a'], dir: '唐小满', act: ['夏天', '林木', '周小鱼'], desc: '高考结束的那个夏天，四个人决定把镇上唯一的露天影院重新开起来。', title: 'top' },
    { id: 'p13', t: '星际邮差', en: 'STAR POSTMAN', y: 2026, g: '动画 / 奇幻', r: '中国大陆', s: 8.8, kind: '动漫', remark: '更新至 9 集', motif: 'planet', pal: ['#1d1450', '#5b2bb5', '#ffd23f', '#ff8fab'], dir: '米粒', act: ['配音 小桃', '配音 阿石'], desc: '宇宙最后一位邮差，要把一封寄错了三百年的信送到。', title: 'bottom' },
    { id: 'p14', t: '灯塔守望者', en: 'THE LIGHTKEEPER', y: 2024, g: '剧情', r: '法国', s: 8.3, kind: '电影', remark: '中字', motif: 'beam', pal: ['#050b1a', '#13294b', '#ffe066', '#f8f9fa'], dir: 'C. Moreau', act: ['L. Garnier', 'A. Petit'], desc: '海岛上的最后一位守塔人，迎来了一个不肯说出名字的访客。', title: 'top' },
    { id: 'p15', t: '末班地铁', en: 'LAST TRAIN HOME', y: 2025, g: '都市 / 爱情', r: '中国大陆', s: 7.7, kind: '剧集', remark: '全 24 集', motif: 'tunnel', pal: ['#06140f', '#0f3d2e', '#7cffb2', '#e0fff0'], dir: '许南星', act: ['宋知意', '江淮'], desc: '每晚 23:47 的末班车上，总有同一个人坐在最后一节车厢。', title: 'vertical' },
    { id: 'p16', t: '无人区来信', en: 'LETTERS FROM NOWHERE', y: 2026, g: '西部 / 公路', r: '中国大陆', s: 8.0, kind: '电影', remark: '4K', motif: 'desert', pal: ['#ffcf99', '#e07a3f', '#7a2e1d', '#fff4e0'], dir: '巴图', act: ['阿木', '其其格'], desc: '一个邮递员、一辆旧吉普、一封寄往无人区的信。', title: 'top' },
    { id: 'p17', t: '冰河纪事', en: 'GLACIER CHRONICLE', y: 2024, g: '纪录片', r: '冰岛', s: 9.1, kind: '纪录片', remark: '全 4 集', motif: 'ice', pal: ['#e8f7ff', '#8ecae6', '#14425e', '#ffffff'], dir: 'H. Sigurdsson', act: ['旁白'], desc: '记录一条冰川最后十年的退却。', title: 'bottom' },
    { id: 'p18', t: '猫的一百种生活', en: 'A HUNDRED CAT LIVES', y: 2025, g: '动画 / 治愈', r: '日本', s: 8.6, kind: '动漫', remark: '全 12 集', motif: 'cat', pal: ['#ffe5ec', '#ffc2d1', '#3d2c8d', '#ffb703'], dir: '小野柚', act: ['配音 花泽'], desc: '一只猫，一百个主人，一百种生活。', title: 'bottom' },
    { id: 'p19', t: '破晓行动', en: 'OPERATION DAYBREAK', y: 2026, g: '动作 / 战争', r: '中国大陆', s: 7.5, kind: '电影', remark: '杜比全景声', motif: 'figure', pal: ['#0d1b2a', '#415a77', '#ff9f1c', '#e0e1dd'], dir: '赵铁衡', act: ['马骁', '程烈', '韩冰'], desc: '黎明前四小时，一支七人小队要穿过封锁线把一个孩子带回来。', title: 'bottom' },
    { id: 'p20', t: '半山听雨', en: 'RAIN ON THE HILL', y: 2025, g: '综艺 / 慢生活', r: '中国大陆', s: 8.2, kind: '综艺', remark: '第 3 期', motif: 'forest', pal: ['#1f3a2c', '#4f7a5a', '#d8f3dc', '#ffd166'], dir: '—', act: ['常驻嘉宾 6 位'], desc: '六个人在山里住满一季，种茶、听雨、什么都不急。', title: 'vertical' },
    { id: 'p21', t: '午夜电台', en: 'MIDNIGHT FM', y: 2024, g: '悬疑 / 都市', r: '中国大陆', s: 7.9, kind: '剧集', remark: '全 12 集', motif: 'radio', pal: ['#160b26', '#3c1f5c', '#ff5d8f', '#ffd0e0'], dir: '黎深', act: ['苏念', '陆沉'], desc: '凌晨一点的点歌热线，有人每天点同一首歌，却从不说话。', title: 'bottom' },
    { id: 'p22', t: '少年与海', en: 'THE BOY AND THE SEA', y: 2026, g: '动画 / 冒险', r: '中国大陆', s: 8.7, kind: '动漫', remark: '剧场版', motif: 'wave', pal: ['#f1faee', '#a8dadc', '#1d3557', '#e63946'], dir: '海风', act: ['配音 阿汐'], desc: '十二岁的渔家少年，要追上一头会唱歌的鲸。', title: 'top' },
  ];
  const byId = Object.fromEntries(CATALOG.map(p => [p.id, p]));

  /* ---------- 工具 ---------- */
  function rng(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
  function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
  function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
  function rad(ctx, x, y, r0, r1, stops) { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }

  let noiseCanvas = null;
  function noise() {
    if (noiseCanvas) return noiseCanvas;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); const d = x.createImageData(128, 128); const r = rng('grain');
    for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); noiseCanvas = c; return c;
  }

  function ridge(ctx, w, h, baseY, amp, rough, color, r, step = 6) {
    ctx.beginPath(); ctx.moveTo(0, h);
    let y = baseY; const f1 = 0.6 + r() * 1.2, f2 = 2 + r() * 3, ph = r() * 10;
    for (let x = 0; x <= w + step; x += step) {
      y = baseY - amp * (0.55 * Math.sin(x / w * Math.PI * f1 + ph) + 0.3 * Math.sin(x / w * Math.PI * f2 + ph * 2) + rough * (r() - .5));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  /* ---------- 母题 ---------- */
  const MOTIFS = {
    sun(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal; const hz = h * .64;
      ctx.fillStyle = lin(ctx, 0, 0, 0, hz, [[0, a], [.7, b], [1, d]]); ctx.fillRect(0, 0, w, h);
      const R = Math.min(w, h) * .2, cx = w * .5, cy = hz - R * .35;
      ctx.fillStyle = rad(ctx, cx, cy, R * .2, R * 3.2, [[0, rgba(c, .55)], [1, rgba(c, 0)]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = lin(ctx, 0, cy - R, 0, cy + R, [[0, '#fff1c9'], [.5, c], [1, d]]);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ridge(ctx, w, h, hz - h * .08, h * .07, .2, mix(b, '#000000', .45), r);
      ridge(ctx, w, h, hz - h * .02, h * .05, .15, mix(a, '#000000', .35), r);
      ctx.fillStyle = lin(ctx, 0, hz, 0, h, [[0, mix(a, '#000000', .2)], [1, mix(a, '#000000', .7)]]); ctx.fillRect(0, hz, w, h - hz);
      for (let i = 0; i < 26; i++) { const yy = hz + 4 + i * i * .9; if (yy > h) break; const ww = R * (1.6 - i * .05) * (0.6 + r() * .6); ctx.fillStyle = rgba(c, .5 - i * .017); ctx.fillRect(cx - ww / 2 + (r() - .5) * 20, yy, ww, 2 + i * .12); }
    },
    rings(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, w * .3, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * .8})`; const s = r() * 1.6; ctx.fillRect(r() * w, r() * h, s, s); }
      const cx = w * .62, cy = h * .58, R = Math.max(w, h) * .26;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.35);
      for (let i = 0; i < 9; i++) { ctx.strokeStyle = rgba(i % 3 ? d : c, .12 + i * .04); ctx.lineWidth = 1 + (i % 3); ctx.beginPath(); ctx.ellipse(0, 0, R * (1.25 + i * .09), R * (.22 + i * .02), 0, Math.PI, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = rad(ctx, cx - R * .35, cy - R * .4, R * .1, R * 1.1, [[0, d], [.4, c], [1, mix(b, '#000000', .5)]]);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.35);
      for (let i = 0; i < 9; i++) { ctx.strokeStyle = rgba(i % 3 ? d : c, .2 + i * .05); ctx.lineWidth = 1 + (i % 3); ctx.beginPath(); ctx.ellipse(0, 0, R * (1.25 + i * .09), R * (.22 + i * .02), 0, 0, Math.PI); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = rad(ctx, w * .15, h * .2, 0, w * .5, [[0, rgba(c, .25)], [1, rgba(c, 0)]]); ctx.fillRect(0, 0, w, h);
    },
    sea(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal; const hz = h * .5;
      ctx.fillStyle = lin(ctx, 0, 0, 0, hz, [[0, d], [.55, b], [1, a]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(w * .3, hz - h * .1, Math.min(w, h) * .09, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, hz, 0, h, [[0, b], [1, d]]); ctx.fillRect(0, hz, w, h - hz);
      for (let i = 0; i < 46; i++) {
        const y = hz + Math.pow(i / 46, 1.6) * (h - hz); const amp = 1 + i * .25, wl = 30 + i * 4, ph = r() * 6;
        ctx.strokeStyle = i % 4 === 0 ? rgba(c, .7) : rgba('#ffffff', .12 + (i / 46) * .2); ctx.lineWidth = .8 + i * .05;
        ctx.beginPath(); for (let x = 0; x <= w; x += 4) { const yy = y + Math.sin(x / wl + ph) * amp; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke();
      }
    },
    city(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal; const base = h * .78;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [.75, b], [1, a]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rad(ctx, w * .5, base, 0, w * .9, [[0, rgba(c, .55)], [1, rgba(c, 0)]]); ctx.fillRect(0, 0, w, h);
      for (let layer = 0; layer < 3; layer++) {
        let x = -10; const col = mix(a, '#000000', .3 + layer * .25);
        while (x < w) {
          const bw = w * (.05 + r() * .09), bh = h * (.15 + r() * (.5 - layer * .1)) * (layer === 2 ? .7 : 1);
          ctx.fillStyle = col; ctx.fillRect(x, base - bh + layer * h * .06, bw, bh + h);
          if (layer > 0) for (let wy = base - bh + layer * h * .06 + 6; wy < h; wy += 7) for (let wx = x + 3; wx < x + bw - 3; wx += 6) if (r() < .28) { ctx.fillStyle = r() < .6 ? rgba(c, .9) : rgba(d, .9); ctx.fillRect(wx, wy, 2.5, 3); }
          x += bw + 1;
        }
      }
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 70; i++) { ctx.strokeStyle = rgba(d, .15); ctx.lineWidth = 1; const x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 18); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = lin(ctx, 0, base, 0, h, [[0, rgba(c, .25)], [1, rgba(a, 1)]]); ctx.fillRect(0, base + h * .1, w, h);
    },
    ink(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgba(d, .85); ctx.beginPath(); ctx.arc(w * .72, h * .2, Math.min(w, h) * .07, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = .25 + i * .17;
        ridge(ctx, w, h, h * (.42 + i * .1), h * (.16 - i * .015), .3, mix(a, c, .25 + i * .18), r, 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = lin(ctx, 0, h * (.42 + i * .1), 0, h * (.6 + i * .1), [[0, rgba(a, 0)], [1, rgba(a, .55)]]);
        ctx.fillRect(0, h * (.42 + i * .1), w, h * .2);
      }
      ctx.fillStyle = d; const s = Math.min(w, h) * .09; ctx.fillRect(w * .1, h * .1, s, s);
      ctx.fillStyle = a; ctx.font = `900 ${s * .6}px "Noto Serif SC", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('梦', w * .1 + s / 2, h * .1 + s / 2 + 1);
    },
    train(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal; const vx = w * .5, vy = h * .42;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rad(ctx, vx, vy, 0, w * .6, [[0, rgba(c, .6)], [1, rgba(c, 0)]]); ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(c, .5); ctx.lineWidth = 1.2;
      for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + i * w * .18, h); ctx.stroke(); }
      for (let i = 1; i < 14; i++) { const t = Math.pow(i / 14, 2); ctx.strokeStyle = rgba(c, .1 + t * .3); ctx.beginPath(); ctx.moveTo(0, vy + (h - vy) * t); ctx.lineTo(w, vy + (h - vy) * t); ctx.stroke(); }
      for (let i = 0; i < 8; i++) { const t = i / 8; ctx.fillStyle = rgba(d, .9 - t * .6); const x = vx + (w * .42) * (1 - t) * (i % 2 ? 1 : -1) * .9; ctx.beginPath(); ctx.arc(vx + (x - vx), vy - h * .25 * (1 - t), 2 + (1 - t) * 6, 0, 7); ctx.fill(); }
      ctx.fillStyle = mix(a, '#000000', .3); ctx.fillRect(0, 0, w, h * .12);
      ctx.fillStyle = rgba(c, .95); ctx.font = `900 ${h * .3}px "Roboto Flex", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = .18; ctx.fillText('7', vx, vy + h * .05); ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.fillRect(w * .62, h * .55, w * .04, h * .3); ctx.beginPath(); ctx.arc(w * .64, h * .53, w * .025, 0, 7); ctx.fill();
    },
    grid(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal; const hz = h * .6;
      ctx.fillStyle = lin(ctx, 0, 0, 0, hz, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * .7})`; ctx.fillRect(r() * w, r() * hz * .8, 1.2, 1.2); }
      const R = Math.min(w, h) * .24, cx = w / 2, cy = hz - R * .1;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.closePath(); ctx.clip();
      ctx.fillStyle = lin(ctx, 0, cy - R, 0, cy, [[0, c], [1, d]]); ctx.fillRect(cx - R, cy - R, R * 2, R);
      ctx.fillStyle = b; for (let i = 0; i < 7; i++) { const yy = cy - R * .55 + i * R * .09; ctx.fillRect(cx - R, yy, R * 2, 1.5 + i * 1.3); }
      ctx.restore();
      ctx.fillStyle = mix(a, '#000000', .5); ctx.fillRect(0, hz, w, h - hz);
      ctx.strokeStyle = rgba(d, .8); ctx.lineWidth = 1.2;
      for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 8, hz); ctx.lineTo(cx + i * w * .16, h); ctx.stroke(); }
      for (let i = 1; i < 12; i++) { const t = Math.pow(i / 12, 2.2); ctx.beginPath(); ctx.moveTo(0, hz + (h - hz) * t); ctx.lineTo(w, hz + (h - hz) * t); ctx.stroke(); }
      ctx.strokeStyle = rgba(c, .9); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w * .78, h * .08); ctx.lineTo(w * .55, h * .3); ctx.stroke();
    },
    snow(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, b], [.6, a], [1, d]]); ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 3; row++) {
        const col = mix(c, b, row * .3); const by = h * (.62 + row * .1);
        for (let x = -20; x < w + 20; x += 14 + r() * 18) { const th = h * (.1 + r() * .14) * (1 - row * .2); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, by - th); ctx.lineTo(x - th * .28, by); ctx.lineTo(x + th * .28, by); ctx.fill(); }
      }
      ctx.fillStyle = d; ctx.fillRect(0, h * .84, w, h);
      ctx.fillStyle = c; ctx.fillRect(w * .58, h * .79, 3, 12); ctx.beginPath(); ctx.arc(w * .58 + 1.5, h * .785, 2.6, 0, 7); ctx.fill();
      for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(255,255,255,${.4 + r() * .6})`; ctx.beginPath(); ctx.arc(r() * w, r() * h, r() * 2.2, 0, 7); ctx.fill(); }
    },
    fire(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [.5, b], [1, mix(c, b, .3)]]); ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 36; i++) { const x = r() * w, y = h * (.55 + r() * .5), R = w * (.08 + r() * .2); ctx.fillStyle = rad(ctx, x, y, 0, R, [[0, rgba(r() < .4 ? d : c, .55)], [1, rgba(c, 0)]]); ctx.beginPath(); ctx.ellipse(x, y, R * .6, R * 1.6, 0, 0, 7); ctx.fill(); }
      for (let i = 0; i < 120; i++) { ctx.fillStyle = rgba(d, r()); ctx.fillRect(r() * w, r() * h * .8, 1.5, 1.5); }
      ctx.globalCompositeOperation = 'source-over';
      ridge(ctx, w, h, h * .82, h * .05, .3, '#000000', r);
      for (let x = 0; x < w; x += 9 + r() * 10) { const th = h * (.05 + r() * .09); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(x, h * .8 - th); ctx.lineTo(x - th * .25, h * .86); ctx.lineTo(x + th * .25, h * .86); ctx.fill(); }
    },
    palace(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [.65, b], [1, a]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rad(ctx, w * .5, h * .3, 0, w * .7, [[0, rgba(d, .45)], [1, rgba(d, 0)]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgba(d, .9); ctx.beginPath(); ctx.arc(w * .5, h * .27, Math.min(w, h) * .12, 0, 7); ctx.fill();
      const roof = (cx, cy, rw, rh, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - rw, cy); ctx.quadraticCurveTo(cx - rw * .55, cy - rh * .1, cx - rw * .35, cy - rh); ctx.lineTo(cx + rw * .35, cy - rh); ctx.quadraticCurveTo(cx + rw * .55, cy - rh * .1, cx + rw, cy); ctx.closePath(); ctx.fill(); };
      const dark = mix(a, '#000000', .55);
      roof(w * .5, h * .5, w * .42, h * .07, dark); ctx.fillStyle = dark; ctx.fillRect(w * .2, h * .5, w * .6, h * .08);
      roof(w * .5, h * .62, w * .55, h * .06, dark); ctx.fillRect(w * .1, h * .62, w * .8, h * .4);
      for (let i = 0; i < 9; i++) { ctx.fillStyle = rgba(c, .9); ctx.fillRect(w * (.16 + i * .085), h * .66, w * .03, h * .05); }
      for (let i = 0; i < 26; i++) { const x = r() * w, y = h * (.1 + r() * .5); ctx.fillStyle = rgba(c, .8); ctx.beginPath(); ctx.ellipse(x, y, 3, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = rad(ctx, x, y, 0, 14, [[0, rgba(c, .35)], [1, rgba(c, 0)]]); ctx.fillRect(x - 14, y - 14, 28, 28); }
    },
    deep(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, b], [1, a]]); ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { ctx.fillStyle = lin(ctx, w * (.2 + i * .12), 0, w * (.1 + i * .1), h * .7, [[0, rgba(d, .12)], [1, rgba(d, 0)]]); ctx.beginPath(); ctx.moveTo(w * (.15 + i * .13), 0); ctx.lineTo(w * (.25 + i * .13), 0); ctx.lineTo(w * (.05 + i * .1), h * .8); ctx.lineTo(w * (-.05 + i * .1), h * .8); ctx.fill(); }
      const jx = w * .55, jy = h * .58;
      for (let k = 0; k < 14; k++) { ctx.strokeStyle = rgba(c, .5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(jx - w * .12 + k * w * .018, jy); for (let t = 0; t < 1; t += .05) ctx.lineTo(jx - w * .12 + k * w * .018 + Math.sin(t * 9 + k) * 6, jy + t * h * .3); ctx.stroke(); }
      ctx.fillStyle = rad(ctx, jx, jy, 0, w * .2, [[0, rgba(d, .9)], [.3, rgba(c, .5)], [1, rgba(c, 0)]]); ctx.beginPath(); ctx.ellipse(jx, jy, w * .14, h * .06, 0, Math.PI, 0); ctx.fill();
      for (let i = 0; i < 90; i++) { ctx.fillStyle = rgba(c, r() * .8); ctx.beginPath(); ctx.arc(r() * w, r() * h, r() * 1.8, 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    },
    blocks(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = b; ctx.beginPath(); ctx.arc(w * .7, h * .32, w * .3, 0, 7); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(w * .2, h * .78, w * .35, Math.PI, 0); ctx.fill();
      ctx.fillStyle = d; ctx.fillRect(w * .45, h * .58, w * .4, w * .4);
      ctx.fillStyle = a; ctx.beginPath(); ctx.arc(w * .65, h * .58 + w * .2, w * .12, 0, 7); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = w * .03; ctx.beginPath(); ctx.arc(w * .2, h * .3, w * .12, 0, Math.PI * 1.5); ctx.stroke();
      ctx.fillStyle = '#1b1b1b'; for (let i = 0; i < 5; i++) ctx.fillRect(w * (.08 + i * .05), h * .52, w * .025, h * .08);
    },
    planet(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, w, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * .9})`; const s = r() * 2; ctx.beginPath(); ctx.arc(r() * w, r() * h, s, 0, 7); ctx.fill(); }
      ctx.fillStyle = rad(ctx, w * .45, h * .82, 0, w * .7, [[0, d], [.6, mix(d, b, .5)], [1, b]]);
      ctx.beginPath(); ctx.arc(w * .5, h * 1.25, w * .75, 0, 7); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(w * .28, h * .28, w * .1, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(c, .7); ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(w * .35, h * .35); ctx.quadraticCurveTo(w * .8, h * .3, w * .6, h * .55); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.fillRect(w * .57, h * .53, w * .07, w * .05); ctx.fillStyle = d; ctx.beginPath(); ctx.moveTo(w * .57, h * .53); ctx.lineTo(w * .605, h * .53 + w * .03); ctx.lineTo(w * .64, h * .53); ctx.fill();
    },
    beam(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * .7})`; ctx.fillRect(r() * w, r() * h * .6, 1.2, 1.2); }
      const lx = w * .3, ly = h * .52;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = lin(ctx, lx, ly, w, ly - h * .25, [[0, rgba(c, .7)], [1, rgba(c, 0)]]);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(w * 1.1, ly - h * .38); ctx.lineTo(w * 1.1, ly - h * .02); ctx.fill();
      ctx.fillStyle = rad(ctx, lx, ly, 0, w * .2, [[0, rgba(c, .9)], [1, rgba(c, 0)]]); ctx.fillRect(lx - w * .2, ly - w * .2, w * .4, w * .4);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05080f'; ctx.beginPath(); ctx.moveTo(lx - w * .035, ly + 4); ctx.lineTo(lx + w * .035, ly + 4); ctx.lineTo(lx + w * .055, h * .75); ctx.lineTo(lx - w * .055, h * .75); ctx.fill();
      ctx.fillStyle = d; ctx.fillRect(lx - w * .025, ly - 6, w * .05, 10);
      ridge(ctx, w, h, h * .78, h * .04, .1, '#04060c', r);
      ctx.fillStyle = mix(b, '#000000', .3); ctx.fillRect(0, h * .84, w, h);
      for (let i = 0; i < 20; i++) { ctx.fillStyle = rgba(c, .25); ctx.fillRect(r() * w, h * (.85 + r() * .15), 20 + r() * 40, 1.5); }
    },
    tunnel(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal; const cx = w * .5, cy = h * .45;
      ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
      for (let i = 12; i >= 0; i--) { const t = i / 12; ctx.fillStyle = mix(a, b, 1 - t); ctx.beginPath(); ctx.ellipse(cx, cy, w * .08 + t * w * .7, h * .06 + t * h * .55, 0, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(c, .15 + (1 - t) * .4); ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.fillStyle = rad(ctx, cx, cy, 0, w * .25, [[0, rgba(d, 1)], [.3, rgba(c, .6)], [1, rgba(c, 0)]]); ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = rgba(c, .7); ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 6, cy + 10); ctx.lineTo(cx + s * w * .3, h); ctx.stroke(); }
      for (let i = 0; i < 10; i++) { const t = i / 10; ctx.fillStyle = rgba(d, .8); ctx.fillRect(cx - w * .4 * (1 - t) - 2, cy - h * .3 * (1 - t), 3 + (1 - t) * 4, 2); ctx.fillRect(cx + w * .4 * (1 - t), cy - h * .3 * (1 - t), 3 + (1 - t) * 4, 2); }
    },
    desert(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h * .6, [[0, d], [1, a]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgba('#ffffff', .85); ctx.beginPath(); ctx.arc(w * .68, h * .3, Math.min(w, h) * .14, 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = mix(b, c, i * .3); ctx.beginPath(); const y0 = h * (.55 + i * .1); ctx.moveTo(0, h);
        ctx.lineTo(0, y0); ctx.bezierCurveTo(w * .3, y0 - h * .1 * (1 + r()), w * .6, y0 + h * .08, w, y0 - h * .05 * r()); ctx.lineTo(w, h); ctx.fill();
      }
      ctx.strokeStyle = rgba(c, .6); ctx.setLineDash([3, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w * .2, h); ctx.quadraticCurveTo(w * .35, h * .75, w * .44, h * .66); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#2b1309'; ctx.fillRect(w * .43, h * .635, w * .05, h * .025); ctx.fillRect(w * .44, h * .62, w * .025, h * .02);
    },
    ice(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [.5, b], [1, c]]); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? rgba(d, .55) : rgba(c, .35 + i * .06); ctx.beginPath(); let x = 0; ctx.moveTo(0, h);
        const by = h * (.45 + i * .09);
        while (x <= w) { ctx.lineTo(x, by - r() * h * .12); x += w * (.06 + r() * .1); } ctx.lineTo(w, h); ctx.fill();
      }
      ctx.strokeStyle = rgba(d, .6); ctx.lineWidth = 1; for (let i = 0; i < 30; i++) { const x = r() * w, y = h * (.5 + r() * .5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - .5) * 40, y + r() * 30); ctx.stroke(); }
    },
    cat(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = d; ctx.beginPath(); ctx.arc(w * .75, h * .22, w * .12, 0, 7); ctx.fill();
      const cx = w * .5, cy = h * .62, R = w * .26;
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy + R * .9, R * 1.1, R * .9, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, R * .7, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - R * .62, cy - R * .2); ctx.lineTo(cx - R * .5, cy - R * 1.05); ctx.lineTo(cx - R * .12, cy - R * .6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + R * .62, cy - R * .2); ctx.lineTo(cx + R * .5, cy - R * 1.05); ctx.lineTo(cx + R * .12, cy - R * .6); ctx.fill();
      ctx.fillStyle = d; ctx.beginPath(); ctx.ellipse(cx - R * .25, cy - R * .05, R * .1, R * .14, 0, 0, 7); ctx.ellipse(cx + R * .25, cy - R * .05, R * .1, R * .14, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = w * .035; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx + R, cy + R * .7); ctx.quadraticCurveTo(cx + R * 1.6, cy + R * .4, cx + R * 1.3, cy - R * .3); ctx.stroke();
    },
    figure(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [.7, b], [1, mix(c, b, .4)]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rad(ctx, w * .5, h * .8, 0, w * .8, [[0, rgba(c, .7)], [1, rgba(c, 0)]]); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { ctx.strokeStyle = rgba(d, .2); ctx.beginPath(); const x = r() * w; ctx.moveTo(x, 0); ctx.lineTo(x + 10, h * .5); ctx.stroke(); }
      const fig = (x, s) => { ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.arc(x, h * .58 - s * .9, s * .2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - s * .32, h); ctx.lineTo(x - s * .3, h * .58 - s * .55); ctx.quadraticCurveTo(x, h * .58 - s * .8, x + s * .3, h * .58 - s * .55); ctx.lineTo(x + s * .32, h); ctx.fill(); ctx.fillRect(x + s * .2, h * .58 - s * .5, s * .7, s * .06); };
      fig(w * .5, h * .42); fig(w * .2, h * .3); fig(w * .8, h * .3);
      ctx.fillStyle = lin(ctx, 0, h * .8, 0, h, [[0, rgba(a, 0)], [1, a]]); ctx.fillRect(0, h * .8, w, h * .2);
    },
    forest(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, c], [.55, b], [1, a]]); ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 5; row++) {
        const t = row / 4; const col = mix(c, a, .25 + t * .75); const by = h * (.45 + row * .12);
        for (let x = -20; x < w + 20; x += 10 + r() * 16) { const th = h * (.12 + r() * .1); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, by - th); ctx.lineTo(x - th * .22, by); ctx.lineTo(x + th * .22, by); ctx.fill(); }
        ctx.fillStyle = col; ctx.fillRect(0, by, w, h);
        ctx.fillStyle = lin(ctx, 0, by - h * .05, 0, by + h * .04, [[0, rgba(c, 0)], [1, rgba(c, .35)]]); ctx.fillRect(0, by - h * .05, w, h * .09);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; for (let i = 0; i < 160; i++) { const x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 9); ctx.stroke(); }
    },
    radio(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, w, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      const cx = w * .5, cy = h * .52;
      for (let i = 1; i < 12; i++) { ctx.strokeStyle = rgba(i % 3 ? c : d, .5 - i * .035); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, i * w * .07, -Math.PI * .8, -Math.PI * .2); ctx.stroke(); }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, w * .05, 0, 7); ctx.fill();
      ctx.fillStyle = mix(a, '#000000', .3); ctx.fillRect(cx - w * .015, cy, w * .03, h * .4);
      ctx.fillStyle = d; ctx.font = `700 ${w * .07}px "Roboto Flex", sans-serif`; ctx.textAlign = 'center'; ctx.globalAlpha = .7; ctx.fillText('01:00 AM', cx, h * .2); ctx.globalAlpha = 1;
    },
    wave(ctx, w, h, p, r) {
      const [a, b, c, d] = p.pal;
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [1, b]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = d; ctx.beginPath(); ctx.arc(w * .78, h * .2, w * .08, 0, 7); ctx.fill();
      for (let i = 0; i < 7; i++) {
        const y0 = h * (.45 + i * .08); ctx.fillStyle = mix(b, c, i / 7);
        ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 6) ctx.lineTo(x, y0 + Math.sin(x / (w * .12) + i * 1.3) * h * .025 - (i === 1 && x > w * .2 && x < w * .7 ? Math.sin((x - w * .2) / (w * .5) * Math.PI) * h * .1 : 0)); ctx.lineTo(w, h); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(w * .45, h * .43, w * .12, h * .03, -.1, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * .55, h * .42); ctx.lineTo(w * .62, h * .38); ctx.lineTo(w * .6, h * .45); ctx.fill();
    },
  };

  function drawTitle(ctx, w, h, p) {
    const light = ['p3', 'p5', 'p8', 'p12', 'p16', 'p17', 'p18', 'p22'].includes(p.id);
    const fg = light ? '#16120f' : '#ffffff';
    ctx.save();
    ctx.shadowColor = light ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.55)'; ctx.shadowBlur = w * .04;
    ctx.fillStyle = fg; ctx.textAlign = 'center';
    const chars = [...p.t];
    if (p.title === 'vertical') {
      const s = Math.min(w * .17, (h * .62) / chars.length);
      ctx.font = `900 ${s}px "Noto Serif SC", serif`; ctx.textBaseline = 'middle';
      const x = w * .82, y0 = h * .1 + s / 2;
      chars.forEach((ch, i) => ctx.fillText(ch, x, y0 + i * s * 1.05));
      ctx.shadowBlur = 0; ctx.font = `600 ${w * .03}px "Roboto Flex", sans-serif`; ctx.globalAlpha = .8;
      ctx.save(); ctx.translate(x - s * .85, y0 - s * .4); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left'; ctx.fillText(p.en.split('').join(' '), 0, 0); ctx.restore();
    } else {
      let s = w * .17; ctx.font = `900 ${s}px "Noto Serif SC", serif`;
      const mw = ctx.measureText(p.t).width; if (mw > w * .84) { s *= (w * .84) / mw; ctx.font = `900 ${s}px "Noto Serif SC", serif`; }
      const y = p.title === 'top' ? h * .1 + s : h * .86;
      ctx.textBaseline = 'alphabetic'; ctx.fillText(p.t, w / 2, y);
      ctx.shadowBlur = 0; ctx.globalAlpha = .82; ctx.font = `600 ${w * .032}px "Roboto Flex", sans-serif`;
      ctx.fillText(p.en.split('').join(' '), w / 2, y + s * .42);
      ctx.globalAlpha = .6; ctx.font = `500 ${w * .026}px "Roboto Flex", sans-serif`;
      if (p.title !== 'top') ctx.fillText(String(p.y), w / 2, y + s * .72);
    }
    ctx.restore();
  }

  function finish(ctx, w, h) {
    ctx.save(); ctx.globalAlpha = .07; ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(noise(), 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore();
    ctx.fillStyle = rad(ctx, w / 2, h / 2, Math.min(w, h) * .45, Math.max(w, h) * .8, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.35)']]); ctx.fillRect(0, 0, w, h);
  }

  function render(p, w, h, withTitle) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); const r = rng(p.id + (withTitle ? 'p' : 'b'));
    (MOTIFS[p.motif] || MOTIFS.sun)(ctx, w, h, p, r);
    finish(ctx, w, h);
    if (withTitle) drawTitle(ctx, w, h, p);
    return c;
  }

  const cache = { poster: {}, backdrop: {}, canvas: {} };
  function toURL(canvas) { return new Promise(res => canvas.toBlob(b => res(URL.createObjectURL(b)), 'image/jpeg', .9)); }

  async function ensure(id, kind) {
    if (cache[kind][id]) return cache[kind][id];
    const p = byId[id]; if (!p) return null;
    const canvas = kind === 'poster' ? render(p, 360, 540, true) : render(p, 1280, 720, false);
    if (kind === 'poster') cache.canvas[id] = canvas;
    cache[kind][id] = toURL(canvas);
    return cache[kind][id];
  }

  async function paint(root = document) {
    const els = root.querySelectorAll('[data-poster],[data-backdrop]');
    await Promise.all([...els].map(async el => {
      const id = el.dataset.poster || el.dataset.backdrop;
      const kind = el.dataset.poster ? 'poster' : 'backdrop';
      const url = await ensure(id, kind);
      if (url) el.style.backgroundImage = `url(${url})`;
    }));
  }

  async function ready() {
    try {
      const titles = CATALOG.map(p => p.t).join('') + '梦';
      await Promise.race([
        Promise.all([
          document.fonts.load(`900 60px "Noto Serif SC"`, titles),
          document.fonts.load(`600 20px "Roboto Flex"`, 'ABC 0123'),
        ]),
        new Promise(r => setTimeout(r, 2500)),
      ]);
    } catch (e) { /* 字体失败则用回退字体绘制 */ }
  }

  window.MyBoxPosters = { CATALOG, byId, ensure, paint, ready, render, cache,
    canvas: id => { if (!cache.canvas[id]) { cache.canvas[id] = render(byId[id], 360, 540, true); } return cache.canvas[id]; } };
})();
