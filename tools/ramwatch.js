// Observe la RAM pendant un scénario pour repérer les variables du jeu.
// node tools/ramwatch.js  -> affiche les adresses qui changent pendant la phase de poussée
'use strict';
const fs = require('fs'), path = require('path');
const CPC = require('../emu/cpc.js'); const { loadOriginal } = require('../emu/original.js');
const root = path.join(__dirname, '..');
function boot() {
  const m = new CPC({ log: () => {} });
  loadOriginal(m, (p) => fs.readFileSync(path.join(root, p)));
  const chars = [[5, ' '], [30, '1'], [80, 'J'], [90, '1'], [100, '2'], [110, 'C'], [120, '5'], [130, '8']];
  for (let f = 0; f < 600; f++) { for (const [cf, c] of chars) if (cf === f) m.charQueue.push(c.charCodeAt(0)); m.runFrame(); }
  return m;
}
module.exports = { boot };
if (require.main === module) {
  const m = boot();
  const snaps = [];
  const keysAt = (f) => (f >= 10 && f < 22) ? [72] : (f >= 30 && f < 36) ? [74] : [];
  for (let f = 0; f < 60; f++) {
    m.keys = new Set(keysAt(f));
    m.runFrame();
    snaps.push(m.mem.slice(0, 0xC000));
  }
  const changes = [];
  for (let a = 0x0400; a < 0xC000; a++) {
    if (a >= 0x5038 && a < 0x7A68) continue; // carte
    const vals = snaps.map((s) => s[a]);
    const distinct = new Set(vals).size;
    if (distinct > 1) changes.push([a, distinct, vals]);
  }
  for (const [a, d, v] of changes.filter((c) => c[1] >= 3).slice(0, 120))
    console.log('&' + a.toString(16).toUpperCase(), d, v.map((x) => x.toString(16).padStart(2, '0')).join(' '));
}
