// Rendu « Néo-Tokyo » : direction artistique inspirée d'Akira.
// Mégastructure effondrée, béton et chair biomécanique, rouge Kaneda, néons, katakana.
// Tout est redessiné à partir de l'état du jeu original (GameView) ; le gameplay ne change pas.
(function (root) {
  'use strict';

  const W = 1280, H = 800, PS = 800, HX = 800;
  const SX = 8, SY = 4;                 // pixel mode 0 -> pixels HD
  const TW = 80, TH = 80;               // une tuile (10 x 20 pixels mode 0)
  const RED = '#ff2238', RED2 = '#c8102e', WHITE = '#f4f1ea';
  const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Helvetica Neue",Arial,sans-serif';
  const FONT_W = '"Helvetica Neue","Arial Black",Impact,sans-serif';

  // ---------- catégories de tuiles (communes à toutes les planètes) ----------
  function category(c) {
    if (c === 0x08) return 'empty';
    if (c <= 0x07) return 'turret';
    if ((c >= 0x09 && c <= 0x1D) || (c >= 0x40 && c <= 0x47)) return 'rock';
    if (c >= 0x1E && c <= 0x23) return 'field';
    if (c === 0x24 || c === 0x25 || c === 0x51 || c === 0x52 || c === 0x5B || c === 0x5C) return 'grav';
    if (c === 0x26) return 'brick';
    if (c === 0x27) return 'pad';
    if (c >= 0x28 && c <= 0x2B) return 'vortex';
    if (c >= 0x2C && c <= 0x37) return 'drone';
    if (c >= 0x38 && c <= 0x3B) return 'orb';
    if (c === 0x3C) return 'ring';
    if (c === 0x3D || c === 0x3E || (c >= 0x4C && c <= 0x50) || (c >= 0x53 && c <= 0x57) || c === 0x5A) return 'person';
    if (c === 0x3F) return 'capsule';
    if (c === 0x48 || c === 0x4B) return 'node';
    if (c === 0x49) return 'beamH';
    if (c === 0x4A) return 'beamV';
    if (c === 0x58) return 'terminal';
    if (c === 0x59) return 'disk';
    if (c === 0x5D) return 'glass';
    return 'unknown';
  }
  const STATIC = new Set(['rock', 'brick', 'pad', 'glass', 'empty']);

  // Teinte dominante par planète (le rouge reste la signature)
  const PLANET_HUE = [
    [255, 34, 56], [255, 34, 56], [255, 60, 140], [255, 110, 30], [80, 255, 120],
    [40, 220, 255], [180, 80, 255], [255, 20, 40], [255, 180, 40], [120, 200, 255], [255, 255, 255],
  ];

  // ---------- bruit ----------
  const PERM = new Uint8Array(512);
  (() => { const p = []; for (let i = 0; i < 256; i++) p.push(i); let s = 1234567; for (let i = 255; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7FFFFFFF; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; })();
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (a, b) => PERM[(PERM[a & 255] + b) & 511] / 255;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.03 + 17, y * 2.03 + 9) + 0.15 * vnoise(x * 4.1 + 31, y * 4.1 + 3);
  const ridge = (x, y) => 1 - Math.abs(2 * vnoise(x, y) - 1);
  const hash = (x, y) => PERM[(PERM[x & 255] + (y & 255)) & 511] / 255;

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / n;
        s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / n;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
  const SIGNS = ['危険', '立入禁止', '第七区画', '酸素', '着陸', '警告', '超能力', '実験体', '東京', '崩壊'];

  class NeoRenderer {
    constructor(target) {
      this.out = target;                  // canvas visible (passe d'effets WebGL dans neo_fx.js)
      this.scene = canvas(W, H);
      this.g = this.scene.getContext('2d');
      this.cache = new Map();             // fond de chaque écran
      this.city = null;
      this.trail = [];
      this.fx = { flash: 0, shake: 0, glitch: 0, aberr: 0 };
      this.explo = null;
      this.prevScreen = -1;
      this.slide = null;
      this.prevShip = null;
      this.particles = [];
      this.ash = [];
      for (let i = 0; i < 70; i++) this.ash.push({ x: Math.random() * PS, y: Math.random() * PS, v: 0.2 + Math.random() * 0.6, s: 1 + Math.random() * 2 });
      this.t = 0;
      this.events = [];
    }

    // Nouvelle partie : on oublie les effets en cours
    reset() {
      this.trail.length = 0; this.particles = []; this.movers = []; this.explo = null; this.slide = null;
      this.prevScreen = -1; this.dialogT = null;
      Object.assign(this.fx, { flash: 0, shake: 0, glitch: 0, aberr: 0 });
    }

    // ---------- fonds d'écran ----------
    tileMask(mem, code) {
      // pixels non noirs de la tuile -> solide
      const m = new Uint8Array(200);
      const base = 0x7ACC + code * 100;
      for (let y = 0; y < 20; y++) for (let xb = 0; xb < 5; xb++) {
        const b = mem[base + y * 5 + xb];
        if (GameView.PIX0[b]) m[y * 10 + xb * 2] = 1;
        if (GameView.PIX1[b]) m[y * 10 + xb * 2 + 1] = 1;
      }
      return m;
    }

    // Teinte d'une planète : couleur moyenne de ses rochers d'origine, saturée
    planetTint(st, mem) {
      this.tints = this.tints || {};
      if (this.tints[st.planet]) return this.tints[st.planet];
      const pal = this.palette;
      if (!pal) return PLANET_HUE[1];
      let r = 0, g = 0, b = 0, n = 0;
      for (let code = 0x09; code <= 0x0D; code++) {
        const base = 0x7ACC + code * 100;
        for (let i = 0; i < 100; i++) {
          const v = mem[base + i];
          for (const p of [GameView.PIX0[v], GameView.PIX1[v]]) {
            if (!p) continue;
            const c = pal[p];
            if (c[0] + c[1] + c[2] < 60) continue;
            r += c[0]; g += c[1]; b += c[2]; n++;
          }
        }
      }
      if (!n) return PLANET_HUE[1];
      r /= n; g /= n; b /= n;
      const lo = Math.min(r, g, b) * 0.7;
      r -= lo; g -= lo; b -= lo;
      const hi = Math.max(r, g, b) || 1;
      const tint = [255 * r / hi, 255 * g / hi, 255 * b / hi].map((v) => Math.max(20, v));
      this.tints[st.planet] = tint;
      return tint;
    }

    // Couleur d'un point de roche (coordonnées monde, éclairage déjà calculé)
    surface(wx, wy, hue, diff, rim, h, a) {
      // béton
      const n1 = fbm(wx / 95, wy / 95);
      const grain = vnoise(wx / 3, wy / 3) * 18;
      let r = 70 + 80 * n1 + grain, g = 60 + 66 * n1 + grain, b = 62 + 62 * n1 + grain;
      // dalles et fissures
      const slab = (Math.floor(wx / 64) + Math.floor(wy / 40) * 3) & 3;
      r += slab * 3; g += slab * 2;
      const cr = ridge(wx / 38 + 3 * vnoise(wx / 70, wy / 70), wy / 38);
      if (cr > 0.965) { r *= 0.35; g *= 0.35; b *= 0.35; }
      // chair biomécanique
      const fl = fbm(wx / 150 + 7, wy / 150 + 3);
      const flesh = Math.min(1, Math.max(0, (fl - 0.46) * 5)) * (0.5 + 0.5 * (1 - h));
      if (flesh > 0) {
        const lum = 0.55 + 0.45 * vnoise(wx / 12, wy / 12);
        r = r * (1 - flesh) + (hue[0] * 0.62 + 30 * lum) * flesh;
        g = g * (1 - flesh) + (hue[1] * 0.62 + 20 * lum) * flesh;
        b = b * (1 - flesh) + (hue[2] * 0.62 + 24 * lum) * flesh;
      }
      // éclairage
      const sh = 0.38 + 1.05 * diff;
      r *= sh; g *= sh; b *= sh;
      const rimK = Math.pow(rim, 2) * (1 - h) * 1.3;
      r += hue[0] * rimK; g += hue[1] * rimK; b += hue[2] * rimK;
      // profondeur : l'intérieur de la roche s'assombrit
      const deep = 1 - 0.45 * Math.min(1, Math.max(0, (h - 0.6) / 0.4));
      r *= deep; g *= deep; b *= deep;
      // liseré néon au bord
      if (a > 0.02 && a < 0.98) { const k = 1 - Math.abs(a - 0.5) * 2; r += hue[0] * 1.3 * k; g += hue[1] * 1.3 * k; b += hue[2] * 1.3 * k; }
      return [r, g, b];
    }

    buildScreen(st, mem) {
      const key = st.planet + ':' + st.screen;
      if (this.cache.has(key)) return this.cache.get(key);
      const hue = this.planetTint(st, mem);
      // masque solide en pixels mode 0 (100 x 200)
      const m0 = new Uint8Array(100 * 200);
      const kinds = [];
      for (let i = 0; i < 100; i++) {
        let code = st.raw[i] & 0x7F;
        if (st.raw[i] >= 0x80) code = 0x08;
        const cat = category(code);
        kinds.push(cat);
        if (cat !== 'rock' && cat !== 'pad') continue;
        const tm = this.tileMask(mem, code);
        const tx = i % 10, ty = Math.floor(i / 10);
        for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) {
          if (cat === 'pad' && y < 5) continue;
          if (tm[y * 10 + x]) m0[(ty * 20 + y) * 100 + tx * 10 + x] = 1;
        }
      }
      // fermeture morphologique : comble les joints noirs des décors en blocs (planètes « techno »)
      const dil = new Uint8Array(100 * 200), clo = new Uint8Array(100 * 200);
      const at = (a, x, y) => (x < 0 || y < 0 || x >= 100 || y >= 200) ? 1 : a[y * 100 + x];
      for (let y = 0; y < 200; y++) for (let x = 0; x < 100; x++) {
        let v = 0;
        for (let dy = -2; dy <= 2 && !v; dy++) for (let dx = -1; dx <= 1; dx++) if (at(m0, x + dx, y + dy)) { v = 1; break; }
        dil[y * 100 + x] = v;
      }
      for (let y = 0; y < 200; y++) for (let x = 0; x < 100; x++) {
        let v = 1;
        for (let dy = -2; dy <= 2 && v; dy++) for (let dx = -1; dx <= 1; dx++) if (!at(dil, x + dx, y + dy)) { v = 0; break; }
        clo[y * 100 + x] = v;
      }
      m0.set(clo);
      const N = PS;
      const big = new Float32Array(N * N);
      for (let y = 0; y < N; y++) {
        const my = Math.floor(y / SY);
        for (let x = 0; x < N; x++) big[y * N + x] = m0[my * 100 + Math.floor(x / SX)];
      }
      const A = boxBlur(boxBlur(big, N, N, 5), N, N, 5);
      const alpha = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) alpha[i] = Math.min(1, Math.max(0, (A[i] - 0.5) * 7 + 0.5));
      const Hh = boxBlur(boxBlur(alpha, N, N, 12), N, N, 12);
      const bg = canvas(N, N), veins = canvas(N, N);
      const bctx = bg.getContext('2d'), vctx = veins.getContext('2d');
      const img = bctx.createImageData(N, N), vimg = vctx.createImageData(N, N);
      const d = img.data, vd = vimg.data;
      const ox = st.cx * N, oy = st.cy * N;     // coordonnées monde : continuité entre écrans
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x;
          const a = alpha[i];
          if (a <= 0.003) continue;
          const wx = x + ox, wy = y + oy;
          const gx = Hh[i + 1] - Hh[i - 1], gy = Hh[i + N] - Hh[i - N];
          let nx = -gx * 18, ny = -gy * 18, nz = 1;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          const diff = Math.max(0, nx * -0.45 + ny * -0.6 + nz * 0.66);
          const rim = Math.max(0, nx * 0.3 + ny * 0.85 + nz * 0.2);
          const h = Hh[i];
          let [r, g, b] = this.surface(wx, wy, hue, diff, rim, h, a);
          const fl = fbm(wx / 150 + 7, wy / 150 + 3);
          d[i * 4] = Math.min(255, r); d[i * 4 + 1] = Math.min(255, g); d[i * 4 + 2] = Math.min(255, b); d[i * 4 + 3] = a * 255;
          // veines (calque animé)
          const vv = ridge(wx / 52 + 2 * vnoise(wx / 90 + 9, wy / 90), wy / 52 + 2 * vnoise(wx / 90, wy / 90 + 4));
          if (this.veins !== false && vv > 0.9 && fl > 0.42 && a > 0.9) {
            const k = (vv - 0.9) * 10 * Math.min(1, (fl - 0.42) * 6);
            vd[i * 4] = hue[0]; vd[i * 4 + 1] = hue[1]; vd[i * 4 + 2] = hue[2]; vd[i * 4 + 3] = Math.min(255, k * 255);
          }
        }
      }
      bctx.putImageData(img, 0, 0);
      vctx.putImageData(vimg, 0, 0);
      // éléments fixes dessinés par-dessus : panneaux, plateformes, verre
      for (let i = 0; i < 100; i++) {
        const x = (i % 10) * TW, y = Math.floor(i / 10) * TH;
        const seed = st.screen * 131 + i * 7 + st.planet * 17;
        if (kinds[i] === 'brick') this.drawPanel(bctx, x, y, seed, hue);
        else if (kinds[i] === 'glass') this.drawGlass(bctx, x, y);
        else if (kinds[i] === 'pad') this.drawPadBase(bctx, x, y, seed, kinds, i);
      }
      const entry = { bg, veins, kinds };
      this.cache.set(key, entry);
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
      return entry;
    }

    drawPanel(g, x, y, seed, hue) {
      g.save();
      const grd = g.createLinearGradient(x, y, x, y + TH);
      grd.addColorStop(0, '#2a2c33'); grd.addColorStop(1, '#14151a');
      g.fillStyle = grd; g.fillRect(x, y, TW, TH);
      g.strokeStyle = '#05060a'; g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, TW - 2, TH - 2);
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x, y + k * 20 + 0.5); g.lineTo(x + TW, y + k * 20 + 0.5); g.stroke(); }
      // rivets
      g.fillStyle = '#4a4d57';
      for (const [rx, ry] of [[6, 6], [TW - 8, 6], [6, TH - 8], [TW - 8, TH - 8]]) g.fillRect(x + rx, y + ry, 2, 2);
      if (hash(seed, 3) > 0.55) {
        g.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},0.85)`;
        g.font = `bold 15px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(SIGNS[seed % SIGNS.length].slice(0, 2), x + TW / 2, y + TH / 2 + 6);
      } else {
        // bandes d'alerte
        g.save(); g.beginPath(); g.rect(x + 4, y + TH - 16, TW - 8, 10); g.clip();
        for (let k = -2; k < 12; k++) { g.fillStyle = k % 2 ? '#111' : '#e8c01c'; g.beginPath(); g.moveTo(x + k * 10, y + TH - 6); g.lineTo(x + k * 10 + 10, y + TH - 16); g.lineTo(x + k * 10 + 20, y + TH - 16); g.lineTo(x + k * 10 + 10, y + TH - 6); g.fill(); }
        g.restore();
      }
      g.restore();
    }

    drawGlass(g, x, y) {
      g.save();
      g.fillStyle = 'rgba(120,220,255,0.18)'; g.fillRect(x + 2, y + 2, TW - 4, TH - 4);
      g.strokeStyle = 'rgba(160,240,255,0.7)'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, TW - 6, TH - 6);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + 12, y + TH - 14); g.lineTo(x + TW - 18, y + 10); g.stroke();
      g.restore();
    }

    drawPadBase(g, x, y, seed, kinds, i) {
      g.save();
      const left = i % 10 === 0 || kinds[i - 1] !== 'pad', right = i % 10 === 9 || kinds[i + 1] !== 'pad';
      g.fillStyle = '#16171c'; g.fillRect(x, y + 4, TW, 18);
      // bande d'alerte jaune/noir
      g.beginPath(); g.rect(x, y + 4, TW, 7); g.clip();
      for (let k = -2; k < 12; k++) { g.fillStyle = k % 2 ? '#0b0b0b' : '#f2c81f'; g.beginPath(); g.moveTo(x + k * 12, y + 11); g.lineTo(x + k * 12 + 7, y + 4); g.lineTo(x + k * 12 + 13, y + 4); g.lineTo(x + k * 12 + 6, y + 11); g.fill(); }
      g.restore();
      g.save();
      g.fillStyle = '#2c2f38'; g.fillRect(x, y + 11, TW, 11);
      if (left) { g.fillStyle = '#0b0b0b'; g.fillRect(x, y + 4, 3, 18); }
      if (right) { g.fillStyle = '#0b0b0b'; g.fillRect(x + TW - 3, y + 4, 3, 18); }
      if (left) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `bold 10px ${FONT}`; g.fillText('着陸', x + 6, y + 20); }
      g.restore();
    }

    // Panorama lointain de Néo-Tokyo (par planète)
    buildCity(planet, tint) {
      const c = canvas(2400, 900), g = c.getContext('2d');
      const hue = tint || PLANET_HUE[planet % PLANET_HUE.length] || PLANET_HUE[0];
      const sky = g.createLinearGradient(0, 0, 0, 900);
      sky.addColorStop(0, '#05030a'); sky.addColorStop(0.55, `rgb(${hue[0] * 0.18 | 0},${hue[1] * 0.04 | 0},${hue[2] * 0.06 | 0})`); sky.addColorStop(1, '#0a0206');
      g.fillStyle = sky; g.fillRect(0, 0, 2400, 900);
      let s = 99 + planet * 13;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (const layer of [{ k: 0.35, base: 520, col: '#0d0910' }, { k: 0.6, base: 640, col: '#07050a' }]) {
        let x = 0;
        while (x < 2400) {
          const w = 30 + rnd() * 90, h = 120 + rnd() * 380 * layer.k * 2;
          g.fillStyle = layer.col; g.fillRect(x, layer.base - h, w, 900);
          // fenêtres
          for (let wy = layer.base - h + 8; wy < 880; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) {
            if (rnd() < 0.07) { g.fillStyle = rnd() < 0.3 ? `rgba(${hue[0]},${hue[1]},${hue[2]},0.5)` : 'rgba(255,220,180,0.25)'; g.fillRect(wx, wy, 3, 2); }
          }
          if (rnd() < 0.18) { g.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},0.55)`; g.font = `bold 14px ${FONT}`; g.fillText(SIGNS[(rnd() * SIGNS.length) | 0], x + 3, layer.base - h + 30 + rnd() * 80); }
          x += w + rnd() * 12;
        }
      }
      // dôme de lumière blanche au loin (souvenir de l'explosion)
      const dome = g.createRadialGradient(1700, 700, 10, 1700, 700, 380);
      dome.addColorStop(0, 'rgba(255,255,255,0.18)'); dome.addColorStop(0.4, 'rgba(255,120,120,0.07)'); dome.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = dome; g.fillRect(1200, 300, 1000, 600);
      return { c, planet };
    }

    // ---------- objets animés ----------
    drawObject(g, cat, code, x, y, t, hue, idx) {
      const cx = x + TW / 2, cy = y + TH / 2;
      switch (cat) {
        case 'turret': return this.drawTurret(g, code, cx, cy, t);
        case 'field': return this.drawField(g, code, x, y, t, idx);
        case 'grav': return this.drawGrav(g, code, cx, cy, t);
        case 'vortex': return this.drawVortex(g, cx, cy, t, code);
        case 'drone': return this.drawDrone(g, cx, cy, t, code, hue);
        case 'orb': return this.drawOrb(g, cx, cy, t, code, hue);
        case 'ring': return this.drawRing(g, cx, cy, t);
        case 'person': return this.drawPerson(g, cx, y + TH, t, code);
        case 'capsule': return this.drawCapsule(g, cx, cy, t);
        case 'node': return this.drawNode(g, cx, cy, t);
        case 'beamH': return this.drawBeam(g, x, cy, TW, true, t);
        case 'beamV': return this.drawBeam(g, cx, y, TH, false, t);
        case 'terminal': return this.drawTerminal(g, x, y, t);
        case 'disk': return this.drawDisk(g, cx, cy, t);
        case 'pad': return this.drawPadLights(g, x, y, t, idx);
        default: return null;
      }
    }

    drawTurret(g, code, cx, cy, t) {
      const ang = [90, 135, 180, 225, 270, 315, 0, 45][code] * Math.PI / 180;
      const bx = cx - Math.cos(ang) * 30, by = cy - Math.sin(ang) * 30;
      g.save();
      g.translate(bx, by); g.rotate(ang);
      g.fillStyle = '#1b1c22'; g.beginPath(); g.arc(0, 0, 18, -Math.PI / 2, Math.PI / 2); g.fill();
      g.strokeStyle = '#3c3f4a'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#2b2d35'; g.fillRect(4, -5, 44, 10);
      g.fillStyle = '#0a0a0c'; g.fillRect(44, -4, 6, 8);
      const p = 0.5 + 0.5 * Math.sin(t * 6 + code);
      g.fillStyle = `rgba(255,${30 + 60 * p},${40 + 20 * p},1)`;
      g.shadowColor = RED; g.shadowBlur = 14;
      g.beginPath(); g.arc(8, 0, 4 + 1.5 * p, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    drawField(g, code, x, y, t, idx) {
      const vertical = code <= 0x20;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = k === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(150,120,255,0.55)';
        g.lineWidth = k === 0 ? 1.5 : 3;
        g.beginPath();
        const steps = 9;
        for (let s = 0; s <= steps; s++) {
          const f = s / steps;
          const j = (hash(idx * 7 + s, Math.floor(t * 20) + k) - 0.5) * 26;
          const px = vertical ? x + TW / 2 + j : x + f * TW;
          const py = vertical ? y + f * TH : y + TH / 2 + j;
          if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      }
      g.restore();
    }

    drawGrav(g, code, cx, cy, t) {
      const dirs = { 0x24: [[1, 0], [-1, 0]], 0x25: [[0, -1]], 0x51: [[-1, 0]], 0x52: [[1, 0]], 0x5B: [[0, -1], [0, 1]], 0x5C: [[0, 1]] }[code] || [[0, 1]];
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const [dx, dy] of dirs) {
        for (let k = 0; k < 3; k++) {
          const ph = ((t * 1.6 + k / 3) % 1);
          const px = cx + dx * (ph - 0.5) * 60, py = cy + dy * (ph - 0.5) * 60;
          const al = Math.sin(ph * Math.PI);
          g.strokeStyle = `rgba(90,230,255,${0.85 * al})`; g.lineWidth = 4;
          g.beginPath();
          const a = Math.atan2(dy, dx);
          g.moveTo(px + Math.cos(a + 2.4) * 14, py + Math.sin(a + 2.4) * 14);
          g.lineTo(px, py);
          g.lineTo(px + Math.cos(a - 2.4) * 14, py + Math.sin(a - 2.4) * 14);
          g.stroke();
        }
      }
      g.strokeStyle = 'rgba(90,230,255,0.25)'; g.lineWidth = 1;
      g.strokeRect(cx - 36, cy - 36, 72, 72);
      g.restore();
    }

    drawVortex(g, cx, cy, t, code) {
      g.save();
      g.translate(cx, cy);
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) {
        g.rotate(t * 2.2 + k * 1.25);
        g.strokeStyle = `rgba(${200 + k * 10},${220},255,${0.5 - k * 0.07})`;
        g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, 10 + k * 6, 0, Math.PI * 1.3); g.stroke();
      }
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 22);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(1, 'rgba(120,160,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    drawDrone(g, cx, cy, t, code, hue) {
      g.save();
      g.translate(cx, cy + Math.sin(t * 3 + code) * 3);
      g.fillStyle = '#0c0c10'; g.strokeStyle = '#3d3f4a'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, 0, 30, 13, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#1d1e25'; g.beginPath(); g.ellipse(0, -6, 14, 9, 0, Math.PI, 0); g.fill();
      const eye = (code % 4) / 3;
      g.fillStyle = `rgb(${hue[0]},${hue[1] * 0.5 + 40 * eye},${hue[2] * 0.6})`;
      g.shadowColor = RED; g.shadowBlur = 16;
      g.fillRect(-12, -2, 24, 4);
      for (let k = 0; k < 3; k++) { const a = t * 4 + k * 2.1; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(Math.cos(a) * 26 - 1, 4, 2, 2); }
      g.restore();
    }

    drawOrb(g, cx, cy, t, code, hue) {
      g.save();
      g.translate(cx, cy);
      const r = 20 + 2 * Math.sin(t * 5 + code);
      const grd = g.createRadialGradient(-6, -6, 2, 0, 0, r);
      grd.addColorStop(0, '#ffd0d6'); grd.addColorStop(0.4, `rgb(${hue[0]},${hue[1] * 0.4},${hue[2] * 0.5})`); grd.addColorStop(1, '#2a0008');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(80,0,10,0.9)'; g.lineWidth = 2;
      for (let k = 0; k < 7; k++) { const a = k * 0.9 + t * 0.6; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); g.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.8, Math.sin(a + 0.5) * r * 0.8, Math.cos(a + 0.2) * r, Math.sin(a + 0.2) * r); g.stroke(); }
      g.restore();
    }

    drawRing(g, cx, cy, t) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = k ? 'rgba(255,60,80,0.5)' : 'rgba(255,255,255,0.95)'; g.lineWidth = k ? 8 - k * 2 : 3;
        g.beginPath(); g.arc(cx, cy, 22 + 3 * Math.sin(t * 8), 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }

    // Survivant en combinaison blanche, emblème « capsule » rouge
    drawPerson(g, fx, fy, t, code) {
      const frame = code & 7;
      const wave = code === 0x3D || code === 0x3E || code === 0x56 || code === 0x57 || code === 0x4F;
      const up = wave && ((code & 1) === 0);
      const step = Math.sin((frame + t * 6) * 1.3) * (wave ? 0 : 7);
      g.save();
      g.translate(fx, fy);
      g.strokeStyle = '#0a0a0a'; g.lineWidth = 2;
      // jambes
      g.fillStyle = '#d9d4ca';
      g.fillRect(-9 + step * 0.3, -26, 7, 26); g.fillRect(2 - step * 0.3, -26, 7, 26);
      g.fillStyle = '#111'; g.fillRect(-10 + step * 0.3, -4, 9, 4); g.fillRect(2 - step * 0.3, -4, 9, 4);
      // corps
      g.fillStyle = WHITE; g.beginPath(); g.moveTo(-13, -50); g.lineTo(13, -50); g.lineTo(11, -24); g.lineTo(-11, -24); g.closePath(); g.fill(); g.stroke();
      // emblème capsule
      g.fillStyle = RED2; g.beginPath(); g.ellipse(0, -38, 6, 3.2, -0.5, 0, Math.PI * 2); g.fill();
      // bras
      g.strokeStyle = WHITE; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-12, -47); g.lineTo(up ? -22 : -16, up ? -66 : -30); g.stroke();
      g.beginPath(); g.moveTo(12, -47); g.lineTo(up ? 22 : 16, up ? -66 : -30); g.stroke();
      // tête et visière
      g.fillStyle = '#e9e5dc'; g.beginPath(); g.arc(0, -58, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#101018'; g.fillRect(-7, -61, 14, 5);
      g.fillStyle = 'rgba(255,40,60,0.9)'; g.fillRect(-6, -60, 4, 2);
      g.restore();
    }

    drawCapsule(g, cx, cy, t) {
      g.save(); g.translate(cx, cy + Math.sin(t * 2) * 4); g.rotate(-0.6);
      g.fillStyle = RED2; g.beginPath(); g.ellipse(-9, 0, 18, 11, 0, Math.PI / 2, Math.PI * 1.5); g.fill(); g.fillRect(-9, -11, 9, 22);
      g.fillStyle = WHITE; g.beginPath(); g.ellipse(9, 0, 18, 11, 0, -Math.PI / 2, Math.PI / 2); g.fill(); g.fillRect(0, -11, 9, 22);
      g.fillStyle = '#111'; g.font = `bold 13px ${FONT_W}`; g.textAlign = 'center'; g.fillText('E', 10, 5);
      g.restore();
    }

    drawNode(g, cx, cy, t) {
      g.save(); g.translate(cx, cy);
      g.fillStyle = '#121218'; g.strokeStyle = '#454856'; g.lineWidth = 2;
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); } g.closePath(); g.fill(); g.stroke();
      const p = 0.6 + 0.4 * Math.sin(t * 10);
      g.fillStyle = `rgba(255,${40 * p},${50 * p},1)`; g.shadowColor = RED; g.shadowBlur = 20;
      g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    drawBeam(g, x, y, len, horiz, t) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const fl = 0.75 + 0.25 * Math.sin(t * 40);
      for (const [w, col] of [[16, `rgba(255,20,40,${0.25 * fl})`], [7, `rgba(255,60,80,${0.7 * fl})`], [2.5, 'rgba(255,240,240,1)']]) {
        g.fillStyle = col;
        if (horiz) g.fillRect(x, y - w / 2, len, w); else g.fillRect(x - w / 2, y, w, len);
      }
      g.restore();
    }

    drawTerminal(g, x, y, t) {
      g.save();
      g.fillStyle = '#1a1b21'; g.fillRect(x + 8, y + 10, TW - 16, TH - 18);
      g.fillStyle = '#05140a'; g.fillRect(x + 14, y + 16, TW - 28, 36);
      g.fillStyle = 'rgba(80,255,140,0.9)'; g.font = `10px ${FONT}`;
      for (let k = 0; k < 3; k++) {
        let s = '';
        for (let c = 0; c < 4; c++) s += KATA[(Math.floor(t * 8) + k * 7 + c * 3) % KATA.length];
        g.fillText(s, x + 17, y + 27 + k * 11);
      }
      g.fillStyle = '#2f313b'; g.fillRect(x + 4, y + TH - 10, TW - 8, 8);
      g.restore();
    }

    drawDisk(g, cx, cy, t) {
      g.save(); g.translate(cx, cy + Math.sin(t * 3) * 4); g.rotate(Math.sin(t * 1.5) * 0.3);
      g.fillStyle = '#0d0e12'; g.fillRect(-15, -11, 30, 22);
      g.strokeStyle = 'rgba(80,240,255,0.95)'; g.lineWidth = 1.5; g.strokeRect(-15, -11, 30, 22);
      g.fillStyle = 'rgba(80,240,255,0.95)';
      for (let k = 0; k < 6; k++) g.fillRect(-13 + k * 5, 8, 3, 3);
      g.fillStyle = '#e9e5dc'; g.font = `bold 8px ${FONT}`; g.fillText('データ', -12, 1);
      g.restore();
    }

    drawPadLights(g, x, y, t, idx) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const on = ((Math.floor(t * 4) + k + idx) % 3) === 0;
        g.fillStyle = on ? 'rgba(80,255,220,1)' : 'rgba(40,120,110,0.5)';
        g.fillRect(x + 12 + k * 24, y + 14, 10, 4);
      }
      g.fillStyle = 'rgba(80,255,220,0.35)'; g.fillRect(x, y + 2, TW, 2);
      g.restore();
    }

    // ---------- objets mobiles ----------
    drawMovers(g, st, t, hue) {
      const objs = (st.objects || []).filter((o) => !o.grid || o.kind !== 'tile');
      const shipDst = st.ship ? st.ship.addr : -1;
      const prev = this.movers || [];
      const now = [];
      for (const o of objs) {
        if (o.dst === shipDst) continue;
        if (o.kind === 'ship' && st.ship && Math.abs(o.x - st.ship.x) < 8 && Math.abs(o.y - st.ship.y) < 8) continue;
        const cat = o.kind === 'tile' ? category(o.code) : o.kind;
        if (cat === 'empty' || cat === 'rock' || cat === 'brick' || cat === 'other') continue;
        const x = o.x * SX, y = o.y * SY, cx = x + TW / 2, cy = y + TH / 2;
        // suivi d'une image à l'autre : même famille, position proche
        let best = null, bd = 60;
        for (const p of prev) { if (p.cat !== cat) continue; const d = Math.hypot(p.cx - cx, p.cy - cy); if (d < bd) { bd = d; best = p; } }
        const trail = best ? best.trail.slice(-14) : [];
        if (!trail.length || Math.hypot(trail[trail.length - 1][0] - cx, trail[trail.length - 1][1] - cy) > 1) trail.push([cx, cy]);
        now.push({ cat, cx, cy, trail });
        if (cat === 'explo') { this.spawnBurst(cx, cy, best === null); continue; }
        if (trail.length > 2) this.drawStreak(g, trail, cat === 'orb' ? [255, 150, 60] : [hue[0], hue[1] * 0.6 + 60, hue[2] * 0.6 + 60]);
        if (cat === 'ship') this.drawShip(g, { x: o.x, y: o.y, frame: o.src === 0xA41C ? 7 : Math.max(0, Math.round((o.src - 0xA160) / 100)) }, t, false);
        else this.drawObject(g, cat, o.code, x, y, t, hue, o.dst & 0xFF);
      }
      this.movers = now;
      this.drawBullets(g, st.bullets || []);
      this.drawBursts(g);
    }

    // tirs : éclairs de plasma
    drawBullets(g, bullets) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const b of bullets) {
        const x = b.x * SX + 4, y = b.y * SY;
        const grd = g.createLinearGradient(x, y - 10, x, y + 26);
        grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,40,70,0)');
        g.fillStyle = 'rgba(255,40,70,0.35)'; g.fillRect(x - 7, y - 8, 14, 32);
        g.fillStyle = grd; g.fillRect(x - 2.5, y - 10, 5, 36);
      }
      g.restore();
    }

    drawStreak(g, pts, col) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      for (let i = 1; i < pts.length; i++) {
        const f = i / pts.length;
        g.strokeStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${0.5 * f})`;
        g.lineWidth = 3 + 9 * f;
        g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
      }
      g.restore();
    }

    // Explosion d'un ennemi : éclair et débris
    spawnBurst(x, y, fresh) {
      if (!fresh) return;
      this.fx.aberr = Math.max(this.fx.aberr, 0.4);
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hot: Math.random() < 0.5 });
      }
      this.particles.push({ x, y, ring: true, life: 1 });
    }

    drawBursts(g) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        p.life -= 0.035;
        if (p.ring) {
          g.strokeStyle = `rgba(255,255,255,${p.life})`; g.lineWidth = 6 * p.life;
          g.beginPath(); g.arc(p.x, p.y, 70 * (1 - p.life) + 6, 0, Math.PI * 2); g.stroke();
          continue;
        }
        p.x += p.vx; p.y += p.vy; p.vx *= 0.93; p.vy *= 0.93;
        g.fillStyle = p.hot ? `rgba(255,255,255,${p.life})` : `rgba(255,40,60,${p.life})`;
        g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      g.restore();
    }

    // ---------- vaisseau ----------
    drawShip(g, s, t, thrust) {
      const cx = s.x * SX + 40, cy = s.y * SY + 40;
      const ang = (7 - s.frame) * Math.PI / 4;   // 0 = vers le haut, sens horaire
      const dx = Math.sin(ang), dy = -Math.cos(ang);
      g.save();
      // flamme du réacteur, à l'opposé de la direction
      if (thrust) {
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          const L = 46 + Math.random() * 18 - k * 10;
          const grd = g.createLinearGradient(cx - dx * 22, cy - dy * 22, cx - dx * (22 + L), cy - dy * (22 + L));
          grd.addColorStop(0, k ? 'rgba(255,80,60,0.7)' : 'rgba(255,255,255,0.95)'); grd.addColorStop(1, 'rgba(255,0,40,0)');
          g.strokeStyle = grd; g.lineWidth = 16 - k * 5; g.lineCap = 'round';
          g.beginPath(); g.moveTo(cx - dx * 22, cy - dy * 22); g.lineTo(cx - dx * (22 + L), cy - dy * (22 + L)); g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
      }
      // coque : sphère rouge Kaneda
      const grd = g.createRadialGradient(cx - 10, cy - 12, 3, cx, cy, 30);
      grd.addColorStop(0, '#ffd9dc'); grd.addColorStop(0.25, '#ff3346'); grd.addColorStop(0.75, '#a00a1c'); grd.addColorStop(1, '#3a0008');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 28, 0, Math.PI * 2); g.fill();
      // bandeau noir et verrière
      g.save(); g.translate(cx, cy); g.rotate(ang);
      g.fillStyle = '#0b0b0f'; g.beginPath(); g.ellipse(0, 0, 28, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(120,230,255,0.9)'; g.fillRect(-12, -2, 24, 3);
      // nez / canon
      g.fillStyle = WHITE; g.beginPath(); g.moveTo(-7, -24); g.lineTo(7, -24); g.lineTo(0, -38); g.closePath(); g.fill();
      g.fillStyle = RED; g.fillRect(-2, -36, 4, 6);
      g.restore();
      // liseré
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 28, -2.6, -1.2); g.stroke();
      g.restore();
      return [cx, cy];
    }

    drawTrail(g) {
      if (this.trail.length < 2) return;
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [w, a] of [[14, 0.12], [6, 0.35], [2, 0.9]]) {
        for (let i = 1; i < this.trail.length; i++) {
          const p0 = this.trail[i - 1], p1 = this.trail[i];
          if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 120) continue;
          const f = i / this.trail.length;
          g.strokeStyle = `rgba(255,${30 + 40 * (1 - a)},${50},${a * f})`;
          g.lineWidth = w * f;
          g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
        }
      }
      g.restore();
    }

    // Explosion façon Akira : sphère blanche, onde de choc rouge
    drawExplosion(g, t) {
      const e = this.explo;
      if (!e) return;
      const k = (t - e.t0) / 1.6;
      if (k > 1) { this.explo = null; return; }
      g.save(); g.globalCompositeOperation = 'lighter';
      const r = 10 + 160 * Math.pow(k, 0.45);
      const core = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      core.addColorStop(0, `rgba(255,255,255,${1 - k})`); core.addColorStop(0.6, `rgba(255,240,240,${0.8 * (1 - k)})`); core.addColorStop(1, 'rgba(255,60,80,0)');
      g.fillStyle = core; g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(255,40,60,${0.9 * (1 - k)})`; g.lineWidth = 10 * (1 - k) + 2;
      g.beginPath(); g.arc(e.x, e.y, r * 1.35, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    // ---------- interface ----------
    drawHud(g, st, t) {
      g.save();
      g.fillStyle = '#07070a'; g.fillRect(HX, 0, W - HX, H);
      g.fillStyle = RED2; g.fillRect(HX, 0, 6, H);
      // logo
      g.save();
      g.translate(HX + 40, 92); g.transform(1, 0, -0.18, 1, 0, 0);
      g.font = `900 64px ${FONT_W}`; g.fillStyle = RED; g.fillText('INERTIE', 0, 0);
      g.restore();
      g.fillStyle = WHITE; g.font = `bold 20px ${FONT}`; g.fillText('イナーシャ  ネオ東京', HX + 44, 124);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = `11px ${FONT}`; g.fillText('PLANÈTE ' + String(Math.max(1, st.planet || 1)).padStart(2, '0') + ' // ÉCRAN ' + String(st.screen).padStart(3, '0'), HX + 44, 146);
      const hud = st.hud || {};
      const row = (y, jp, label, value, bar, warn) => {
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = `12px ${FONT}`; g.fillText(jp + '  ' + label, HX + 44, y);
        g.fillStyle = warn && (Math.floor(t * 4) % 2) ? RED : WHITE; g.font = `bold 38px ${FONT_W}`; g.fillText(value || '—', HX + 44, y + 40);
        if (bar !== undefined) {
          const segs = 24, on = Math.round(bar * segs);
          for (let k = 0; k < segs; k++) { g.fillStyle = k < on ? (warn ? RED : (k > segs * 0.66 ? WHITE : RED2)) : 'rgba(255,255,255,0.08)'; g.fillRect(HX + 44 + k * 15, y + 52, 11, 8); }
        }
      };
      const energy = parseInt(hud.ENERGIE || '0', 10), oxy = parseInt(hud.OXYGENE || '0', 10);
      row(200, '得点', 'SCORE', hud.SCORE);
      row(290, 'エネルギー', 'ÉNERGIE', hud.ENERGIE, Math.min(1, energy / 5000), energy < 1000);
      row(390, '酸素', 'OXYGÈNE', hud.OXYGENE, Math.min(1, oxy / 100), oxy < 25);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = `12px ${FONT}`; g.fillText('残機  VIES', HX + 44, 490); g.fillText('宇宙飛行士  COSMONAUTES', HX + 230, 490);
      g.fillStyle = WHITE; g.font = `bold 38px ${FONT_W}`; g.fillText(hud.VIES || '—', HX + 44, 530); g.fillText(hud.COSMONAUTES || '—', HX + 230, 530);
      this.drawMinimap(g, st, t);
      // bandes d'alerte
      g.save(); g.beginPath(); g.rect(HX + 6, H - 26, W - HX - 6, 26); g.clip();
      for (let k = -2; k < 40; k++) { g.fillStyle = k % 2 ? '#0b0b0b' : RED2; const x0 = HX + k * 18 - (t * 30) % 36; g.beginPath(); g.moveTo(x0, H); g.lineTo(x0 + 13, H - 26); g.lineTo(x0 + 26, H - 26); g.lineTo(x0 + 13, H); g.fill(); }
      g.restore();
      g.restore();
    }

    drawMinimap(g, st, t) {
      const mem = this.mem;
      if (!mem) return;
      const x0 = HX + 44, y0 = 566, cw = 32, ch = 18;   // 12 x 9 écrans
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = `12px ${FONT}`; g.fillText('地図  CARTE', x0, y0 - 8);
      for (let s = 0; s < 108; s++) {
        let solid = 0;
        for (let k = 0; k < 100; k += 3) if (category(mem[0x5038 + s * 100 + k] & 0x7F) === 'rock') solid++;
        const fill = solid / 34;
        if (fill > 0.97) continue;
        const sx = x0 + (s % 12) * cw, sy = y0 + Math.floor(s / 12) * ch;
        g.fillStyle = `rgba(200,20,40,${0.15 + 0.5 * fill})`; g.fillRect(sx, sy, cw - 2, ch - 2);
      }
      if (st.screen >= 0 && st.screen < 108) {
        const sx = x0 + (st.screen % 12) * cw, sy = y0 + Math.floor(st.screen / 12) * ch;
        g.strokeStyle = Math.floor(t * 3) % 2 ? WHITE : RED; g.lineWidth = 2; g.strokeRect(sx - 1, sy - 1, cw, ch);
      }
      g.restore();
    }

    // Messages de l'écran de bord : bulle de dialogue (cosmonaute) ou panneau de transmission
    drawMonitor(g, st, t) {
      const lines = (st.monitor || []).slice().sort((a, b) => a.y - b.y || a.x - b.x).map((l) => l.str.trim()).filter(Boolean);
      if (!lines.length) { this.dialogT = null; return; }
      const all = lines.join(' ');
      if (/BONJOUR|JE SUIS|PUIS JE|VENIR/.test(all)) {
        if (!this.dialogT) this.dialogT = t;
        this.drawBubble(g, st, lines, t);
      } else this.drawComm(g, lines, t);
    }

    personAnchor(st) {
      const cands = [];
      for (let i = 0; i < 100; i++) if (st.shown[i] >= 0 && category(st.shown[i]) === 'person') cands.push([(i % 10) * TW + TW / 2, Math.floor(i / 10) * TH + 8]);
      for (const m of this.movers || []) if (m.cat === 'person') cands.push([m.cx, m.cy - 32]);
      if (!cands.length) return [PS / 2, PS * 0.45];
      const s = this.lastShipPos || [PS / 2, PS / 2];
      cands.sort((a, b) => Math.hypot(a[0] - s[0], a[1] - s[1]) - Math.hypot(b[0] - s[0], b[1] - s[1]));
      return cands[0];
    }

    drawBubble(g, st, lines, t) {
      const [ax, ay] = this.personAnchor(st);
      // remise en forme : « BONJOUR / JE SUIS / NOM / PUIS JE / VENIR ? / OUI NON »
      let name = '';
      const i = lines.indexOf('JE SUIS');
      if (i >= 0 && lines[i + 1]) name = lines[i + 1];
      const choices = lines.find((l) => /OUI|NON/.test(l));
      const body = [];
      const tx0 = this.bubbleText || {};
      if (lines.includes('BONJOUR')) body.push(tx0.hello || 'BONJOUR !');
      if (name) body.push('JE SUIS ' + name + '.');
      if (lines.some((l) => /PUIS JE/.test(l))) body.push(tx0.ask || 'PUIS-JE VENIR ?');
      const k = Math.min(1, (t - this.dialogT) / 0.18);
      const W2 = 330, H2 = 40 + body.length * 34 + (choices ? 46 : 0);
      let bx = Math.min(PS - W2 - 12, Math.max(12, ax - W2 / 2)), by = Math.max(12, ay - H2 - 54);
      g.save();
      g.translate(ax, ay); g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); g.translate(-ax, -ay);
      g.globalAlpha = k;
      // ombre portée graphique
      g.fillStyle = RED2; this.roundRect(g, bx + 8, by + 8, W2, H2, 14); g.fill();
      g.fillStyle = WHITE; g.strokeStyle = '#000'; g.lineWidth = 4;
      this.roundRect(g, bx, by, W2, H2, 14); g.fill(); g.stroke();
      // queue vers le cosmonaute
      const tx = Math.min(bx + W2 - 40, Math.max(bx + 40, ax));
      g.beginPath(); g.moveTo(tx - 16, by + H2 - 2); g.lineTo(ax, ay - 6); g.lineTo(tx + 14, by + H2 - 2); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = WHITE; g.fillRect(tx - 14, by + H2 - 6, 28, 8);
      // texte
      g.fillStyle = '#0b0b0b'; g.font = `900 25px ${FONT_W}`;
      body.forEach((b, n) => {
        if (name && b.includes(name)) {
          const pre = 'JE SUIS ';
          g.fillStyle = '#0b0b0b'; g.fillText(pre, bx + 22, by + 46 + n * 34);
          g.fillStyle = RED2; g.fillText(name, bx + 22 + g.measureText(pre).width, by + 46 + n * 34);
          g.fillStyle = '#0b0b0b'; g.fillText('.', bx + 22 + g.measureText(pre + name).width, by + 46 + n * 34);
        } else g.fillText(b, bx + 22, by + 46 + n * 34);
      });
      if (choices) {
        const y = by + H2 - 40;
        for (const [label, x, key] of [['OUI', bx + 22, 'O'], ['NON', bx + 170, 'N']]) {
          g.fillStyle = label === 'OUI' ? RED2 : '#0b0b0b';
          g.fillRect(x, y, 130, 30);
          g.fillStyle = WHITE; g.font = `900 20px ${FONT_W}`; g.fillText(label, x + 14, y + 22);
          g.font = `bold 12px ${FONT}`; g.fillText('touche ' + key, x + 66, y + 20);
        }
      }
      g.restore();
      // petit kanji « parole » au coin
      g.save(); g.fillStyle = RED; g.font = `bold 16px ${FONT}`; g.globalAlpha = k; g.fillText(tx0.mark || '声', bx + W2 - 30, by + 26); g.restore();
    }

    drawComm(g, lines, t) {
      const x0 = HX + 36, y0 = 548, w = 420, h = 24 + lines.length * 26 + 14;
      g.save();
      g.fillStyle = 'rgba(8,8,12,0.96)'; g.fillRect(x0, y0, w, Math.max(h, 120));
      g.strokeStyle = Math.floor(t * 3) % 2 ? RED : WHITE; g.lineWidth = 2; g.strokeRect(x0, y0, w, Math.max(h, 120));
      g.fillStyle = RED2; g.fillRect(x0, y0, w, 22);
      g.fillStyle = WHITE; g.font = `bold 13px ${FONT}`; g.fillText(this.commTitle || '通信  //  TRANSMISSION', x0 + 10, y0 + 16);
      g.font = `bold 20px ${FONT_W}`;
      lines.forEach((l, n) => { g.fillStyle = WHITE; g.fillText(l, x0 + 14, y0 + 48 + n * 26); });
      if (Math.floor(t * 2) % 2) { g.fillStyle = RED; g.fillRect(x0 + 14, y0 + 36 + lines.length * 26, 12, 16); }
      g.restore();
    }

    roundRect(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }

    drawTextLines(g, lines, playOnly) {
      g.save();
      for (const ln of lines) {
        const s = ln.str.trim();
        if (!s) continue;
        const x = ln.x * SX + 4, y = ln.y * SY;
        g.font = `bold 22px ${FONT_W}`;
        const w = g.measureText(s).width;
        g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(x - 8, y - 4, w + 16, 34);
        g.fillStyle = RED2; g.fillRect(x - 8, y - 4, 4, 34);
        g.fillStyle = WHITE; g.fillText(s, x, y + 22);
      }
      g.restore();
    }

    // ---------- écrans hors partie ----------
    drawTitle(g, st, t) {
      if (!this.city || this.city.planet !== 1) this.city = this.buildCity(1);
      g.drawImage(this.city.c, (t * 12) % 1200, 0, 1280, 900, 0, -60, 1280, 900);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, W, H);
      // logo
      g.save();
      g.translate(120, 230); g.transform(1, 0, -0.2, 1, 0, 0);
      g.font = `900 150px ${FONT_W}`;
      g.fillStyle = '#000'; g.fillText('INERTIE', 8, 8);
      g.fillStyle = RED; g.fillText('INERTIE', 0, 0);
      g.restore();
      g.fillStyle = WHITE; g.font = `bold 34px ${FONT}`; g.fillText('イナーシャ', 130, 285);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = `14px ${FONT}`; g.fillText('NÉO-TOKYO  //  2019  //  ZORGLUB A ENFERMÉ LES SAVANTS', 132, 312);
      // texte du jeu (menu, code, scores...)
      const all = st.texts.filter((s) => s.str.trim());
      g.font = `bold 28px ${FONT_W}`;
      let y = 390;
      if (st.credits || !all.length) {
        const cred = ['PROGRAMME  CHRISTOPHE LE BOUIL', 'GRAPHISME  PATRICK DAHER', 'MUSIQUE  XAVIER TALGORN', 'UBI SOFT  1987', '', 'APPUYEZ SUR UNE TOUCHE'];
        for (const c of cred) { g.fillStyle = c.startsWith('APPUYEZ') ? (Math.floor(t * 2) % 2 ? RED : WHITE) : WHITE; g.fillText(c, 132, y); y += 40; }
      } else {
        for (const ln of all) {
          const s = ln.str.trim();
          const isCode = /^[A-Z0-9]{1,6}$/.test(s) && ln.y > 80 && ln.y < 130;
          g.fillStyle = /^\d /.test(s) ? WHITE : (isCode ? RED : 'rgba(255,255,255,0.85)');
          g.fillText(s, 132 + (ln.x >= 50 ? 560 : 0), 380 + ln.y * 1.8);
        }
      }
      g.fillStyle = RED2; g.fillRect(0, H - 12, W, 12);
    }

    // ---------- image ----------
    render(st, mem, input, dt) {
      this.mem = mem;
      this.t += dt;
      const t = this.t, g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      if (st.phase !== 'play') {
        this.drawTitle(g, st, t);
        this.trail.length = 0;
        this.prevScreen = -1;
        return this.finish(t);
      }
      const hue = this.planetTint(st, mem);
      if (!this.city || this.city.planet !== st.planet) this.city = this.buildCity(st.planet, hue);
      const scr = this.buildScreen(st, mem);
      // changement d'écran : glissement et parasites
      if (this.prevScreen !== -1 && st.screen !== this.prevScreen) {
        const dx = (st.screen % 12) - (this.prevScreen % 12), dy = Math.floor(st.screen / 12) - Math.floor(this.prevScreen / 12);
        this.slide = { from: this.cache.get(st.planet + ':' + this.prevScreen), dx, dy, t0: t };
        this.fx.glitch = 0.6;
        this.trail.length = 0;
        this.events.push('screen');
      }
      this.prevScreen = st.screen;
      // tremblement
      const sh = this.fx.shake;
      g.save();
      if (sh > 0) g.translate((Math.random() - 0.5) * sh * 20, (Math.random() - 0.5) * sh * 20);
      g.beginPath(); g.rect(0, 0, PS, PS); g.clip();
      // ciel lointain (parallaxe selon la position dans la planète)
      const px = (st.cx * 180 + 300) % 1600, py = 60 + st.cy * 22;
      g.drawImage(this.city.c, px, py, 800, 800 * 0.75, 0, 0, PS, PS);
      if (this.haze !== false) {
      const haze = g.createLinearGradient(0, 0, 0, PS);
      haze.addColorStop(0, 'rgba(0,0,0,0.55)'); haze.addColorStop(1, `rgba(${hue[0] * 0.25 | 0},0,${hue[2] * 0.08 | 0},0.35)`);
      g.fillStyle = haze; g.fillRect(0, 0, PS, PS);
      }
      // cendres
      g.fillStyle = this.ashColor || 'rgba(255,220,220,0.35)';
      for (const a of this.ash) { a.y += a.v; a.x += Math.sin(t + a.y / 50) * 0.3; if (a.y > PS) { a.y = -4; a.x = Math.random() * PS; } g.fillRect(a.x, a.y, a.s, a.s); }
      // fond de l'écran (avec glissement à l'entrée)
      let off = [0, 0];
      if (this.slide) {
        const k = Math.min(1, (t - this.slide.t0) / 0.35);
        const e = 1 - Math.pow(1 - k, 3);
        if (this.slide.from) g.drawImage(this.slide.from.bg, -this.slide.dx * PS * e, -this.slide.dy * PS * e);
        off = [this.slide.dx * PS * (1 - e), this.slide.dy * PS * (1 - e)];
        if (k >= 1) this.slide = null;
      }
      g.drawImage(scr.bg, off[0], off[1]);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45 + 0.4 * Math.sin(t * 2.2);
      g.drawImage(scr.veins, off[0], off[1]); g.restore();
      // objets
      g.save(); g.translate(off[0], off[1]);
      for (let i = 0; i < 100; i++) {
        let code = st.shown[i];
        if (code < 0) { if ((st.raw[i] & 0x7F) !== 0x27) continue; code = 0x27; }
        const cat = category(code);
        if (STATIC.has(cat) && cat !== 'pad') continue;
        this.drawObject(g, cat, code, (i % 10) * TW, Math.floor(i / 10) * TH, t, hue, i);
      }
      // objets mobiles (dessinés hors grille par le jeu), avec traînée lumineuse
      this.drawMovers(g, st, t, hue);
      g.restore();
      // pixels non identifiés (tirs, missiles, débris) : éclats de néon
      if (st.residual && st.residual.length) {
        g.save(); g.globalCompositeOperation = 'lighter';
        const pal = this.palette;
        for (let k = 0; k < st.residual.length; k += 3) {
          const pen = st.residual[k + 2];
          const c = pal[pen];
          if (!pen || c[0] + c[1] + c[2] < 40) continue;
          g.fillStyle = `rgba(${Math.min(255, c[0] + 80)},${Math.min(255, c[1] + 40)},${Math.min(255, c[2] + 60)},0.95)`;
          g.fillRect(st.residual[k] * SX, st.residual[k + 1] * SY, SX, SY);
        }
        g.restore();
      }
      // vaisseau, traînée, explosion
      const s = st.ship;
      if (s && s.frame >= 0) {
        const c = [s.x * SX + 40, s.y * SY + 40];
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(last.x - c[0], last.y - c[1]) > 2) this.trail.push({ x: c[0], y: c[1] });
        if (this.trail.length > 40) this.trail.shift();
        this.drawTrail(g);
        this.drawShip(g, s, t, input.thrust);
        this.lastShipPos = c;
      } else if (this.trail.length) this.trail.shift();
      if (s && s.explo === 0 && (!this.explo || t - this.explo.t0 > 1.2)) {
        const c = [s.x * SX + 40, s.y * SY + 40];
        this.explo = { x: c[0], y: c[1], t0: t };
        this.fx.flash = 1; this.fx.shake = 1; this.fx.aberr = 1;
        this.events.push('explode');
      }
      this.drawExplosion(g, t);
      // textes du jeu dans la zone de jeu (messages)
      this.drawTextLines(g, st.playTexts);
      this.drawMonitorPlay = true;
      g.restore();
      this.drawHud(g, st, t);
      // dialogues et transmissions de l'écran de bord (par-dessus le jeu et le tableau de bord)
      this.drawMonitor(g, st, t);
      return this.finish(t);
    }

    finish(t) {
      const f = this.fx;
      f.flash *= 0.9; f.shake *= 0.88; f.glitch *= 0.9; f.aberr *= 0.92;
      return this.scene;
    }
  }

  NeoRenderer.category = category;
  NeoRenderer.lib = { W, H, PS, HX, SX, SY, TW, TH, fbm, vnoise, ridge, hash, canvas, category, FONT, FONT_W };
  root.NeoRenderer = NeoRenderer;
})(window);
