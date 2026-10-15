// Son du CPC : gestionnaire SOUND du firmware (files d'attente, enveloppes, 100 Hz)
// et synthèse de la puce AY-3-8912 (horloge 1 MHz).
(function (root) {
  'use strict';

  // Table de volume AY (logarithmique, 16 niveaux)
  const VOL = [0, 0.0107, 0.0153, 0.0221, 0.0321, 0.0468, 0.0687, 0.1015, 0.1514, 0.2296,
    0.3502, 0.5370, 0.8272, 1.2799, 1.9845, 3.0000].map((v) => v / 3);

  class FirmwareSound {
    constructor() {
      this.ampEnvs = [];  // 1..15 : sections [{count, step, pause}] ou {hw, shape, period}
      this.toneEnvs = []; // 1..15 : {repeat, sections:[{count, step, pause, abs}]}
      this.reset();
      // registres AY résultants
      this.regs = new Uint8Array(16);
      this.regs[7] = 0x3F;
    }

    reset() {
      this.ch = [0, 1, 2].map(() => ({ queue: [], cur: null, held: false }));
    }

    amplEnv(n, bytes) {
      if (n < 1 || n > 15) return;
      const cnt = bytes[0];
      const secs = [];
      for (let i = 0; i < (cnt & 0x7F) && i < 5; i++) {
        const b0 = bytes[1 + i * 3], b1 = bytes[2 + i * 3], b2 = bytes[3 + i * 3];
        if (b0 & 0x80) secs.push({ hw: true, shape: b0 & 0x0F, period: b1 | (b2 << 8) });
        else secs.push({ count: b0, step: b1 > 127 ? b1 - 256 : b1, pause: b2 || 256 });
      }
      this.ampEnvs[n] = secs;
    }

    toneEnv(n, bytes) {
      if (n < 1 || n > 15) return;
      const cnt = bytes[0];
      const secs = [];
      for (let i = 0; i < (cnt & 0x7F) && i < 5; i++) {
        const b0 = bytes[1 + i * 3], b1 = bytes[2 + i * 3], b2 = bytes[3 + i * 3];
        if (b0 & 0x80) secs.push({ abs: true, period: ((b0 & 0x0F) << 8) | b1, pause: b2 || 256 });
        else secs.push({ count: b0 || 1, step: b1 > 127 ? b1 - 256 : b1, pause: b2 || 256 });
      }
      this.toneEnvs[n] = { repeat: !!(cnt & 0x80), secs };
    }

    // Bloc de 9 octets du firmware
    queue(blk) {
      const status = blk[0];
      const note = {
        status,
        chans: status & 7,
        rdv: (status >> 3) & 7,
        hold: !!(status & 0x40),
        flush: !!(status & 0x80),
        ampEnv: blk[1] & 15,
        toneEnv: blk[2] & 15,
        period: (blk[3] | (blk[4] << 8)) & 0x0FFF,
        noise: blk[5] & 31,
        amp: blk[6] & 15,
        duration: (blk[7] | (blk[8] << 8)),
      };
      if (note.duration > 32767) note.duration -= 65536;
      // file pleine ?
      for (let c = 0; c < 3; c++) if ((note.chans >> c) & 1) {
        if (note.flush) { this.ch[c].queue.length = 0; this.ch[c].cur = null; }
        else if (this.ch[c].queue.length >= 4) return false;
      }
      for (let c = 0; c < 3; c++) if ((note.chans >> c) & 1) this.ch[c].queue.push(note);
      return true;
    }

    check(mask) {
      let c = mask & 1 ? 0 : mask & 2 ? 1 : 2;
      const ch = this.ch[c];
      let st = (4 - ch.queue.length) & 7;
      if (ch.cur) st |= 0x80;
      if (ch.held) st |= 0x40;
      return st;
    }

    release(mask) { for (let c = 0; c < 3; c++) if ((mask >> c) & 1) this.ch[c].held = false; }

    startNote(c) {
      const ch = this.ch[c];
      if (!ch.queue.length) return;
      const n = ch.queue[0];
      // rendez-vous : toutes les voies concernées doivent avoir cette note en tête
      if (n.chans !== (1 << c)) {
        for (let k = 0; k < 3; k++) if (((n.chans >> k) & 1) && (this.ch[k].cur || this.ch[k].queue[0] !== n)) return;
      }
      if (n.rdv) {
        for (let k = 0; k < 3; k++) if ((n.rdv >> k) & 1) {
          const o = this.ch[k];
          if (o.cur || !o.queue.length || !((o.queue[0].rdv >> c) & 1)) return;
        }
      }
      ch.queue.shift();
      const st = {
        note: n, period: n.period, noise: n.noise, amp: n.amp, hw: null,
        time: n.duration, // en 1/100 s ; 0 = durée de l'enveloppe ; négatif = répétitions
        aSec: 0, aCount: 0, aPause: 0, aDone: false,
        tSec: 0, tCount: 0, tPause: 0,
      };
      const ae = n.ampEnv ? this.ampEnvs[n.ampEnv] : null;
      st.ae = ae && ae.length ? ae : null;
      const te = n.toneEnv ? this.toneEnvs[n.toneEnv] : null;
      st.te = te && te.secs.length ? te : null;
      if (!st.ae && st.time === 0) st.time = 200; // sans enveloppe : 2 secondes
      this.loadAmpSection(st);
      this.loadToneSection(st);
      ch.cur = st;
    }

    loadAmpSection(st) {
      if (!st.ae) { st.aDone = true; return; }
      const s = st.ae[st.aSec];
      if (!s) { st.aDone = true; return; }
      if (s.hw) { st.hw = s; st.aCount = 0; st.aPause = 1; return; }
      st.aCount = s.count; st.aPause = s.pause;
    }

    loadToneSection(st) {
      if (!st.te) return;
      const s = st.te.secs[st.tSec];
      if (!s) return;
      if (s.abs) { st.period = s.period; st.tCount = 0; st.tPause = s.pause; return; }
      st.tCount = s.count; st.tPause = s.pause;
    }

    // Tic du gestionnaire de son (100 Hz)
    tick() {
      for (let c = 0; c < 3; c++) {
        const ch = this.ch[c];
        if (!ch.cur) this.startNote(c);
        const st = ch.cur;
        if (!st) continue;
        // enveloppe de volume
        let ended = false;
        if (st.ae && !st.aDone) {
          if (--st.aPause <= 0) {
            const s = st.ae[st.aSec];
            if (s && !s.hw) st.amp = (st.amp + s.step) & 15;
            if (--st.aCount <= 0) {
              st.aSec++;
              if (st.aSec >= st.ae.length) {
                st.aDone = true;
                if (st.time < 0) { st.time++; if (st.time < 0) { st.aSec = 0; st.aDone = false; } }
              }
              if (!st.aDone) this.loadAmpSection(st);
            } else if (s) st.aPause = s.pause;
          }
        }
        // enveloppe de tonalité
        if (st.te) {
          if (--st.tPause <= 0) {
            const s = st.te.secs[st.tSec];
            if (s && !s.abs) st.period = (st.period + s.step) & 0x0FFF;
            if (!s || s.abs || --st.tCount <= 0) {
              st.tSec++;
              if (st.tSec >= st.te.secs.length) { if (st.te.repeat) st.tSec = 0; else st.te = null; }
              if (st.te) this.loadToneSection(st);
            } else st.tPause = s.pause;
          }
        }
        // durée : positive en 1/100 s, nulle = fin de l'enveloppe, négative = répétitions de l'enveloppe
        if (st.time > 0) { if (--st.time <= 0) ended = true; }
        else if (st.aDone) ended = true;
        if (ended) { ch.cur = null; this.startNote(c); }
      }
      this.updateRegs();
    }

    updateRegs() {
      const r = this.regs;
      let mix = 0x3F;
      let noise = 0;
      for (let c = 0; c < 3; c++) {
        const st = this.ch[c].cur;
        if (!st) { r[8 + c] = 0; continue; }
        r[c * 2] = st.period & 0xFF;
        r[c * 2 + 1] = (st.period >> 8) & 0x0F;
        if (st.period) mix &= ~(1 << c);
        if (st.noise) { mix &= ~(8 << c); noise = st.noise; }
        if (st.hw) {
          r[8 + c] = 0x10;
          r[11] = st.hw.period & 0xFF; r[12] = st.hw.period >> 8;
          if (!st.hwSet) { r[13] = st.hw.shape; st.hwSet = true; this.envRestart = true; }
        } else r[8 + c] = st.amp & 15;
      }
      r[6] = noise;
      r[7] = mix;
    }

    // appelé une fois par trame (50 Hz) : deux tics à 100 Hz
    frame() { this.tick(); this.snap1 = Uint8Array.from(this.regs); this.tick(); }
  }

  // Synthèse AY : produit des échantillons à partir des registres
  class AY {
    constructor(rate) {
      this.rate = rate;
      this.step = 1000000 / 8 / rate;  // périodes de l'horloge interne (1 MHz / 8) par échantillon
      this.cnt = [0, 0, 0]; this.out = [0, 0, 0];
      this.ncnt = 0; this.lfsr = 1; this.nout = 0;
      this.ecnt = 0; this.epos = 0; this.ehold = false; this.eshape = 0;
      this.regs = new Uint8Array(16);
    }

    setRegs(r, restartEnv) {
      this.regs.set(r);
      if (restartEnv) { this.epos = 0; this.ehold = false; this.eshape = r[13] & 15; }
    }

    envLevel() {
      const s = this.eshape, p = this.epos;
      const att = (s & 4) ? 1 : 0;
      if (p < 32) { const v = p >> 1; return att ? v : 15 - v; }
      if (!(s & 8)) return 0;
      if (s & 1) { // maintien
        const end = (s & 2) ? !att : att;
        return end ? 15 : 0;
      }
      const cyc = ((p - 32) >> 5) & 1;
      const v = ((p - 32) & 31) >> 1;
      const a = (s & 2) ? (cyc ? att : !att) : att;
      return a ? v : 15 - v;
    }

    render(buf, off, n) {
      const r = this.regs;
      const tp = [((r[1] & 15) << 8) | r[0], ((r[3] & 15) << 8) | r[2], ((r[5] & 15) << 8) | r[4]];
      const np = (r[6] & 31) || 1;
      const ep = ((r[12] << 8) | r[11]) || 1;
      const mix = r[7];
      for (let i = 0; i < n; i++) {
        // avance de l'horloge (sous-échantillonnage simple)
        for (let c = 0; c < 3; c++) {
          const per = (tp[c] || 1) * 2;
          this.cnt[c] += this.step * 2;
          while (this.cnt[c] >= per) { this.cnt[c] -= per; this.out[c] ^= 1; }
        }
        this.ncnt += this.step;
        while (this.ncnt >= np * 2) {
          this.ncnt -= np * 2;
          const bit = (this.lfsr ^ (this.lfsr >> 3)) & 1;
          this.lfsr = (this.lfsr >> 1) | (bit << 16);
          this.nout = this.lfsr & 1;
        }
        this.ecnt += this.step;
        while (this.ecnt >= ep) {
          this.ecnt -= ep;
          if (this.epos < 32 || ((this.eshape & 8) && !(this.eshape & 1))) this.epos++;
          if (this.epos >= 96) this.epos = 32;
        }
        let s = 0;
        for (let c = 0; c < 3; c++) {
          const toneOn = !((mix >> c) & 1), noiseOn = !((mix >> (c + 3)) & 1);
          const t = toneOn ? this.out[c] : 1;
          const nz = noiseOn ? this.nout : 1;
          if (t & nz) {
            const v = r[8 + c] & 0x10 ? this.envLevel() : (r[8 + c] & 15);
            s += VOL[v];
          }
        }
        buf[off + i] = s * 0.25;
      }
    }
  }

  // Sortie audio navigateur : un tampon circulaire alimenté par l'émulation
  class AudioOut {
    constructor(fw) {
      this.fw = fw;
      this.ctx = null;
      this.muted = false;
      this.pending = [];
    }

    start() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.ay = new AY(this.ctx.sampleRate);
      this.ring = new Float32Array(this.ctx.sampleRate); // 1 s
      this.rd = 0; this.wr = 0;
      const node = this.ctx.createScriptProcessor(1024, 0, 1);
      node.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        const avail = (this.wr - this.rd + this.ring.length) % this.ring.length;
        for (let i = 0; i < out.length; i++) {
          if (i < avail) { out[i] = this.muted ? 0 : this.ring[this.rd]; this.rd = (this.rd + 1) % this.ring.length; }
          else out[i] = 0;
        }
      };
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 20;
      node.connect(hp); hp.connect(this.ctx.destination);
      this.node = node;
    }

    // Produit 1/50 s d'audio à partir de l'état courant du firmware
    frame() {
      if (!this.ctx || !this.ay) return;
      const n = Math.round(this.ctx.sampleRate / 100);
      const tmp = new Float32Array(n);
      for (const regs of [this.fw.snap1, this.fw.regs]) {
        if (!regs) continue;
        this.ay.setRegs(regs, this.fw.envRestart);
        this.fw.envRestart = false;
        this.ay.render(tmp, 0, n);
        const avail = (this.wr - this.rd + this.ring.length) % this.ring.length;
        if (avail > this.ring.length / 4) continue; // trop d'avance : on saute
        for (let i = 0; i < n; i++) { this.ring[this.wr] = tmp[i]; this.wr = (this.wr + 1) % this.ring.length; }
      }
    }
  }

  root.FirmwareSound = FirmwareSound;
  root.AY = AY;
  root.AudioOut = AudioOut;
  if (typeof module !== 'undefined') module.exports = { FirmwareSound, AY, AudioOut };
})(typeof window !== 'undefined' ? window : globalThis);
