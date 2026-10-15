// Fait tourner le jeu original dans la machine simulée, sans navigateur.
// Usage : node tools/run.js <script.json>   ou   node tools/run.js frames=300 shot=100,200,300
// Script : { "frames": 600, "keys": [[frame, "press"|"release", keyNumber]], "chars": [[frame, "texte"]],
//            "shots": [frame...], "out": "ref/shots" }
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const CPC = require('../emu/cpc.js');
const { loadOriginal } = require('../emu/original.js');

function png(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) >>> 0 : crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
let CRC_T;
function crc32(buf) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (const b of buf) c = CRC_T[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}

function main() {
  let script = { frames: 300, keys: [], chars: [], shots: [], out: 'ref/shots' };
  for (const a of process.argv.slice(2)) {
    if (a.endsWith('.json')) Object.assign(script, JSON.parse(fs.readFileSync(a, 'utf8')));
    else {
      const [k, v] = a.split('=');
      if (k === 'frames') script.frames = +v;
      if (k === 'shot') script.shots = v.split(',').map(Number);
      if (k === 'out') script.out = v;
    }
  }
  const root = path.join(__dirname, '..');
  const m = new CPC({ log: (s) => console.log('[' + m.frame + '] ' + s) });
  loadOriginal(m, (p) => fs.readFileSync(path.join(root, p)));
  fs.mkdirSync(path.join(root, script.out), { recursive: true });
  const rgba = new Uint8Array(640 * 200 * 4);
  for (let f = 0; f <= script.frames; f++) {
    for (const [kf, act, key] of script.keys) if (kf === f) { if (act === 'press') m.keys.add(key); else m.keys.delete(key); }
    for (const [cf, txt] of script.chars) if (cf === f) for (const ch of txt) m.charQueue.push(ch === '\n' ? 13 : ch.charCodeAt(0));
    m.runFrame();
    if (script.shots.includes(f)) {
      m.render(rgba);
      const fn = path.join(root, script.out, 'f' + String(f).padStart(5, '0') + '.png');
      png(fn, 640, 200, rgba);
      console.log('capture', fn, 'pc=' + m.cpu.pc.toString(16), m.blocked ? 'bloqué sur &' + m.blocked.toString(16) : '');
    }
  }
  console.log('touches testées :', [...m.keyTests.entries()].map(([k, n]) => k + 'x' + n).join(' '));
  console.log('appels inconnus :', [...m.unknownCalls.entries()].map(([k, n]) => k.toString(16) + 'x' + n).join(' '));
}

main();
