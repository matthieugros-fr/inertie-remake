// Repère les routines du jeu qui écrivent dans la mémoire écran (zone de jeu), par planète.
'use strict';
const fs = require('fs'), path = require('path');
const CPC = require('../emu/cpc.js'); const { loadOriginal } = require('../emu/original.js');
const root = path.join(__dirname, '..');
const CODES = { 1: 'J12C58', 2: 'A35F13', 3: 'J74V99', 4: 'KIM742', 5: 'SUNC79', 6: 'G8I365', 7: 'RS232C', 8: 'UBI57H', 9: 'O97P94', 10: 'T78S26' };
function bootPlanet(n, extra = 0, onCreate = null) {
  const m = new CPC({ log: () => {} });
  loadOriginal(m, (p) => fs.readFileSync(path.join(root, p)));
  if (onCreate) onCreate(m);
  const seq = [[5, ' '], [30, '1']];
  [...CODES[n]].forEach((c, i) => seq.push([80 + i * 10, c]));
  seq.push([300, ' ']);
  for (let f = 0; f < 700 + extra; f++) { for (const [cf, c] of seq) if (cf === f) m.charQueue.push(c.charCodeAt(0)); m.runFrame(); }
  return m;
}
module.exports = { bootPlanet, CODES };
if (require.main === module) {
  const n = +(process.argv[2] || 1);
  const m = bootPlanet(n);
  const writers = new Map();
  const mem = m.mem;
  const cpu = m.cpu;
  const orig = cpu.bus.write;
  cpu.bus.write = (a, v) => {
    if (a >= 0xC000) {
      const off = a - 0xC000, x = (off & 0x7FF) % 80;
      if (x < 50 && mem[a] !== v) { const k = cpu.pc; writers.set(k, (writers.get(k) || 0) + 1); }
    }
    orig(a, v);
  };
  const keys = (f) => (f < 20 ? [72] : f >= 40 && f < 44 ? [76] : f >= 80 && f < 84 ? [76] : []);
  for (let f = 0; f < 400; f++) { m.keys = new Set(keys(f)); m.runFrame(); }
  console.log('planète', n, [...writers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([pc, k]) => pc.toString(16) + ':' + k).join(' '));
}
