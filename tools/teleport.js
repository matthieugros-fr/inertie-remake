// Outils de test : appeler une routine du jeu, et téléporter le vaisseau sur un autre écran
// (en utilisant les routines du jeu lui-même pour dessiner l'écran d'arrivée).
'use strict';

const RET = 0xB8F8; // adresse de retour factice

// Exécute une routine Z80 jusqu'à son retour (registres optionnels)
function callRoutine(m, addr, regs = {}, maxSteps = 5_000_000) {
  const c = m.cpu;
  const save = { pc: c.pc, sp: c.sp, a: c.a, f: c.f, b: c.b, c: c.c, d: c.d, e: c.e, h: c.h, l: c.l, ix: c.ix, iy: c.iy };
  Object.assign(c, regs);
  c.push(RET);
  c.pc = addr;
  let n = 0;
  while (c.pc !== RET && n++ < maxSteps) {
    const pc = c.pc;
    if (pc >= 0xB900 && pc < 0xBE00 && !m.patched.has(pc)) {
      const h = m.fw[pc];
      const r = h ? h() : null;
      if (r === 'block') break;
      c.pc = c.pop();
      continue;
    }
    if (m.hooks.size) { const hk = m.hooks.get(pc); if (hk) hk(c, m); }
    c.step();
  }
  Object.assign(c, save);
  return n;
}

const lineAddr = (L) => 0xC000 + (L & 7) * 0x800 + (L >> 3) * 80;

// Place le vaisseau sur l'écran s, en (col octets, ligne) ; à appeler pendant une partie
function teleport(m, s, col = 22, line = 80) {
  const mem = m.mem;
  const ptr = 0x5038 + s * 100;
  mem[0x042C] = ptr & 0xFF; mem[0x042D] = ptr >> 8;
  mem[0x21ED] = (s % 12) + 1; mem[0x21EE] = Math.floor(s / 12) + 1;
  callRoutine(m, 0x0FE1, { h: ptr >> 8, l: ptr & 0xFF });      // dessine les 10 x 10 tuiles
  const a = lineAddr(line) + col;
  mem[0x040B] = a & 0xFF; mem[0x040C] = a >> 8;
  mem[0x041C] = col; mem[0x041D] = 199 - line;
  callRoutine(m, 0x1980);                                       // initialisation de l'écran d'arrivée
}

module.exports = { callRoutine, teleport, lineAddr };
