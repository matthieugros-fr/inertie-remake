// Prépare la machine simulée avec les fichiers du jeu original (extraits des .dsk de l'utilisateur).
// Ces fichiers restent dans ref/ : ils ne sont pas distribués avec le remake.
(function (root) {
  'use strict';

  const DISK1 = ['EJR.BIN', 'FACE.BIN', 'GAME.BIN', 'HIBIN.BIN', 'INERTIE.SCN', 'INV.BIN', 'LOD01.BIN', 'MBOR.BIN',
    'SCORE.BAK', 'SCORE.BIN', 'SHL.BIN', 'TAB.SCN', 'WTE.BIN', 'ZBB.BIN'];
  const DISK2 = ['CPA.BIN', 'DUU.BIN', 'FACE.BIN', 'FAX.BIN', 'KED.BIN', 'TAB.SCN', 'YGQ.BIN'];

  function parseHdr(text) {
    const o = {};
    for (const kv of text.trim().split(/\s+/)) { const [k, v] = kv.split('='); o[k] = parseInt(v, 16); }
    return o;
  }

  // readFile(cheminRelatif) -> Uint8Array/Buffer
  function loadOriginal(m, readFile) {
    const disks = [{}, {}];
    const fill = (disk, dir, names) => {
      for (const n of names) {
        const data = new Uint8Array(readFile(`ref/${dir}/${n}.bin`));
        const h = parseHdr(String.fromCharCode(...readFile(`ref/${dir}/${n}.hdr`)));
        disk[n] = { data, load: h.load, exec: h.exec, type: h.type };
      }
    };
    fill(disks[0], 'files1', DISK1);
    fill(disks[1], 'files2', DISK2);
    m.disks = disks;
    m.disk = 0;

    // Ce que fait le chargeur : GAME.BIN déchiffré en &0400, HIBIN en &A034, FACE en &A79F, scores en &4015
    // LOD01 déchiffre &0400-&4FFF ((octet XOR &AD) + &12), y compris la RAM vide après le fichier
    const raw = new Uint8Array(0x4C00);
    raw.set(disks[0]['GAME.BIN'].data);
    m.load(0x0400, raw.map((b) => (((b ^ 0xAD) + 0x12) & 0xFF)));
    // puis recopie 50 octets de son propre code en &0FBB (routine d'affichage des tuiles)
    // et en &B110 (le jeu y vérifie la présence de &30, sinon il boucle : protection)
    const lod = disks[0]['LOD01.BIN'].data;
    const patch = lod.slice(0x1CB, 0x1CB + 0x32);
    m.load(0x0FBB, patch);
    m.load(0xB110, patch);
    m.load(0xA034, disks[0]['HIBIN.BIN'].data);
    m.load(0xA79F, disks[0]['FACE.BIN'].data);
    m.load(0x4015, disks[0]['SCORE.BIN'].data);
    m.mode = 0;
    const pal = [0, 1, 2, 4, 0, 11, 6, 15, 3, 24, 26, 9, 18, 20, 17, 13];
    pal.forEach((c, i) => { m.ink[i] = c; m.ink2[i] = c; });
    m.ink[16] = m.ink2[16] = 0;
    // Pendant le chargement, le BASIC affiche la page de titre ; la première planète est en mémoire
    m.load(0x5038, disks[0]['EJR.BIN'].data);
    m.load(0xC000, disks[0]['INERTIE.SCN'].data);
    m.cpu.sp = 0xBFF0;
    m.cpu.pc = 0x4012;   // point d'entrée choisi par LOD01 (JP (HL) avec HL = &4012)
    m.cpu.iff1 = m.cpu.iff2 = 1;
    m.cpu.im = 1;
    return m;
  }

  root.loadOriginal = loadOriginal;
  if (typeof module !== 'undefined') module.exports = { loadOriginal };
})(typeof window !== 'undefined' ? window : globalThis);
