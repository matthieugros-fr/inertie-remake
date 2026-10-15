// Machine CPC « haut niveau » : 64 Ko de RAM, Gate Array (palette, mode), écran à &C000,
// et routines du firmware simulées en JavaScript (pas de ROM Amstrad).
// Sert à faire tourner le code original d'Inertie comme référence.
(function (root) {
  'use strict';
  const Z80 = root.Z80 || (typeof require !== 'undefined' ? require('./z80.js') : null);

  // Couleurs matérielles : numéro firmware -> RVB, et numéro matériel -> firmware
  const LV_RB = [0x00, 0x63, 0xFF], LV_G = [0x00, 0x65, 0xFF];
  const FW_RGB = [];
  for (let n = 0; n < 27; n++) {
    const g = Math.floor(n / 9), r = Math.floor(n / 3) % 3, b = n % 3;
    FW_RGB.push([LV_RB[r], LV_G[g], LV_RB[b]]);
  }
  const FW2HW = [0x54, 0x44, 0x55, 0x5C, 0x58, 0x5D, 0x4C, 0x45, 0x4D, 0x56, 0x46, 0x57, 0x5E, 0x40, 0x5F,
    0x4E, 0x47, 0x4F, 0x52, 0x42, 0x53, 0x5A, 0x59, 0x5B, 0x4A, 0x43, 0x4B];
  const HW2FW = new Array(32).fill(0);
  FW2HW.forEach((h, f) => { HW2FW[h & 0x1F] = f; });

  // Durée d'une trame : 19968 µs à 4 MHz
  const FRAME_T = 79872;

  class CPC {
    constructor(opts = {}) {
      this.mem = new Uint8Array(0x10000);
      this.cpu = new Z80({
        read: (a) => this.mem[a],
        write: (a, v) => {
          this.mem[a] = v;
          if (a >= 0xB900 && a < 0xBE00) this.patched.add(a - ((a - 0xB900) % 3));
        },
        input: (port) => this.portIn(port),
        output: (port, v) => this.portOut(port, v),
      });
      this.ink = new Array(17).fill(0);    // couleur firmware par stylo (16 = bord)
      this.ink2 = new Array(17).fill(0);   // seconde couleur (clignotement)
      this.mode = 1;
      this.frame = 0;
      this.keys = new Set();               // numéros de touches CPC enfoncées
      this.charQueue = [];                 // caractères tapés (KM READ CHAR)
      this.disks = opts.disks || [{}];     // [{ 'NOM.EXT': {data, load, exec, type} }]
      this.disk = 0;
      this.saved = opts.saved || {};       // fichiers écrits par le jeu (scores)
      this.onSave = opts.onSave || null;
      this.sound = opts.sound || null;     // reçoit les commandes SOUND QUEUE
      this.log = opts.log || (() => {});
      this.trace = opts.trace || null;
      this.unknownCalls = new Map();
      this.keyTests = new Map();           // statistique des touches interrogées
      this.inFile = null;
      this.outFile = null;
      this.blocked = null;                 // appel firmware en attente (touche)
      this.frameT = 0;
      this.ppiC = 0;
      this.psgReg = 0;
      this.psg = new Uint8Array(16);
      this.vsync = false;
      this.hooks = new Map();              // adresse -> fonction appelée avant l'instruction (observation)
      this.patched = new Set();            // entrées du bloc de sauts réécrites par le jeu
      this.tickers = [];                   // événements KL (fast ticker 300 Hz, frame fly 50 Hz)
      this.inEvent = null;
      this.fw = this.buildFirmware();
      this.mem.fill(0xC9, 0xB900, 0xBE00);
    }

    // ---------- ports ----------
    portIn(port) {
      const hi = port >> 8;
      if (hi === 0xF5) {
        // PPI port B : bit 0 = VSYNC (vrai pendant le début de trame)
        const inVsync = this.frameT < 1024;
        return 0x1E | (inVsync ? 1 : 0);
      }
      if (hi === 0xF4) return 0xFF;
      return 0xFF;
    }

    portOut(port, v) {
      const hi = port >> 8;
      if ((hi & 0xC0) === 0x40) { // Gate Array &7Fxx
        const fn = v >> 6;
        if (fn === 0) this.gaPen = v & 0x10 ? 16 : v & 0x0F;
        else if (fn === 1) { const f = HW2FW[v & 0x1F]; this.ink[this.gaPen] = f; this.ink2[this.gaPen] = f; }
        else if (fn === 2) this.mode = v & 3;
      }
    }

    // ---------- chargement ----------
    load(addr, bytes) { this.mem.set(bytes, addr); }

    findFile(name) {
      const up = name.toUpperCase().trim();
      const cands = up.includes('.') ? [up] : [up + '.', up, up + '.BAS', up + '.BIN'];
      const base = up.replace(/\..*$/, '');
      const order = base === 'FACE' ? [this.disk] : [this.disk, ...this.disks.keys()].filter((v, i, a) => a.indexOf(v) === i);
      for (const d of order) {
        const disk = this.disks[d];
        for (const c of cands) {
          const k = c.endsWith('.') ? c.slice(0, -1) : c;
          if (this.saved[k]) return { file: this.saved[k], disk: d };
          if (disk[k]) return { file: disk[k], disk: d };
        }
      }
      return null;
    }

    // ---------- firmware simulé ----------
    buildFirmware() {
      const c = this.cpu;
      const FC = 1, FZ = 0x40;
      const setC = (on) => { c.f = on ? (c.f | FC) : (c.f & ~FC); };
      const setZ = (on) => { c.f = on ? (c.f | FZ) : (c.f & ~FZ); };
      const readName = () => {
        let s = '';
        for (let i = 0; i < c.b; i++) s += String.fromCharCode(this.mem[(c.hl + i) & 0xFFFF] & 0x7F);
        return s;
      };
      const nextChar = () => this.charQueue.length ? this.charQueue.shift() : null;
      return {
        0xBB00: () => { this.charQueue.length = 0; },                       // KM INITIALISE
        0xBB03: () => { this.charQueue.length = 0; },                       // KM RESET
        0xBB06: () => { const ch = nextChar(); if (ch === null) return 'block'; c.a = ch; setC(true); }, // KM WAIT CHAR
        0xBB09: () => { const ch = nextChar(); if (ch === null) { setC(false); } else { c.a = ch; setC(true); } }, // KM READ CHAR
        0xBB18: () => {                                                      // KM WAIT KEY
          // juste après la lecture de FACE, le jeu attend qu'on retourne la disquette : on la retourne
          if (this.lastOpen === 'FACE' && this.disks.length > 1) {
            this.disk = 1 - this.disk;
            this.lastOpen = null;
            this.log('disquette retournée : face ' + (this.disk + 1));
          }
          const ch = nextChar(); if (ch === null) return 'block'; c.a = ch; setC(true);
        },
        0xBB1B: () => { const ch = nextChar(); if (ch === null) { setC(false); } else { c.a = ch; setC(true); } }, // KM READ KEY
        0xBB1E: () => {                                                      // KM TEST KEY
          const k = c.a;
          this.keyTests.set(k, (this.keyTests.get(k) || 0) + 1);
          const down = this.keys.has(k);
          setZ(!down); setC(false); c.c = 0;
          c.a = down ? 0xFF : 0;
        },
        0xBB5A: () => {},                                                    // TXT OUTPUT
        0xBB90: () => {},                                                    // TXT SET PEN
        0xBB96: () => {},                                                    // TXT SET PAPER
        0xBC0E: () => { this.mode = c.a & 3; this.mem.fill(0, 0xC000, 0x10000); }, // SCR SET MODE
        0xBC32: () => { this.ink[c.a & 15] = c.b % 27; this.ink2[c.a & 15] = c.c % 27; }, // SCR SET INK
        0xBC38: () => { this.ink[16] = c.b % 27; this.ink2[16] = c.c % 27; },      // SCR SET BORDER
        0xBC65: () => {},                                                    // CAS INITIALISE
        0xBC77: () => {                                                      // CAS IN OPEN
          const name = readName();
          const found = this.findFile(name);
          this.log('CAS IN OPEN ' + JSON.stringify(name) + (found ? ' (disque ' + (found.disk + 1) + ')' : ' : introuvable'));
          if (!found) { this.inFile = null; setC(false); setZ(false); c.a = 0x92; return; }
          this.inFile = found.file;
          this.lastOpen = name.toUpperCase().trim().replace(/\..*$/, '');
          // AMSDOS garde l'en-tête dans sa propre mémoire : le tampon fourni en DE n'est pas touché
          // pour une lecture directe (le jeu donne &3294, en plein dans son code de sortie du cosmonaute).
          const hdr = 0xBE00;
          for (let i = 0; i < 64; i++) this.mem[hdr + i] = 0;
          this.mem[hdr + 18] = found.file.type;
          this.mem[hdr + 21] = found.file.load & 0xFF; this.mem[hdr + 22] = found.file.load >> 8;
          this.mem[hdr + 24] = found.file.data.length & 0xFF; this.mem[hdr + 25] = found.file.data.length >> 8;
          c.hl = hdr;
          c.de = found.file.load;
          c.bc = found.file.data.length;
          c.a = found.file.type;
          setC(true); setZ(false);
        },
        0xBC7A: () => { this.inFile = null; setC(true); },                    // CAS IN CLOSE
        0xBC7D: () => { this.inFile = null; setC(true); },                    // CAS IN ABANDON
        0xBC83: () => {                                                      // CAS IN DIRECT
          if (!this.inFile) { setC(false); return; }
          this.load(c.hl, this.inFile.data);
          c.hl = this.inFile.exec || 0;
          setC(true); setZ(false);
        },
        0xBC8C: () => {                                                      // CAS OUT OPEN
          this.outFile = { name: readName().toUpperCase().trim() };
          c.hl = c.de;
          setC(true); setZ(false);
        },
        0xBC8F: () => { setC(true); },                                       // CAS OUT CLOSE
        0xBC92: () => { this.outFile = null; setC(true); },                   // CAS OUT ABANDON
        0xBC98: () => {                                                      // CAS OUT DIRECT : HL adresse, DE longueur, BC exec, A type
          if (!this.outFile) { setC(false); return; }
          const data = this.mem.slice(c.hl, c.hl + c.de);
          const f = { data, load: c.hl, exec: c.bc, type: c.a };
          this.saved[this.outFile.name] = f;
          if (this.onSave) this.onSave(this.outFile.name, f);
          setC(true); setZ(false);
        },
        0xBCA7: () => { if (this.sound) this.sound.reset(); },              // SOUND RESET
        0xBCAA: () => {                                                      // SOUND QUEUE (HL = bloc de 9 octets)
          const blk = this.mem.slice(c.hl, c.hl + 9);
          const ok = this.sound ? this.sound.queue(blk) : true;
          setC(ok);
        },
        0xBCAD: () => {                                                      // SOUND CHECK (A = canal)
          c.a = this.sound ? this.sound.check(c.a) : 0x04;
        },
        0xBCB0: () => {},                                                    // SOUND ARM EVENT
        0xBCB3: () => { if (this.sound) this.sound.release(c.a); },         // SOUND RELEASE
        0xBCB6: () => {},                                                    // SOUND HOLD
        0xBCB9: () => {},                                                    // SOUND CONTINUE
        0xBCBC: () => { if (this.sound) this.sound.amplEnv(c.a, this.mem.slice(c.hl, c.hl + 16)); setC(true); },
        0xBCBF: () => { if (this.sound) this.sound.toneEnv(c.a, this.mem.slice(c.hl, c.hl + 16)); setC(true); },
        0xBD19: () => 'flyback',                                             // MC WAIT FLYBACK
        0xBCD7: () => { this.addTicker(c.hl, c.de, 'frame'); },               // KL NEW FRAME FLY
        0xBCDA: () => { this.addTicker(c.hl, null, 'frame'); },               // KL ADD FRAME FLY
        0xBCDD: () => { this.delTicker(c.hl); },                              // KL DEL FRAME FLY
        0xBCE0: () => { this.addTicker(c.hl, c.de, 'fast'); },                // KL NEW FAST TICKER
        0xBCE3: () => { this.addTicker(c.hl, null, 'fast'); },                // KL ADD FAST TICKER
        0xBCE6: () => { this.delTicker(c.hl); },                              // KL DEL FAST TICKER
        0xBCC8: () => {},                                                    // KL CHOKE OFF
        0xBD1C: () => { this.mode = c.a & 3; },                               // MC SET MODE
      };
    }

    addTicker(block, routine, kind) {
      // bloc d'événement : la routine est à block+5 (fast ticker : block+2 = chaîne, +5 adresse) — on garde l'adresse fournie
      if (routine === null) {
        const known = this.tickers.find((t) => t.block === block);
        if (known) return;
        routine = this.mem[block + 5] | (this.mem[block + 6] << 8);
      }
      this.delTicker(block);
      this.tickers.push({ block, routine, kind });
      this.log('événement ' + kind + ' &' + routine.toString(16).toUpperCase());
    }

    delTicker(block) { this.tickers = this.tickers.filter((t) => t.block !== block); }

    // Appelle une routine Z80 comme le ferait le firmware sous interruption
    fireEvent(t) {
      const c = this.cpu;
      this.inEvent = {
        a: c.a, f: c.f, b: c.b, c: c.c, d: c.d, e: c.e, h: c.h, l: c.l, ix: c.ix, iy: c.iy,
        pc: c.pc, sp: c.sp, iff1: c.iff1, halted: c.halted,
      };
      c.halted = false;
      c.iff1 = c.iff2 = 0;
      c.push(0xB8F0);
      c.pc = t.routine;
    }

    endEvent() {
      const c = this.cpu, s = this.inEvent;
      Object.assign(c, { a: s.a, f: s.f, b: s.b, c: s.c, d: s.d, e: s.e, h: s.h, l: s.l, ix: s.ix, iy: s.iy, pc: s.pc, sp: s.sp, halted: s.halted });
      c.iff1 = c.iff2 = s.iff1;
      this.inEvent = null;
    }

    // Exécute le code jusqu'à la fin de la trame. Retourne le nombre de T-states consommés.
    runFrame() {
      const cpu = this.cpu;
      this.frameT = 0;
      this.waitFly = false;          // la trame commence par le retour de balayage
      const TICK = FRAME_T / 6;      // fast ticker : 300 Hz
      let nextTick = 0, tickNo = 0;
      while (this.frameT < FRAME_T) {
        // événements du firmware (sous interruption)
        if (!this.inEvent && this.frameT >= nextTick) {
          const due = this.tickers.filter((t) => t.kind === 'fast' || (tickNo === 0 && t.kind === 'frame'));
          nextTick += TICK; tickNo++;
          // routine d'interruption du firmware : consomme du temps et fait avancer le registre R
          // (le jeu s'en sert comme source de hasard)
          if (cpu.iff1 || this.waitFly || this.blocked) {
            cpu.r = (cpu.r & 0x80) | ((cpu.r + 61 + ((this.frame + tickNo) % 5) * 7) & 0x7F);
            this.frameT += 160;
          }
          if (due.length && (cpu.iff1 || this.waitFly || this.blocked)) {
            this.pendingEvents = due.slice(1);
            this.fireEvent(due[0]);
          }
        }
        const pc = cpu.pc;
        if (pc === 0xB8F0 && this.inEvent) {
          this.endEvent();
          if (this.pendingEvents && this.pendingEvents.length) this.fireEvent(this.pendingEvents.shift());
          continue;
        }
        // programme principal en attente (retour de balayage ou touche)
        if (!this.inEvent && (this.waitFly || this.blocked)) {
          if (this.blocked) {
            const r = this.fw[this.blocked]();
            if (r !== 'block') { this.blocked = null; cpu.pc = cpu.pop(); continue; }
          }
          this.frameT = Math.min(FRAME_T, Math.max(this.frameT + 4, nextTick));
          continue;
        }
        if (pc >= 0xB900 && pc < 0xBE00 && !this.patched.has(pc)) {
          const h = this.fw[pc];
          if (h) {
            const r = h();
            if (r === 'block') { this.blocked = pc; continue; }
            cpu.pc = cpu.pop();
            this.frameT += 40;
            if (r === 'flyback') this.waitFly = true;
            continue;
          }
          if (!this.unknownCalls.has(pc)) this.log('appel firmware non simulé &' + pc.toString(16).toUpperCase());
          this.unknownCalls.set(pc, (this.unknownCalls.get(pc) || 0) + 1);
          cpu.pc = cpu.pop();
          continue;
        }
        if (this.trace) this.trace(cpu);
        if (this.hooks.size) { const hk = this.hooks.get(pc); if (hk) hk(cpu, this); }
        const t = cpu.step();
        this.frameT += (t + 3) & ~3;
      }
      this.endFrame();
    }

    endFrame() {
      this.frame++;
      if (this.sound && this.sound.frame) this.sound.frame();
    }

    // Couleur RVB du stylo p (avec clignotement firmware : 10 trames chacune)
    penRGB(p) {
      const alt = Math.floor(this.frame / 10) % 2 === 1;
      return FW_RGB[alt ? this.ink2[p] : this.ink[p]];
    }

    // Rendu de l'écran (mode 0/1/2) dans un tableau RGBA 640x200 (pixels doublés au besoin)
    render(rgba) {
      const pal = [];
      for (let p = 0; p < 16; p++) pal.push(this.penRGB(p));
      const m = this.mem;
      let o = 0;
      for (let y = 0; y < 200; y++) {
        const base = 0xC000 + (y & 7) * 0x800 + (y >> 3) * 80;
        for (let xb = 0; xb < 80; xb++) {
          const b = m[base + xb];
          if (this.mode === 0) {
            const p0 = ((b >> 7) & 1) | ((b >> 2) & 2) | ((b >> 3) & 4) | ((b << 2) & 8);
            const p1 = ((b >> 6) & 1) | ((b >> 1) & 2) | ((b >> 2) & 4) | ((b << 3) & 8);
            for (const p of [p0, p0, p0, p0, p1, p1, p1, p1]) {
              const c = pal[p]; rgba[o++] = c[0]; rgba[o++] = c[1]; rgba[o++] = c[2]; rgba[o++] = 255;
            }
          } else if (this.mode === 1) {
            for (let k = 0; k < 4; k++) {
              const p = ((b >> (7 - k)) & 1) | (((b >> (3 - k)) & 1) << 1);
              const c = pal[p];
              for (let r = 0; r < 2; r++) { rgba[o++] = c[0]; rgba[o++] = c[1]; rgba[o++] = c[2]; rgba[o++] = 255; }
            }
          } else {
            for (let k = 0; k < 8; k++) {
              const c = pal[(b >> (7 - k)) & 1];
              rgba[o++] = c[0]; rgba[o++] = c[1]; rgba[o++] = c[2]; rgba[o++] = 255;
            }
          }
        }
      }
    }
  }

  CPC.FW_RGB = FW_RGB;
  CPC.FRAME_T = FRAME_T;
  root.CPC = CPC;
  if (typeof module !== 'undefined') module.exports = CPC;
})(typeof window !== 'undefined' ? window : globalThis);
