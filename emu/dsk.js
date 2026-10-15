// Lecture d'images disque Amstrad CPC (.dsk standard et étendu) et extraction des fichiers AMSDOS.
// Portage de tools/dsk.py : sert à charger les disquettes que l'utilisateur dépose dans la page.
(function (root) {
  'use strict';

  const ascii = (b, a, n) => String.fromCharCode(...b.subarray(a, a + n));
  const u16 = (b, a) => b[a] | (b[a + 1] << 8);

  function parseDsk(data) {
    const sig = ascii(data, 0, 34);
    const extended = sig.startsWith('EXTENDED');
    if (!extended && !sig.startsWith('MV - CPC')) throw new Error('ce fichier n\'est pas une image disque .dsk');
    const ntracks = data[0x30], nsides = data[0x31];
    const tracks = new Map();
    let off = 0x100;
    for (let t = 0; t < ntracks * nsides; t++) {
      const size = extended ? data[0x34 + t] * 256 : u16(data, 0x32);
      if (!size) continue;
      const blk = data.subarray(off, off + size);
      off += size;
      if (ascii(blk, 0, 10) !== 'Track-Info') continue;
      const track = blk[0x10], side = blk[0x11], sizeCode = blk[0x14], nsec = blk[0x15];
      const secs = [];
      let p = 0x100;
      for (let s = 0; s < nsec; s++) {
        const e = 0x18 + s * 8;
        const len = extended ? u16(blk, e + 6) : 128 << sizeCode;
        secs.push({ R: blk[e + 2], data: blk.subarray(p, p + len) });
        p += len;
      }
      tracks.set(track + ':' + side, secs);
    }
    return tracks;
  }

  function sector(tracks, track, id) {
    for (const s of tracks.get(track + ':0') || []) if (s.R === id) return s.data;
    return null;
  }

  // Fichiers AMSDOS : { 'GAME.BIN': { data, load, exec, type } }
  function amsdosFiles(data) {
    const tracks = parseDsk(data);
    const ids = (tracks.get('0:0') || []).map((s) => s.R).sort((a, b) => a - b);
    const [base, offTrack] = ids.length && ids[0] >= 0xC1 ? [0xC1, 0] : [0x41, 2];
    const block = (b) => {
      const out = new Uint8Array(1024);
      for (let k = 0; k < 2; k++) {
        const ls = b * 2 + k;
        const d = sector(tracks, offTrack + Math.floor(ls / 9), base + (ls % 9));
        if (d) out.set(d.subarray(0, 512), k * 512);
      }
      return out;
    };
    const dir = new Uint8Array(2048);
    dir.set(block(0), 0); dir.set(block(1), 1024);
    const entries = new Map();
    for (let i = 0; i < 64; i++) {
      const e = dir.subarray(i * 32, i * 32 + 32);
      if (e[0] === 0xE5) continue;
      const name = String.fromCharCode(...[...e.subarray(1, 9)].map((c) => c & 0x7F)).trim();
      const ext = String.fromCharCode(...[...e.subarray(9, 12)].map((c) => c & 0x7F)).trim();
      const key = e[0] + '|' + (ext ? name + '.' + ext : name);
      if (!entries.has(key)) entries.set(key, []);
      entries.get(key).push({ extent: e[12], rc: e[15], blocks: [...e.subarray(16, 32)].filter((b) => b) });
    }
    const files = {};
    for (const [key, exts] of entries) {
      exts.sort((a, b) => a.extent - b.extent);
      const chunks = [];
      for (const x of exts) for (const b of x.blocks) chunks.push(block(b));
      const all = new Uint8Array(chunks.length * 1024);
      chunks.forEach((c, i) => all.set(c, i * 1024));
      const nrec = (exts.length - 1) * 128 + exts[exts.length - 1].rc;
      const raw = all.subarray(0, nrec * 128);
      const name = key.split('|')[1];
      // en-tête AMSDOS (128 octets avec somme de contrôle)
      let sum = 0;
      for (let k = 0; k < 67; k++) sum += raw[k];
      if (raw.length >= 128 && (sum & 0xFFFF) === u16(raw, 67)) {
        const length = u16(raw, 24);
        files[name] = { data: raw.slice(128, 128 + length), load: u16(raw, 21), exec: u16(raw, 26), type: raw[18] };
      } else files[name] = { data: raw.slice(), load: 0, exec: 0, type: 0 };
    }
    return files;
  }

  const api = { parseDsk, amsdosFiles };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CPCDisk = api;
})(typeof window !== 'undefined' ? window : globalThis);
