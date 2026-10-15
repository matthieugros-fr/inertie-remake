// Lecture de l'état visible du jeu original, image par image, pour le rendu Néo-Tokyo.
// Le gameplay reste celui du code de 1987 : on ne fait qu'observer sa mémoire et son écran.
(function (root) {
  'use strict';

  const MAP0 = 0x5038, TILES = 0x7ACC, NTILES = 0x5E;
  const SHIP_FRAMES = 0xA160, EXPLO_FRAMES = [0xA034, 0xA098, 0xA0FC];

  const lineAddr = (L) => 0xC000 + (L & 7) * 0x800 + (L >> 3) * 80;
  const nextLine = (a) => { let b = a + 0x800; if (b > 0xFFFF) b = (b + 0xC050) & 0xFFFF; return b; };
  function addrXY(a) {
    const off = a - 0xC000;
    if (off < 0 || off >= 0x4000) return null;
    const r = off & 0x7FF;
    return { x: r % 80, y: (off >> 11) + 8 * Math.floor(r / 80) };
  }
  // Pixels mode 0 d'un octet
  const PIX0 = new Uint8Array(256), PIX1 = new Uint8Array(256);
  for (let b = 0; b < 256; b++) {
    PIX0[b] = ((b >> 7) & 1) | ((b >> 2) & 2) | ((b >> 3) & 4) | ((b << 2) & 8);
    PIX1[b] = ((b >> 6) & 1) | ((b >> 1) & 2) | ((b >> 2) & 4) | ((b << 3) & 8);
  }

  class GameView {
    constructor(m) {
      this.m = m;
      this.text = new Map();     // adresse écran -> { ch, glyph }
      this.lastChar = 0;
      this.tileKey = '';
      this.tileIndex = new Map();
      this.lastShip = null;
      this.blits = new Map();    // adresse écran -> source des graphismes (routine &0FC2)
      this.bullets = new Map();  // adresse écran -> couleur (routine &0EEB, tirs)
      this.install();
    }

    install() {
      const m = this.m;
      // &0F22 : affichage d'un caractère (A) à la position (&0405)
      m.hooks.set(0x0F22, (cpu) => { this.lastChar = cpu.a; });
      // &0F70 : dessin effectif du glyphe (&0407) en (&0405)
      m.hooks.set(0x0F70, (cpu, mm) => {
        const pos = mm.mem[0x0405] | (mm.mem[0x0406] << 8);
        const glyph = mm.mem[0x0407] | (mm.mem[0x0408] << 8);
        this.text.set(pos, { ch: String.fromCharCode(this.lastChar), glyph });
      });
      // &0FC2 : copie d'un bloc 5 octets x 20 lignes (tuiles, objets mobiles, sprites)
      m.hooks.set(0x0FC2, (cpu) => { this.blits.set(cpu.de, cpu.hl); });
      // &0EEB : trait vertical de 4 lignes (tirs) ; couleur 0 = effacement
      m.hooks.set(0x0EEB, (cpu, mm) => {
        const col = mm.mem[0x0409];
        if (col) this.bullets.set(cpu.hl, col); else this.bullets.delete(cpu.hl);
      });
    }

    // Le bloc est-il encore (au moins aux trois quarts) à l'écran ? Tolère le chevauchement d'objets
    blockVisible(dst, src) {
      const mem = this.m.mem;
      let a = dst, bad = 0, ink = 0;
      for (let k = 0; k < 20; k++) {
        for (let i = 0; i < 5; i++) {
          const v = mem[src + k * 5 + i];
          if (v) ink++;
          if (mem[a + i] !== v && ++bad > 25) return false;
        }
        a = nextLine(a);
      }
      return ink > 0 || bad === 0;
    }

    // Objets dessinés hors de la grille (soucoupes, comètes, boules de feu, explosions...)
    readObjects() {
      const out = [];
      for (const [dst, src] of this.blits) {
        if (!this.blockVisible(dst, src)) { this.blits.delete(dst); continue; }
        const p = addrXY(dst);
        if (!p || p.x >= 50) continue;
        let code = -1;
        if (src >= TILES && src < TILES + NTILES * 100 && (src - TILES) % 100 === 0) code = (src - TILES) / 100;
        const kind = code >= 0 ? 'tile' : src === 0xA41C ? 'ship' : EXPLO_FRAMES.includes(src) ? 'explo' : (src >= SHIP_FRAMES && src < SHIP_FRAMES + 800) ? 'ship' : 'other';
        const grid = p.x % 5 === 0 && p.y % 20 === 0;
        out.push({ x: p.x * 2, y: p.y, code, kind, src, grid, dst });
      }
      return out;
    }

    readBullets() {
      const mem = this.m.mem, out = [];
      for (const [dst, col] of this.bullets) {
        let a = dst, ok = true;
        for (let k = 0; k < 4; k++) { if (mem[a] !== col) { ok = false; break; } a = nextLine(a); }
        const p = addrXY(dst);
        if (!ok || !p || p.x >= 50) { this.bullets.delete(dst); continue; }
        out.push({ x: p.x * 2, y: p.y, pen: PIX0[col] || PIX1[col], dst });
      }
      return out;
    }

    // Index des graphismes de tuiles de la planète en mémoire (clé = 100 octets)
    refreshTiles() {
      const mem = this.m.mem;
      const key = mem[0x7AC8] + ':' + mem[TILES + 900] + ':' + mem[TILES + 2500] + ':' + mem[TILES + 7300];
      if (key === this.tileKey) return;
      this.tileKey = key;
      this.tileIndex.clear();
      for (let c = NTILES - 1; c >= 0; c--) {
        const k = this.blockKey(TILES + c * 100);
        this.tileIndex.set(k, c);
      }
    }

    blockKey(addr) {
      const mem = this.m.mem;
      let s = '';
      for (let i = 0; i < 100; i++) s += String.fromCharCode(mem[addr + i]);
      return s;
    }

    cellKey(tx, ty) {
      const mem = this.m.mem;
      let s = '';
      for (let k = 0; k < 20; k++) {
        const a = lineAddr(ty * 20 + k) + tx * 5;
        for (let i = 0; i < 5; i++) s += String.fromCharCode(mem[a + i]);
      }
      return s;
    }

    // Un glyphe de texte est-il encore visible à l'écran ?
    textVisible(pos, glyph) {
      const mem = this.m.mem;
      let a = pos;
      for (let k = 0; k < 7; k++) {
        if (mem[a] !== mem[glyph + k * 2] || mem[a + 1] !== mem[glyph + k * 2 + 1]) return false;
        a = nextLine(a);
      }
      return true;
    }

    readTexts() {
      const lines = new Map();
      for (const [pos, t] of this.text) {
        if (!this.textVisible(pos, t.glyph)) { this.text.delete(pos); continue; }
        const p = addrXY(pos);
        if (!p) continue;
        const key = p.y;
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key).push({ x: p.x, ch: t.ch });
      }
      const out = [];
      for (const [y, chars] of lines) {
        chars.sort((a, b) => a.x - b.x);
        // regroupe en segments (deux octets par caractère)
        let seg = null;
        for (const c of chars) {
          if (seg && c.x - seg.end <= 2 + 4) {
            seg.str += ' '.repeat(Math.max(0, (c.x - seg.end) / 2)) + c.ch;
            seg.end = c.x + 2;
          } else {
            seg = { x: c.x, y, str: c.ch, end: c.x + 2 };
            out.push(seg);
          }
        }
      }
      out.sort((a, b) => a.y - b.y || a.x - b.x);
      return out;
    }

    // État du vaisseau d'après son adresse écran et le sprite affiché
    readShip() {
      const mem = this.m.mem;
      const addr = mem[0x040B] | (mem[0x040C] << 8);
      const p = addrXY(addr);
      if (!p || p.x > 45) return null;
      const match = (src) => {
        let a = addr;
        for (let k = 0; k < 20; k++) {
          for (let i = 0; i < 5; i++) if (mem[a + i] !== mem[src + k * 5 + i]) return false;
          a = nextLine(a);
        }
        return true;
      };
      for (let f = 0; f < 8; f++) {
        if (match(SHIP_FRAMES + f * 100)) { this.lastShip = { x: p.x * 2, y: p.y, frame: f, addr, explo: -1, at: this.m.frame }; return this.lastShip; }
      }
      if (match(0xA41C)) { this.lastShip = { x: p.x * 2, y: p.y, frame: 7, addr, explo: -1, at: this.m.frame }; return this.lastShip; }
      for (let e = 0; e < 3; e++) if (match(EXPLO_FRAMES[e])) { this.lastShip = null; return { x: p.x * 2, y: p.y, frame: -1, addr, explo: e }; }
      // le jeu redessine le vaisseau en deux temps : on garde la dernière image vue (2 trames au plus)
      const ls = this.lastShip;
      if (ls && this.m.frame - ls.at <= 2 && Math.abs(ls.y - p.y) <= 3 && Math.abs(ls.x - p.x * 2) <= 4) return { ...ls, x: p.x * 2, y: p.y, addr };
      return { x: p.x * 2, y: p.y, frame: -1, addr, explo: -1, hidden: true };
    }

    // Image complète de l'état visible
    read() {
      const m = this.m, mem = m.mem;
      this.refreshTiles();
      const mapPtr = mem[0x042C] | (mem[0x042D] << 8);
      const sIndex = Math.round((mapPtr - MAP0) / 100);
      const raw = new Uint8Array(100), shown = new Int16Array(100);
      let matched = 0;
      for (let i = 0; i < 100; i++) {
        raw[i] = mem[mapPtr + i];
        const c = this.tileIndex.get(this.cellKey(i % 10, Math.floor(i / 10)));
        shown[i] = c === undefined ? -1 : c;
        if (c !== undefined) matched++;
      }
      const texts = this.readTexts();
      const ship = this.readShip();
      const inMap = sIndex >= 0 && sIndex < 108 && (mapPtr - MAP0) % 100 === 0;
      const hudTexts = texts.filter((t) => t.x >= 50 && t.y < 90);
      // écran de bord du tableau de bord : dialogues des cosmonautes, liste des espions, guidage...
      const monitor = texts.filter((t) => t.x >= 52 && t.y >= 100 && t.y < 185 && t.str.trim());
      const playTexts = texts.filter((t) => t.x < 50);
      const hasHud = hudTexts.some((t) => /SCORE/.test(t.str));
      const phase = inMap && hasHud && matched >= 40 ? 'play' : 'other';
      const state = {
        phase, planet: 1 + Math.max(0, 'EWIZSFCDKY'.indexOf(String.fromCharCode(mem[0x7AC8]))), mapPtr, screen: sIndex, cx: sIndex % 12, cy: Math.floor(sIndex / 12),
        raw, shown, matched, ship, texts, hudTexts, playTexts, monitor, hud: this.parseHud(hudTexts, mem),
        credits: m.blocked === 0xBB18 && !hasHud,
        frame: m.frame,
      };
      if (phase === 'play') {
        state.objects = this.readObjects();
        state.bullets = this.readBullets();
        state.residual = this.residual(raw, shown, ship, state.objects, state.bullets);
      }
      return state;
    }

    parseHud(lines, mem) {
      const hud = {};
      const asc = (a, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(mem[a + i]); return s; };
      for (const t of lines) {
        const mm = t.str.match(/^([A-Z]+)\s*(\d+)$/);
        if (mm) hud[mm[1]] = mm[2];
        else if (/^\d+$/.test(t.str)) {
          // valeur imprimée seule : on la rattache au libellé de la même ligne
          const lab = lines.find((o) => o.y === t.y && /^[A-Z]+$/.test(o.str));
          if (lab) hud[lab.str] = t.str;
        }
      }
      if (!hud.SCORE) hud.SCORE = asc(0x14FF, 7);
      if (!hud.ENERGIE) hud.ENERGIE = asc(0x1508, 6);
      return hud;
    }

    // Pixels de la zone de jeu qui ne s'expliquent ni par les tuiles, ni par le vaisseau, ni par du texte
    residual(raw, shown, ship, objects = [], bullets = []) {
      const mem = this.m.mem;
      const exp = new Uint8Array(50 * 200);
      for (let i = 0; i < 100; i++) {
        let code = shown[i] >= 0 ? shown[i] : raw[i];
        if (code >= 0x80) code = 0x08;
        code &= 0x7F;
        const tx = i % 10, ty = Math.floor(i / 10);
        for (let k = 0; k < 20; k++) for (let b = 0; b < 5; b++) exp[(ty * 20 + k) * 50 + tx * 5 + b] = mem[TILES + code * 100 + k * 5 + b];
      }
      const skip = new Uint8Array(50 * 200);
      if (ship && !ship.hidden) {
        const sx = ship.x / 2;
        for (let k = 0; k < 20; k++) for (let b = 0; b < 5; b++) {
          const y = ship.y + k, x = sx + b;
          if (y < 200 && x < 50) skip[y * 50 + x] = 1;
        }
      }
      for (const o of objects) {
        if (o.kind === 'other') continue;
        const sx = o.x / 2;
        for (let k = 0; k < 20; k++) for (let b = 0; b < 5; b++) { const y = o.y + k, x = sx + b; if (y < 200 && x < 50) skip[y * 50 + x] = 1; }
      }
      for (const bl of bullets) for (let k = 0; k < 4; k++) if (bl.y + k < 200) skip[(bl.y + k) * 50 + bl.x / 2] = 1;
      for (const [pos, t] of this.text) {
        const p = addrXY(pos);
        if (!p || p.x >= 50) continue;
        for (let k = 0; k < 7; k++) for (let b = 0; b < 2; b++) if (p.y + k < 200) skip[(p.y + k) * 50 + p.x + b] = 1;
      }
      const out = [];
      for (let y = 0; y < 200; y++) {
        const la = lineAddr(y);
        for (let xb = 0; xb < 50; xb++) {
          const i = y * 50 + xb;
          if (skip[i]) continue;
          const v = mem[la + xb], e = exp[i];
          if (v === e) continue;
          if (PIX0[v] !== PIX0[e]) out.push(xb * 2, y, PIX0[v]);
          if (PIX1[v] !== PIX1[e]) out.push(xb * 2 + 1, y, PIX1[v]);
        }
      }
      return out;
    }
  }

  GameView.lineAddr = lineAddr;
  GameView.PIX0 = PIX0; GameView.PIX1 = PIX1;
  root.GameView = GameView;
  if (typeof module !== 'undefined') module.exports = GameView;
})(typeof window !== 'undefined' ? window : globalThis);
