// Son du mode Néo-Tokyo : effets générés avec ElevenLabs (assets/sfx), déclenchés par les sons
// que le jeu original demande au firmware (on reconnaît chaque son à l'adresse qui l'appelle)
// et par des événements observés à l'écran.
(function (root) {
  'use strict';

  const FILES = ['tir', 'reacteur', 'explosion', 'ennemi', 'missile', 'signal', 'atterrissage', 'transition',
    'psychique', 'bip', 'touche', 'alarme', 'gameover', 'victoire', 'ambiance'];

  // Appel de SOUND QUEUE dans GAME.BIN -> effet
  const BY_CALLER = {
    0x0C87: 'tir',
    0x0EA8: 'explosion',
    0x2D33: 'ennemi',
    0x296E: 'missile', 0x2998: 'missile',
    0x2053: 'signal',
  };
  // Voix (ElevenLabs) : ordinateur de bord « canard » et cosmonaute marseillais
  const VOICES = ['canard_energie', 'canard_crash', 'canard_refus', 'canard_gameover',
    'cosmo_bulle', 'cosmo_oui', 'cosmo_non', 'cosmo_mort',
    'canard_tir', 'canard_ecran', 'canard_clone', 'canard_inactif', 'canard_victoire',
    'cosmo_bavard1', 'cosmo_bavard2', 'cosmo_bavard3'];
  const VOLUME = { tir: 0.55, explosion: 1, ennemi: 0.8, missile: 0.5, signal: 0.6, atterrissage: 0.7, transition: 0.45,
    psychique: 0.7, bip: 0.5, touche: 0.45, alarme: 0.5, gameover: 0.9, victoire: 0.9, reacteur: 0.55, ambiance: 0.35 };

  // Musiques (générées avec Eleven Music) : zone bouclée calée avant le fondu final de chaque fichier
  const MUSIC = {
    titre: { file: 'titre', loopStart: 10.5, loopEnd: 28.0, gain: 0.62 },     // Ruin Procession
    jeu: { file: 'jeu', loopStart: 0, loopEnd: 116.3, gain: 0.5 },          // Tunnel Ritual
    tension: { file: 'tension', loopStart: 0, loopEnd: 22.0, gain: 0.7 },   // Collapse Loop
    victoire: { file: 'victoire', once: true, gain: 0.7 },                 // Victory Impact
  };
  // Modes Original/Amélioré (Starbound Quest) et Toutous (Puppy Park Parade) : un seul morceau, joué partout
  const SOLO = { file: 'jeu', loopStart: 0, loopEnd: 60.0, gain: 0.55 };
  const XF = 1.0;
  // Mode Toutous : sons de chiens (assets/sfx_dog) à la place des effets Néo-Tokyo
  const DOG = ['tir', 'explosion', 'ennemi', 'missile', 'reacteur', 'psychique', 'gameover', 'victoire', 'transition', 'alarme'];
  const INSULTS = ['insulte1', 'insulte2', 'insulte3', 'insulte4', 'dispute1', 'dispute2', 'jappe1', 'jappe2'];
  const ORDI = ['ordi1', 'ordi2', 'ordi3', 'ordi4'];   // l'ordinateur de bord est un chien : « va niquer tes grands morts »   // fondu enchaîné à chaque reprise de boucle (s)

  class NeoAudio {
    constructor(theme) {
      this.theme = theme || 'neo';
      this.dog = this.theme === 'dog';
      this.musicOnly = this.theme === 'retro';
      this.solo = this.theme === 'retro' || this.dog;   // modes Original et Amélioré : musique seule, les bruitages restent ceux du CPC
      this.ctx = null;
      this.buf = {};
      this.last = {};
      this.thrustUntil = 0;
      this.thrust = null;
      this.amb = null;
      this.muted = false;
      this.seenTexts = new Set();
      this.alarmAt = 0;
      this.voiceAt = 0;
      this.bubble = false;      // un cosmonaute attend une réponse
      this.passenger = false;   // un cosmonaute a été embarqué depuis le dernier crash
    }

    async start() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.dog ? 1.6 : 0.9;     // les chiens : à fond
      // légère saturation commune : donne du grain à l'ensemble
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.out.connect(comp); comp.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.85;
      this.musicBus.connect(comp);
      this.music = {};
      const load = async (dir, n, store) => {
        try {
          const r = await fetch(`assets/${dir}/${n}.mp3`);
          store[n] = await this.ctx.decodeAudioData(await r.arrayBuffer());
        } catch (e) { if (!dir.startsWith('music_')) console.warn('son introuvable', dir, n); }
      };
      const dogBuf = {};
      await Promise.all([
        ...(this.musicOnly ? [] : FILES.map((n) => load('sfx', n, this.buf))),
        ...(this.musicOnly ? [] : VOICES.map((n) => load('voix', n, this.buf))),
        ...(this.dog ? [...DOG, ...INSULTS, ...ORDI].map((n) => load('sfx_dog', n, dogBuf)) : []),
        ...(this.solo ? [load({ retro: 'music_amstrad', dog: 'music_dog' }[this.theme], 'jeu', this.music)] : Object.values(MUSIC).map(async (t) => {
          const own = { retro: 'music_amstrad', dog: 'music_dog' }[this.theme];
          if (own) { await load(own, t.file, this.music); if (this.music[t.file]) return; }
          await load('music', t.file, this.music);
        })),
      ]);
      Object.assign(this.buf, dogBuf);   // les sons de chiens remplacent les effets du même nom
      this.ready = true;
    }

    // ---------- musique ----------
    // Change de morceau avec un fondu ; null = silence
    setTrack(name) {
      if (!this.ready || name === this.trackName) return;
      const now = this.ctx.currentTime;
      if (this.track) {
        const old = this.track;
        for (const v of old.voices) { v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(v.g.gain.value, now); v.g.gain.linearRampToValueAtTime(0, now + 1.2); try { v.src.stop(now + 1.3); } catch (e) { /* déjà arrêté */ } }
        clearTimeout(old.timer);
      }
      this.trackName = name;
      this.track = null;
      const def = this.solo ? SOLO : MUSIC[name];
      if (!name || !def || !this.music[def.file]) return;
      const tr = { name, def, voices: [], timer: null };
      this.track = tr;
      this.startVoice(tr, 0, now + 0.05, name === 'titre' || name === 'victoire' ? 0.3 : 1.2);
    }

    // Lance une lecture du fichier à partir de `offset`, et programme la reprise de boucle
    startVoice(tr, offset, when, fadeIn) {
      const def = tr.def, buf = this.music[def.file];
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(def.gain, when + fadeIn);
      src.connect(g); g.connect(this.musicBus);
      src.start(when, offset);
      const v = { src, g };
      tr.voices.push(v);
      if (tr.voices.length > 3) tr.voices.shift();
      if (def.once) {
        src.onended = () => { if (this.track === tr) { this.trackName = null; this.track = null; } };
        return;
      }
      // reprise : la voix suivante démarre au début de la boucle pendant que celle-ci s'efface
      const next = when + (def.loopEnd - offset) - XF;
      g.gain.setValueAtTime(def.gain, next);
      g.gain.linearRampToValueAtTime(0, next + XF);
      src.stop(next + XF + 0.05);
      const delay = Math.max(0, (next - this.ctx.currentTime - 0.5) * 1000);
      tr.timer = setTimeout(() => { if (this.track === tr) this.startVoice(tr, def.loopStart, next, XF); }, delay);
    }

    // Choisit le morceau selon la situation
    updateMusic(st) {
      if (this.muted) { this.setTrack(null); return; }
      if (this.solo) { this.setTrack(/GAME OVER/.test(st.texts.map((t) => t.str).join(' ')) ? null : 'solo'); return; }
      const texts = st.texts.map((t) => t.str).join(' ');
      let want;
      if (/MISSION|VAINCU|BRAVO/.test(texts)) want = 'victoire';
      else if (/GAME OVER/.test(texts)) want = null;
      else if (st.phase !== 'play') want = 'titre';
      else {
        const en = parseInt((st.hud && st.hud.ENERGIE) || '9999', 10), ox = parseInt((st.hud && st.hud.OXYGENE) || '999', 10);
        want = (en < 800 || ox < 20) ? 'tension' : 'jeu';
      }
      // la victoire se joue en entier avant de revenir au reste
      if (this.trackName === 'victoire' && this.track && want !== 'victoire') return;
      this.setTrack(want);
    }

    play(name, opts = {}) {
      if (!this.ctx || this.muted || !this.buf[name]) return null;
      const now = this.ctx.currentTime;
      const gap = opts.gap ?? 0.06;
      if (this.last[name] && now - this.last[name] < gap) return null;
      this.last[name] = now;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buf[name];
      src.playbackRate.value = opts.rate || (0.94 + Math.random() * 0.12);
      src.loop = !!opts.loop;
      const g = this.ctx.createGain();
      g.gain.value = (VOLUME[name] ?? 0.7) * (opts.vol ?? 1) * (this.dog ? 1.5 : 1);
      src.connect(g); g.connect(this.out);
      src.start();
      return { src, g };
    }

    // Réplique parlée : une seule à la fois, la musique baisse pendant qu'elle parle
    say(name, delay = 0) {
      // mode Toutous : tout le monde aboie (l'ordinateur comme les chiens perdus)
      if (this.dog) {
        const pool = (name.startsWith('canard_') ? ORDI : INSULTS).filter((n) => this.buf[n]);
        if (pool.length) name = pool[(Math.random() * pool.length) | 0];
      }
      if (!this.ctx || this.muted || !this.buf[name]) return;
      setTimeout(() => {
        if (this.muted) return;
        if (this.voice) { try { this.voice.stop(); } catch (e) { /* déjà arrêté */ } }
        const src = this.ctx.createBufferSource();
        src.buffer = this.buf[name];
        const g = this.ctx.createGain(); g.gain.value = this.dog ? 1.8 : 1.1;
        src.connect(g); g.connect(this.out);
        const now = this.ctx.currentTime, d = this.buf[name].duration;
        this.musicBus.gain.setTargetAtTime(0.4, now, 0.08);
        this.musicBus.gain.setTargetAtTime(0.85, now + d, 0.3);
        src.start();
        this.voice = src;
        this.voiceAt = performance.now() + d * 1000;
      }, delay);
    }

    speaking() { return performance.now() < this.voiceAt; }

    // Réplique occasionnelle : seulement si personne ne parle et pas trop souvent
    chatter(name, chance, delay = 0) {
      const now = performance.now();
      if (this.speaking() || now < (this.chatterAt || 0) || Math.random() > chance) return;
      this.chatterAt = now + 8000;
      this.say(name, delay);
    }

    // Aboiement-insulte (son ElevenLabs « fuck you Tony »)
    insult(delay) {
      if (!this.dog || this.muted || this.speaking()) return;
      const n = INSULTS[(Math.random() * INSULTS.length) | 0];
      setTimeout(() => this.play(n, { gap: 0.5, vol: 1.3, rate: 0.95 + Math.random() * 0.15 }), delay);
    }

    // Son demandé par le jeu original
    fromGame(caller) {
      this.activeAt = performance.now();
      if (caller === 0x1734) { this.thrustUntil = performance.now() + 140; return; }
      if (caller === 0x0C87) this.chatter('canard_tir', 0.03, 300);
      const name = BY_CALLER[caller];
      if (name) this.play(name, { gap: name === 'missile' ? 0.25 : 0.05 });
    }

    // Une fois par image
    update(st, renderEvents) {
      if (!this.ctx) return;
      const now = performance.now();
      // réacteur en boucle tant que le jeu le réclame
      const thrusting = now < this.thrustUntil && !this.muted;
      if (thrusting && !this.thrust) this.thrust = this.play('reacteur', { loop: true, rate: 1, gap: 0 });
      if (this.thrust) {
        const target = thrusting ? (VOLUME.reacteur) : 0;
        this.thrust.g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
        if (!thrusting && this.thrustStop === undefined) this.thrustStop = now;
        if (thrusting) this.thrustStop = undefined;
        if (!thrusting && now - this.thrustStop > 400) { try { this.thrust.src.stop(); } catch (e) { /* déjà arrêté */ } this.thrust = null; this.thrustStop = undefined; }
      }
      // musique, et ambiance de fond discrète sous la musique
      this.updateMusic(st);
      if (!this.amb && !this.muted && this.buf.ambiance) this.amb = this.play('ambiance', { loop: true, rate: 1, gap: 0 });
      if (this.amb) this.amb.g.gain.setTargetAtTime(this.muted ? 0 : (st.phase === 'play' ? 0.14 : 0.06), this.ctx.currentTime, 0.3);
      for (const e of renderEvents) {
        if (e === 'screen') { this.play('transition', { gap: 0.3 }); this.chatter('canard_ecran', 0.12, 400); }
        if (e === 'explode' && this.dog) this.insult(1600);
        if (e === 'explode') {
          if (this.passenger) { this.say('cosmo_mort', 500); this.passenger = false; }
          else if (Math.random() < 0.5 && !this.speaking()) this.say('canard_crash', 900);
          else this.chatter('canard_clone', 0.5, 3500);
        }
      }
      // textes qui apparaissent : dialogues, fin de partie
      const texts = st.texts.map((t) => t.str.trim()).filter(Boolean);
      for (const s of texts) {
        if (this.seenTexts.has(s)) continue;
        if (/PUIS JE|BONJOUR/.test(s)) {
          this.play('psychique', { gap: 1, vol: 0.5 });
          if (!this.bubble) { this.bubble = true; if (this.dog) this.insult(200); else this.say('cosmo_bulle', 300); }
        } else if (/GAME OVER/.test(s)) { this.play('gameover', { gap: 3 }); this.say('canard_gameover', 1200); }
        else if (/MISSION|BRAVO|VAINCU/.test(s)) { this.play('victoire', { gap: 3, vol: 0.5 }); this.say('canard_victoire', 2500); }
        else if (/ESPION|ERREUR|INCORECT/.test(s)) this.play('alarme', { gap: 2 });
      }
      if (this.bubble && !texts.some((x) => /PUIS JE|BONJOUR/.test(x))) this.bubble = false;
      this.seenTexts = new Set(texts);
      // pilote inactif, passager bavard ; en mode Toutous, les chiens s'engueulent régulièrement
      if (st.phase === 'play' && this.dog && now > (this.insultAt || 0)) {
        if (this.insultAt) this.insult(0);
        this.insultAt = now + 9000 + Math.random() * 12000;
      }
      if (st.phase === 'play') {
        if (!this.activeAt) this.activeAt = now;
        if (now - this.activeAt > 25000) { this.activeAt = now + 35000; this.chatter('canard_inactif', 1); }
        if (this.passenger) {
          if (!this.bavardAt) this.bavardAt = now + 15000 + Math.random() * 20000;
          if (now > this.bavardAt) { this.bavardAt = 0; this.chatter('cosmo_bavard' + (1 + Math.floor(Math.random() * 3)), 1); }
        }
      } else this.activeAt = 0;
      // alarme énergie / oxygène
      if (st.phase === 'play' && st.hud) {
        const en = parseInt(st.hud.ENERGIE || '9999', 10), ox = parseInt(st.hud.OXYGENE || '999', 10);
        if ((en < 800 || ox < 20) && now > this.alarmAt) {
          this.play('alarme', { vol: 0.6 }); this.alarmAt = now + 6000;
          if (now > (this.lowLineAt || 0) && !this.speaking()) { this.say('canard_energie', 700); this.lowLineAt = now + 30000; }
        }
      }
    }

    keyTyped(inMenu, key) {
      if (inMenu) this.play('touche', { gap: 0.03 });
      // réponse au cosmonaute (le jeu attend O ou N)
      if (this.bubble && key) {
        const k = key.toLowerCase();
        if (k === 'o') { this.bubble = false; this.passenger = true; this.say('cosmo_oui'); }
        else if (k === 'n') { this.bubble = false; this.say('cosmo_non'); this.say('canard_refus', 4300); }
      }
    }

    setMuted(v) {
      this.muted = v;
      if (v && this.thrust) { try { this.thrust.src.stop(); } catch (e) { /* déjà arrêté */ } this.thrust = null; }
      if (this.amb) this.amb.g.gain.value = v ? 0 : 0.3;
    }

    stopAll() {
      this.setTrack(null);
      for (const k of ['thrust', 'amb']) if (this[k]) { try { this[k].src.stop(); } catch (e) { /* déjà arrêté */ } this[k] = null; }
    }
  }

  root.NeoAudio = NeoAudio;
})(window);
