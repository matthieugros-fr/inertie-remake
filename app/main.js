// Application : charge les fichiers du jeu, fait tourner la machine à 50 images/s, gère clavier, manette et son.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const screen = $('screen'), monitor = $('monitor'), status = $('status'), hdCanvas = $('hd'), neoCanvas = $('neo');
  const ctx = screen.getContext('2d');
  const img = ctx.createImageData(640, 200);

  const DISK1 = ['EJR.BIN', 'FACE.BIN', 'GAME.BIN', 'HIBIN.BIN', 'INERTIE.SCN', 'INV.BIN', 'LOD01.BIN', 'MBOR.BIN',
    'SCORE.BAK', 'SCORE.BIN', 'SHL.BIN', 'TAB.SCN', 'WTE.BIN', 'ZBB.BIN'];
  const DISK2 = ['CPA.BIN', 'DUU.BIN', 'FACE.BIN', 'FAX.BIN', 'KED.BIN', 'TAB.SCN', 'YGQ.BIN'];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
  };

  let files = {};
  let m = null, fwSound = null, audio = null;
  let paused = false;
  let mode = ['hd', 'neo', 'dog'].includes(store.get('inertie.mode')) ? store.get('inertie.mode') : 'original';
  let hd = null, neo = null, neoFx = null, rend = {}, aud = {}, view = null, lastDraw = performance.now();
  let neoAudio = null, userMuted = false, lastPhase = 'other';
  const held = new Set();      // e.code enfoncés

  // ---------- disquettes de l'utilisateur (version en ligne : rien du jeu d'origine n'est hébergé) ----------
  const idb = (fn) => new Promise((ok, ko) => {
    const rq = indexedDB.open('inertie', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('disques');
    rq.onerror = () => ko(rq.error);
    rq.onsuccess = () => { const tx = rq.result.transaction('disques', 'readwrite'); const st = tx.objectStore('disques'); const q = fn(st); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => ko(tx.error); };
  });
  // Range les fichiers d'une image .dsk sous les mêmes chemins que ref/files1 et ref/files2
  function addDisk(bytes) {
    const f = CPCDisk.amsdosFiles(bytes);
    const dir = f['GAME.BIN'] ? 'files1' : f['CPA.BIN'] ? 'files2' : null;
    if (!dir) throw new Error("cette disquette n'est pas une face d'Inertie");
    for (const [n, x] of Object.entries(f)) {
      files[`ref/${dir}/${n}.bin`] = x.data;
      const hex = (v) => v.toString(16).toUpperCase().padStart(4, '0');
      files[`ref/${dir}/${n}.hdr`] = new TextEncoder().encode(`load=${hex(x.load)} length=${hex(x.data.length)} exec=${hex(x.exec)} type=${x.type}\n`);
    }
    return dir;
  }
  const haveAll = () => !!files['ref/files1/GAME.BIN.bin'] && !!files['ref/files2/CPA.BIN.bin'];
  function askDisks() {
    return new Promise((done) => {
      const box = $('disques');
      box.hidden = false;
      const msg = $('disques-etat');
      const take = async (list) => {
        for (const file of list) {
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const dir = addDisk(bytes);
            try { await idb((st) => st.put(bytes, dir)); } catch (e) { /* stockage refusé : il faudra redéposer */ }
          } catch (e) { msg.textContent = file.name + ' : ' + e.message; }
        }
        const f1 = !!files['ref/files1/GAME.BIN.bin'], f2 = !!files['ref/files2/CPA.BIN.bin'];
        if (!msg.textContent.includes(':')) msg.textContent = '';
        msg.textContent += (msg.textContent ? ' — ' : '') + `Disquette 1 : ${f1 ? 'OK' : 'manquante'} · Disquette 2 : ${f2 ? 'OK' : 'manquante'}`;
        if (haveAll()) { box.hidden = true; done(); }
      };
      $('disques-choix').onchange = (e) => take(e.target.files);
      box.ondragover = (e) => { e.preventDefault(); box.classList.add('survol'); };
      box.ondragleave = () => box.classList.remove('survol');
      box.ondrop = (e) => { e.preventDefault(); box.classList.remove('survol'); take(e.dataTransfer.files); };
    });
  }
  async function loadFiles() {
    // 1. fichiers extraits sur cette machine (lancement local)
    try { await fetchAll(); return; } catch (e) { files = {}; }
    // 2. disquettes déjà déposées dans ce navigateur
    for (const dir of ['files1', 'files2']) {
      try { const b = await idb((st) => st.get(dir)); if (b) addDisk(new Uint8Array(b)); } catch (e) { /* rien */ }
    }
    if (haveAll()) return;
    // 3. on les demande
    $('loading').classList.add('hide');
    await askDisks();
    $('loading').classList.remove('hide');
  }

  async function fetchAll() {
    const list = [];
    for (const n of DISK1) list.push(`ref/files1/${n}`);
    for (const n of DISK2) list.push(`ref/files2/${n}`);
    const all = list.flatMap((p) => [p + '.bin', p + '.hdr']);
    const get = async (p) => {
      for (let essai = 0; essai < 4; essai++) {
        try {
          const r = await fetch(p);
          if (!r.ok) throw new Error(p);
          files[p] = new Uint8Array(await r.arrayBuffer());
          return;
        } catch (e) { if (essai === 3) throw new Error(p); await new Promise((ok) => setTimeout(ok, 200)); }
      }
    };
    for (let i = 0; i < all.length; i += 6) await Promise.all(all.slice(i, i + 6).map(get));
  }

  function boot() {
    fwSound = new FirmwareSound();
    // en mode Néo-Tokyo, chaque son demandé par le jeu est remplacé par un effet ElevenLabs
    const queue = fwSound.queue.bind(fwSound);
    fwSound.queue = (blk) => {
      if (isNeo() && neoAudio && m) {
        const sp = m.cpu.sp;
        neoAudio.fromGame(((m.mem[sp] | (m.mem[(sp + 1) & 0xFFFF] << 8)) - 3) & 0xFFFF);
      }
      return queue(blk);
    };
    m = new CPC({
      sound: fwSound,
      log: (s) => console.log('[CPC ' + m.frame + '] ' + s),
      onSave: (name, f) => store.set('inertie.save.' + name, JSON.stringify({ ...f, data: Array.from(f.data) })),
    });
    loadOriginal(m, (p) => files[p]);
    view = new GameView(m);
    m.hooks.set(0x3339, () => { cosmoFrame = m.frame; });
    m.hooks.set(0x0B99, () => { respawnLoopFrame = m.frame; if (waitingRespawn && fireLatch === 0 && held.size) fireLatch = 8; });
    for (const k in rend) { rend[k].cache.clear(); rend[k].reset(); }
    // scores sauvegardés lors d'une partie précédente
    const sv = store.get('inertie.save.SCORE.BIN');
    if (sv) {
      try {
        const f = JSON.parse(sv); f.data = new Uint8Array(f.data);
        m.saved['SCORE.BIN'] = f;
        m.load(0x4015, f.data);
      } catch (e) { /* sauvegarde illisible : on garde celle de la disquette */ }
    }
    if (!audio) audio = new AudioOut(fwSound);
    else audio.fw = fwSound;
    syncKeys();
  }

  // ---------- affichage ----------
  function layout() {
    const stage = $('stage');
    const W = stage.clientWidth - 24, H = stage.clientHeight - 24;
    const ar = isNeo() ? 1280 / 800 : 768 / 544;
    let w = Math.min(W, H * ar), h = w / ar;
    monitor.style.width = w + 'px';
    monitor.style.height = h + 'px';
    for (const c of [screen, hdCanvas]) {
      c.style.left = (w * 64 / 768) + 'px';
      c.style.top = (h * 72 / 544) + 'px';
      c.style.width = (w * 640 / 768) + 'px';
      c.style.height = (h * 400 / 544) + 'px';
    }
    Object.assign(neoCanvas.style, { left: '0px', top: '0px', width: w + 'px', height: h + 'px' });
  }
  window.addEventListener('resize', layout);

  let previewing = false;
  function draw() {
    if (previewing) return;
    const now = performance.now(), dt = Math.min(0.1, (now - lastDraw) / 1000);
    lastDraw = now;
    if (isNeo() && neo && neoFx && neoFx.ok) {
      const st = view.read();
      neo.palette = Array.from({ length: 16 }, (_, p) => m.penRGB(p));
      const thrust = m.keys.has(m.mem[0x21F9]) || m.keys.has(m.mem[0x21F3]);
      const scene = neo.render(st, m.mem, { thrust }, dt);
      neoFx.render(scene, neo.fx, now / 1000);
      lastPhase = st.phase;
      if (neoAudio) neoAudio.update(st, neo.events);
      neo.events.length = 0;
      monitor.style.background = '#000';
      return;
    }
    // modes Original et Amélioré : musique ElevenLabs par-dessus le son du CPC
    if (neoAudio && neoAudio.musicOnly && m.frame % 5 === 0) { const st = view.read(); lastPhase = st.phase; neoAudio.update(st, []); }
    if (mode === 'hd' && hd && hd.ok) hd.render(m);
    else { m.render(img.data); ctx.putImageData(img, 0, 0); }
    const b = m.penRGB(16);
    monitor.style.background = `rgb(${b[0]},${b[1]},${b[2]})`;
  }

  // ---------- clavier ----------
  function syncKeys() {
    if (!m) return;
    m.keys.clear();
    // Commandes fixes, sans chevauchement. Le jeu d'origine utilise la même touche (table &21F4) pour tirer
    // et pour faire rentrer le cosmonaute, et le tir joystick (&4C) pour son réacteur dorsal : on les sépare
    // selon la situation. En vol : X ou Maj tirent. À pied : Entrée fait rentrer, ↑ actionne le réacteur.
    // Espace sort le cosmonaute. Les lettres restent les touches du CPC (D, G, R, S, O, N…).
    const aPied = m.frame - cosmoFrame < 10;
    const tir = held.has('KeyX') || held.has('ShiftLeft') || held.has('ShiftRight');
    const rentrer = held.has('Enter') || held.has('NumpadEnter');
    const GAME = { ArrowLeft: 0x21F1, ArrowRight: 0x21F2, ArrowUp: 0x21F3 };
    const IGNORE = new Set(['ArrowDown', 'KeyX', 'ShiftLeft', 'ShiftRight', 'Enter', 'NumpadEnter']);
    for (const code of held) {
      if (GAME[code] !== undefined) { m.keys.add(m.mem[GAME[code]]); continue; }
      if (IGNORE.has(code)) continue;
      const k = CPCKeys.CODE_TO_CPC[code];
      if (k !== undefined) m.keys.add(k);
    }
    if (aPied ? rentrer : tir) m.keys.add(m.mem[0x21F4]);
    // vaisseau détruit : une frappe, même brève, est tenue 8 images comme tir joystick
    if (fireLatch > 0) { fireLatch--; m.keys.add(76); }
    pollPad();
  }

  let padKeys = [];
  let fireLatch = 0, waitingRespawn = false, hiddenSince = 0;
  // Détecte l'attente de relance (en partie, vaisseau ni affiché ni en train d'exploser) et l'affiche
  // Le jeu attend la relance dans sa boucle &0B78-&0BA5 (teste les touches &4F et &4C = tir joystick) :
  // on le sait en surveillant le passage du processeur en &0B99.
  let respawnLoopFrame = -100;
  let cosmoFrame = -100;      // dernière image passée dans la boucle du cosmonaute (&3339)
  function checkRespawn() {
    waitingRespawn = m.frame - respawnLoopFrame < 10;
    $('relance').hidden = !waitingRespawn;
  }
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    padKeys = [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = (i) => p.buttons[i] && p.buttons[i].pressed;
      if (ay < -0.5 || b(12)) padKeys.push(72);
      if (ay > 0.5 || b(13)) padKeys.push(73);
      if (ax < -0.5 || b(14)) padKeys.push(74);
      if (ax > 0.5 || b(15)) padKeys.push(75);
      if (b(0) || b(2)) padKeys.push(76);
      if (b(1) || b(3)) padKeys.push(77);
    }
    for (const k of padKeys) m.keys.add(k);
  }

  window.addEventListener('keydown', (e) => {
    if (e.metaKey) return;
    previewing = false;
    if (audio) audio.start();
    if (neoAudio) neoAudio.start();
    if (isNeo() && neoAudio) { if (!e.repeat) neoAudio.keyTyped(lastPhase !== 'play', e.key); }
    held.add(e.code);
    if (waitingRespawn && !e.repeat) fireLatch = 8;
    const ch = CPCKeys.charOf(e);
    if (ch !== null && !e.repeat && m) m.charQueue.push(ch);
    syncKeys();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'AltLeft', 'AltRight'].includes(e.code) ||
        e.key === "'" || e.key === '/') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { held.delete(e.code); syncKeys(); });
  window.addEventListener('blur', () => { held.clear(); syncKeys(); });

  // ---------- boucle ----------
  const FRAME_MS = 19.968;
  let acc = 0, last = performance.now(), fps = 0, fpsN = 0, fpsT = last;
  function loop(now) {
    acc += Math.min(200, now - last);
    last = now;
    let n = 0;
    while (acc >= FRAME_MS && n < 4) {
      if (!paused) {
        // le CPC se tait en Néo-Tokyo/Toutous, et sur les menus (sa musique ferait doublon)
        if (audio) audio.muted = userMuted || isNeo() || lastPhase !== 'play';
        syncKeys();
        m.runFrame();
        if (audio) audio.frame();
      }
      acc -= FRAME_MS;
      n++;
    }
    if (acc > FRAME_MS * 4) acc = 0;
    if (n) { draw(); fpsN += n; checkRespawn(); }
    if (now - fpsT > 1000) { fps = fpsN; fpsN = 0; fpsT = now; status.textContent = (paused ? 'en pause · ' : '') + fps + ' images/s'; }
    requestAnimationFrame(loop);
  }

  // ---------- barre d'outils ----------
  $('sound').onclick = (e) => {
    userMuted = !userMuted;
    if (audio) audio.start();
    if (neoAudio) neoAudio.setMuted(userMuted);
    e.target.textContent = 'Son : ' + (userMuted ? 'coupé' : 'activé');
    e.target.blur();
  };
  $('pause').onclick = (e) => { paused = !paused; e.target.textContent = paused ? 'Reprendre' : 'Pause'; e.target.blur(); };
  $('reset').onclick = (e) => { boot(); e.target.blur(); };
  function isNeo() { return mode === 'neo' || mode === 'dog'; }
  function setMode(md) {
    if (md === 'hd' && !hd) {
      try { hd = new HDRenderer(hdCanvas); } catch (e) { console.error(e); hd = null; }
      if (!hd || !hd.ok) { md = 'original'; alert("Le mode Amélioré demande WebGL2, indisponible dans ce navigateur."); }
    }
    if ((md === 'neo' || md === 'dog') && !rend[md]) {
      try {
        if (!neoFx) neoFx = new NeoFX(neoCanvas);
        rend[md] = md === 'dog' ? new DogRenderer(neoCanvas) : new NeoRenderer(neoCanvas);
        aud[md] = new NeoAudio(md);
      } catch (e) { console.error(e); delete rend[md]; }
      if (!rend[md] || !neoFx.ok) { md = 'original'; alert("Ce mode demande WebGL2, indisponible dans ce navigateur."); }
    }
    if ((md === 'original' || md === 'hd') && !aud.retro) aud.retro = new NeoAudio('retro');
    const na = aud[md] || aud.retro;
    if (neoAudio && neoAudio !== na) neoAudio.stopAll();
    neo = rend[md] || null; neoAudio = na;
    mode = md;
    store.set('inertie.mode', md);
    screen.style.display = md === 'original' ? '' : 'none';
    hdCanvas.style.display = md === 'hd' ? 'block' : 'none';
    neoCanvas.style.display = md === 'neo' || md === 'dog' ? 'block' : 'none';
    if (neoAudio) { neoAudio.start(); neoAudio.setMuted(userMuted); }
    if (neo) neo.reset();
    layout();
    $('light').hidden = md !== 'hd';
    document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === md));
  }
  document.querySelectorAll('#modes button').forEach((b) => { b.onclick = () => { setMode(b.dataset.mode); b.blur(); }; });
  $('light').onclick = (e) => {
    if (!hd) return;
    hd.light = hd.light ? 0 : 1;
    e.target.textContent = 'Éclairage : ' + (hd.light ? 'activé' : 'coupé');
    e.target.blur();
  };

  loadFiles().then(() => {
    boot();
    $('loading').classList.add('hide');
    setMode(mode);
    layout();
    requestAnimationFrame(loop);
  }).catch((err) => {
    $('err').textContent = 'Fichier introuvable : ' + err.message;
  });
  // Aperçu d'un écran quelconque de la planète en mémoire (mise au point du rendu Néo-Tokyo)
  function preview(screenIndex) {
    if (!neo) setMode('neo');
    const st = view.read();
    const mapPtr = 0x5038 + screenIndex * 100;
    st.phase = 'play'; st.screen = screenIndex; st.cx = screenIndex % 12; st.cy = Math.floor(screenIndex / 12);
    st.raw = m.mem.slice(mapPtr, mapPtr + 100);
    st.shown = Int16Array.from(st.raw, (c) => (c >= 0x80 ? 0x08 : c));
    st.ship = null; st.residual = []; st.playTexts = [];
    neo.palette = Array.from({ length: 16 }, (_, p) => m.penRGB(p));
    neo.prevScreen = -1;
    neoFx.render(neo.render(st, m.mem, { thrust: false }, 0.016), neo.fx, performance.now() / 1000);
    previewing = true;
  }

  // ---------- outils de mise au point (console) ----------
  const CODES = ['J12C58', 'A35F13', 'J74V99', 'KIM742', 'SUNC79', 'G8I365', 'RS232C', 'UBI57H', 'O97P94', 'T78S26'];
  function callRoutine(addr, regs = {}) {
    const c = m.cpu, RET = 0xB8F8;
    const save = { pc: c.pc, sp: c.sp, a: c.a, f: c.f, b: c.b, c: c.c, d: c.d, e: c.e, h: c.h, l: c.l, ix: c.ix, iy: c.iy };
    Object.assign(c, regs); c.push(RET); c.pc = addr;
    for (let n = 0; c.pc !== RET && n < 5e6; n++) {
      const pc = c.pc;
      if (pc >= 0xB900 && pc < 0xBE00 && !m.patched.has(pc)) { const h = m.fw[pc]; if (h && h() === 'block') break; c.pc = c.pop(); continue; }
      const hk = m.hooks.get(pc); if (hk) hk(c, m);
      c.step();
    }
    Object.assign(c, save);
  }
  // Démarre la planète n (1-10) et téléporte le vaisseau sur l'écran s
  function goto(n, s, col = 22, line = 60) {
    boot();
    const seq = [[5, ' '], [30, '1'], ...[...CODES[n - 1]].map((ch, i) => [80 + i * 10, ch]), [300, ' ']];
    for (let f = 0; f < 700; f++) { for (const [cf, ch] of seq) if (cf === f) m.charQueue.push(ch.charCodeAt(0)); m.runFrame(); }
    if (s !== undefined) {
      const ptr = 0x5038 + s * 100, mem = m.mem;
      mem[0x042C] = ptr & 0xFF; mem[0x042D] = ptr >> 8; mem[0x21ED] = (s % 12) + 1; mem[0x21EE] = Math.floor(s / 12) + 1;
      callRoutine(0x0FE1, { h: ptr >> 8, l: ptr & 0xFF });
      const a = 0xC000 + (line & 7) * 0x800 + (line >> 3) * 80 + col;
      mem[0x040B] = a & 0xFF; mem[0x040C] = a >> 8; mem[0x041C] = col; mem[0x041D] = 199 - line;
      callRoutine(0x1980);
    }
    previewing = false;
  }
  function frames(n) { for (let i = 0; i < n; i++) { m.runFrame(); if (i % 2) draw(); } draw(); }

  window.inertie = { goto, frames, preview, get audioNeo() { return neoAudio; }, get m() { return m; }, get view() { return view; }, get neo() { return neo; }, draw: () => draw() };
})();
