// Rendu « Toutous » : le même jeu redessiné en monde de chiens (création originale, dessinée par le code).
// Chiot dans une niche-fusée, chiens perdus en scaphandre, chats cosmiques, os et balles de tennis.
// Hérite du rendu Néo-Tokyo : seuls l'aspect des éléments et les couleurs changent.
(function (root) {
  'use strict';

  const L = NeoRenderer.lib;
  const { W, H, PS, HX, SX, SY, TW, TH, fbm, vnoise, canvas } = L;
  const ROUND = '"Arial Rounded MT Bold","Avenir Next","Helvetica Neue",Arial,sans-serif';
  const INK = '#3b2414', CREAM = '#fff6e6', PINK = '#ff7aa8', SKY = '#8fd3ff', GRASS = '#7ccf5a';
  // Mots doux affichés à tour de rôle au-dessus du chiot
  const PRAISE = ["C'EST QUI LE BON TOUTOU ?", "C'EST MON GROS PÉPÈRE ÇA !", 'BON CHIENCHIEN !', 'QUI C\'EST QUI EST BEAU ?',
    'OH LE BRAVE TOUTOU !', 'BIEN ! TRÈS BIEN !', 'QUI VEUT UNE CROQUETTE ?', 'MON PETIT LOULOU !'];
  const BROWN = '#b8763e', BROWN2 = '#8a5426', TENNIS = '#d8f03c';

  // Teintes pastel des planètes (une par planète)
  const PASTEL = [[255, 196, 140], [255, 196, 140], [190, 225, 255], [255, 205, 225], [255, 225, 150],
    [200, 240, 190], [210, 200, 255], [220, 220, 220], [255, 215, 170], [200, 235, 255], [255, 255, 255]];

  class DogRenderer extends NeoRenderer {
    constructor(target) {
      super(target);
      this.veins = false;
      this.haze = false;
      this.ashColor = 'rgba(255,255,255,0.7)';      // poils qui volent
      this.bubbleText = { hello: 'OUAF ! OUAF !', ask: "TU M'EMMÈNES ?", mark: '🐾' };
      this.commTitle = 'ABOIEMENTS  //  WOUF-RADIO';
      this.fx.soft = 1; this.fx.bloomK = 0.08;
      this.words = [];
      this.praiseN = 0; this.praiseAt = 6;
    }

    planetTint(st) { return PASTEL[st.planet % PASTEL.length] || PASTEL[0]; }

    // Roche = gâteau de croquettes pastel avec un contour dessin animé
    surface(wx, wy, hue, diff, rim, h, a) {
      // pâte lisse, plus foncée vers l'intérieur
      const n = vnoise(wx / 160, wy / 160);
      const k0 = 0.95 + 0.1 * n - 0.18 * Math.min(1, h);
      let r = hue[0] * k0, g = hue[1] * k0, b = hue[2] * k0;
      // croquettes : un rond par case de 30 px, dans une case sur trois
      const cx = Math.floor(wx / 30), cy = Math.floor(wy / 30);
      if (h > 0.25 && L.hash(cx, cy) < 0.33) {
        const px = cx * 30 + 8 + L.hash(cy + 7, cx + 3) * 14, py = cy * 30 + 8 + L.hash(cx + 11, cy + 5) * 14;
        const d = Math.hypot(wx - px, wy - py);
        if (d < 6) { const hl = d < 2.5 && wx < px && wy < py ? 40 : 0; r = 150 + hl; g = 92 + hl; b = 48 + hl; }
        else if (d < 7.5) { r *= 0.75; g *= 0.72; b *= 0.7; }
      }
      // éclairage doux, reflet sur le bord exposé
      const sh = 0.85 + 0.22 * diff;
      r *= sh; g *= sh; b *= sh;
      const glow = rim * rim * Math.max(0, 1 - h * 2) * 70;
      r += glow; g += glow; b += glow;
      // contour brun fin et net
      if (a > 0.12 && a < 0.5) { r = 92; g = 56; b = 30; }
      return [r, g, b];
    }

    // Ciel bleu, nuages, collines et niches
    buildCity(planet) {
      const c = canvas(2400, 900), g = c.getContext('2d');
      const sky = g.createLinearGradient(0, 0, 0, 900);
      sky.addColorStop(0, '#6fc4ff'); sky.addColorStop(0.7, '#cdeeff'); sky.addColorStop(1, '#ffe3f0');
      g.fillStyle = sky; g.fillRect(0, 0, 2400, 900);
      let s = 7 + planet * 31;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      g.fillStyle = 'rgba(255,255,255,0.95)';
      for (let k = 0; k < 18; k++) {
        const x = rnd() * 2400, y = 60 + rnd() * 300, r = 30 + rnd() * 40;
        g.beginPath(); for (let j = 0; j < 4; j++) g.arc(x + j * r * 0.8, y + Math.sin(j * 2) * 10, r * (0.8 + 0.3 * Math.sin(j)), 0, Math.PI * 2); g.fill();
      }
      for (const [base, col] of [[620, '#a5e08a'], [700, GRASS]]) {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, 900);
        for (let x = 0; x <= 2400; x += 40) g.lineTo(x, base - 60 * Math.sin(x / 260 + base) - 30 * Math.sin(x / 90));
        g.lineTo(2400, 900); g.fill();
      }
      // niches au loin
      for (let k = 0; k < 9; k++) {
        const x = rnd() * 2300, y = 690 - rnd() * 40;
        g.fillStyle = ['#e85d5d', '#5d8de8', '#f0b03c'][k % 3]; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 25, y - 24); g.lineTo(x + 56, y); g.fill();
        g.fillStyle = '#c98c50'; g.fillRect(x, y, 50, 36); g.fillStyle = INK; g.beginPath(); g.arc(x + 25, y + 36, 11, Math.PI, 0); g.fill();
      }
      return { c, planet };
    }

    // ---------- décor fixe ----------
    drawPanel(g, x, y) {               // briques -> palissade en bois
      g.save();
      for (let k = 0; k < 4; k++) {
        const px = x + k * 20;
        g.fillStyle = k % 2 ? '#d9a066' : '#e8b57a'; g.fillRect(px + 1, y + 8, 18, TH - 8);
        g.beginPath(); g.moveTo(px + 1, y + 8); g.lineTo(px + 10, y); g.lineTo(px + 19, y + 8); g.fill();
        g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(px + 1, y + 8, 18, TH - 8);
      }
      g.restore();
    }
    drawGlass(g, x, y) { g.fillStyle = 'rgba(140,210,255,0.35)'; g.fillRect(x, y, TW, TH); }
    drawPadBase(g, x, y) {              // plateforme -> coussin
      g.save();
      g.fillStyle = '#ff9ec4'; g.strokeStyle = INK; g.lineWidth = 3;
      this.roundRect(g, x + 2, y + 2, TW - 4, 20, 9); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)'; this.paw(g, x + TW / 2, y + 12, 5);
      g.restore();
    }
    drawPadLights() {}

    paw(g, x, y, r) {
      g.beginPath(); g.ellipse(x, y + r * 0.4, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (k - 1.5) * r * 0.75, y - r * 0.8 - (k === 1 || k === 2 ? r * 0.3 : 0), r * 0.38, 0, Math.PI * 2); g.fill(); }
    }

    // ---------- objets ----------
    drawTurret(g, code, cx, cy, t) {     // tourelle -> bouche d'incendie
      g.save(); g.translate(cx, cy + 6);
      g.fillStyle = '#e53935'; g.strokeStyle = INK; g.lineWidth = 3;
      this.roundRect(g, -14, -20, 28, 42, 6); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -20, 14, Math.PI, 0); g.fill(); g.stroke();
      g.fillRect(-22, -6, 44, 10); g.strokeRect(-22, -6, 44, 10);
      g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(0, -34, 5, 0, Math.PI * 2); g.fill(); g.stroke();
      // petit jet
      if (Math.sin(t * 3 + code) > 0.6) { g.fillStyle = 'rgba(120,200,255,0.8)'; for (let k = 0; k < 5; k++) g.fillRect(24 + k * 6, -2 + k * k, 4, 4); }
      g.restore();
    }

    drawDrone(g, cx, cy, t, code) {       // soucoupe -> chat cosmique
      g.save(); g.translate(cx, cy + Math.sin(t * 3 + code) * 4);
      g.fillStyle = '#9e9e9e'; g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 8, 32, 10, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      const fur = ['#ff9f43', '#555', '#f5f5f5', '#c49a6c'][code % 4];
      g.fillStyle = fur;
      g.beginPath(); g.moveTo(-16, -6); g.lineTo(-12, -26); g.lineTo(-2, -12); g.lineTo(2, -12); g.lineTo(12, -26); g.lineTo(16, -6); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -4, 17, 0, Math.PI * 2); g.fill(); g.stroke();
      // yeux méchants
      g.fillStyle = '#c6ff00'; g.beginPath(); g.ellipse(-7, -6, 5, 4, 0.3, 0, Math.PI * 2); g.ellipse(7, -6, 5, 4, -0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.fillRect(-8, -9, 2, 7); g.fillRect(6, -9, 2, 7);
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-12, -13); g.lineTo(-3, -10); g.moveTo(12, -13); g.lineTo(3, -10); g.stroke();
      g.fillStyle = PINK; g.beginPath(); g.moveTo(-3, 0); g.lineTo(3, 0); g.lineTo(0, 3); g.fill();
      g.restore();
    }

    drawOrb(g, cx, cy, t, code) {          // boule de feu -> pelote de laine enragée
      g.save(); g.translate(cx, cy); g.rotate(t * 3 + code);
      g.fillStyle = ['#ff6f91', '#845ec2', '#ff9671', '#00c9a7'][code % 4]; g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(0, 0, 18, k * 1.3, k * 1.3 + 1.6); g.stroke(); }
      g.strokeStyle = INK; g.beginPath(); g.moveTo(18, 6); g.quadraticCurveTo(34, 18, 28, 30); g.stroke();
      g.restore();
    }

    drawVortex(g, cx, cy, t) {             // tourbillon -> aspirateur
      g.save(); g.translate(cx, cy);
      g.fillStyle = '#7e57c2'; g.strokeStyle = INK; g.lineWidth = 3;
      this.roundRect(g, -24, -10, 40, 26, 10); g.fill(); g.stroke();
      g.fillStyle = '#333'; g.beginPath(); g.arc(-14, 18, 6, 0, Math.PI * 2); g.arc(8, 18, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#555'; g.lineWidth = 5; g.beginPath(); g.moveTo(16, -4); g.quadraticCurveTo(34, -30, 18, -36); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const r = ((t * 30 + k * 10) % 30); g.beginPath(); g.arc(18, -36, 30 - r, 0, Math.PI * 2); g.stroke(); }
      g.restore();
    }

    drawRing(g, cx, cy, t) {               // anneau -> balle de tennis
      g.save(); g.translate(cx, cy + Math.abs(Math.sin(t * 5)) * -10);
      g.fillStyle = TENNIS; g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(-16, 0, 13, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(16, 0, 13, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
      g.restore();
    }

    drawCapsule(g, cx, cy, t) { this.bone(g, cx, cy + Math.sin(t * 2) * 4, 1.2, -0.4); }

    bone(g, x, y, s, a) {
      g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
      g.fillStyle = CREAM; g.strokeStyle = INK; g.lineWidth = 2.5;
      g.beginPath(); g.arc(-14, -5, 6, 0, Math.PI * 2); g.arc(-14, 5, 6, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(14, -5, 6, 0, Math.PI * 2); g.arc(14, 5, 6, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillRect(-14, -4, 28, 8); g.beginPath(); g.moveTo(-14, -4); g.lineTo(14, -4); g.moveTo(-14, 4); g.lineTo(14, 4); g.stroke();
      g.restore();
    }

    // Cosmonaute -> chien perdu en scaphandre
    drawPerson(g, fx, fy, t, code) {
      const wave = code === 0x3D || code === 0x3E || code === 0x56 || code === 0x57 || code === 0x4F;
      const wag = Math.sin(t * 18) * 0.5;
      g.save(); g.translate(fx, fy);
      g.strokeStyle = INK; g.lineWidth = 2.5;
      const fur = ['#d9a066', '#f5f5f5', '#6d4c41', '#ffcc80'][code % 4];
      // queue qui remue
      g.save(); g.translate(13, -22); g.rotate(-0.8 + wag); g.fillStyle = fur; g.fillRect(0, -3, 16, 6); g.strokeRect(0, -3, 16, 6); g.restore();
      // corps en combinaison
      g.fillStyle = '#fafafa'; this.roundRect(g, -14, -36, 28, 30, 10); g.fill(); g.stroke();
      g.fillStyle = '#e53935'; g.fillRect(-14, -24, 28, 5);
      // pattes
      g.fillStyle = fur; g.fillRect(-12, -8, 8, 8); g.fillRect(4, -8, 8, 8); g.strokeRect(-12, -8, 8, 8); g.strokeRect(4, -8, 8, 8);
      // bras levé si le chien appelle
      if (wave && Math.sin(t * 8) > 0) { g.fillStyle = '#fafafa'; g.fillRect(-24, -60, 8, 26); g.strokeRect(-24, -60, 8, 26); }
      // tête dans le bocal
      g.fillStyle = fur; g.beginPath(); g.arc(0, -52, 13, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#5d4037';
      g.beginPath(); g.ellipse(-13, -50, 5, 10, 0.3, 0, Math.PI * 2); g.ellipse(13, -50, 5, 10, -0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(-5, -55, 2.2, 0, Math.PI * 2); g.arc(5, -55, 2.2, 0, Math.PI * 2); g.arc(0, -48, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = PINK; g.fillRect(-2, -45, 5, 6);
      g.strokeStyle = 'rgba(150,220,255,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(0, -52, 19, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-8, -62, 5, 3, -0.6, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // ---------- tirs et éclats ----------
    drawBullets(g, bullets) {
      for (const b of bullets) this.bone(g, b.x * SX + 4, b.y * SY + 8, 0.55, this.t * 12);
    }

    spawnBurst(x, y, fresh) {
      if (!fresh) return;
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, kind: k % 3 });
      }
      this.say(x, y, ['KAÏ !', 'OUILLE', 'MIAOU#!', 'PFFT'][(Math.random() * 4) | 0]);
    }

    drawBursts(g) {
      for (const p of this.particles) {
        p.life -= 0.022; p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.98;
        g.save(); g.globalAlpha = Math.max(0, p.life);
        if (p.kind === 0) { g.fillStyle = TENNIS; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 7, 0, Math.PI * 2); g.fill(); g.stroke(); }
        else if (p.kind === 1) this.bone(g, p.x, p.y, 0.4, p.life * 10);
        else { g.fillStyle = '#c9925a'; g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.arc(p.x + 4, p.y + 2, 4, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      this.drawWords(g);
    }

    // onomatopées façon bande dessinée
    say(x, y, txt, size) { this.words.push({ x, y, txt, life: 1, rot: (Math.random() - 0.5) * 0.5, size }); }
    drawWords(g) {
      for (const w of this.words) {
        w.life -= 0.02; w.y -= 0.6;
        g.save(); g.translate(w.x, w.y); g.rotate(w.rot); const s = 1 + (1 - w.life) * 0.4; g.scale(s, s);
        g.globalAlpha = Math.min(1, w.life * 2);
        g.font = `900 ${w.size || 30}px ${ROUND}`; g.textAlign = 'center'; g.lineJoin = 'round';
        g.strokeStyle = INK; g.lineWidth = 7; g.strokeText(w.txt, 0, 0);
        g.fillStyle = '#ffeb3b'; g.fillText(w.txt, 0, 0);
        g.restore();
      }
      this.words = this.words.filter((w) => w.life > 0);
    }

    // ---------- vaisseau : chiot dans une niche-fusée ----------
    drawShip(g, s, t, thrust) {
      const cx = s.x * SX + 40, cy = s.y * SY + 40;
      const ang = (7 - s.frame) * Math.PI / 4;
      g.save(); g.translate(cx, cy); g.rotate(ang);
      if (thrust) {                          // propulsion : petits nuages blancs
        for (let k = 0; k < 4; k++) {
          const d = 30 + k * 13 + Math.random() * 6, r = 7 + k * 3;
          g.fillStyle = `rgba(255,255,255,${0.9 - k * 0.2})`; g.strokeStyle = `rgba(59,36,20,${0.5 - k * 0.12})`; g.lineWidth = 2;
          g.beginPath(); g.arc((Math.random() - 0.5) * 8, d, r, 0, Math.PI * 2); g.fill(); g.stroke();
        }
      }
      g.strokeStyle = INK; g.lineWidth = 3;
      // corps de la niche
      g.fillStyle = '#e8b57a'; this.roundRect(g, -22, -8, 44, 32, 6); g.fill(); g.stroke();
      // toit pointu (direction)
      g.fillStyle = '#e53935'; g.beginPath(); g.moveTo(-28, -6); g.lineTo(0, -34); g.lineTo(28, -6); g.closePath(); g.fill(); g.stroke();
      // ailerons
      g.fillStyle = '#5d8de8'; g.beginPath(); g.moveTo(-22, 14); g.lineTo(-32, 28); g.lineTo(-22, 24); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(22, 14); g.lineTo(32, 28); g.lineTo(22, 24); g.fill(); g.stroke();
      // chiot à la porte
      g.fillStyle = '#3b2414'; g.beginPath(); g.arc(0, 14, 13, Math.PI, 0); g.lineTo(13, 24); g.lineTo(-13, 24); g.fill();
      g.fillStyle = '#d9a066'; g.beginPath(); g.arc(0, 10, 10, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#8a5426'; g.beginPath(); g.ellipse(-10, 8, 4, 8, 0.4, 0, Math.PI * 2); g.ellipse(10, 8, 4, 8, -0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(-4, 7, 2, 0, Math.PI * 2); g.arc(4, 7, 2, 0, Math.PI * 2); g.arc(0, 12, 2.5, 0, Math.PI * 2); g.fill();
      if (Math.sin(t * 6) > 0) { g.fillStyle = PINK; g.fillRect(-2, 14, 4, 6); }
      g.restore();
      return [cx, cy];
    }

    // traînée : empreintes de pattes
    drawTrail(g) {
      g.save();
      for (let i = 2; i < this.trail.length; i += 4) {
        const p = this.trail[i], q = this.trail[i - 2];
        const a = Math.atan2(p.y - q.y, p.x - q.x) + Math.PI / 2;
        g.globalAlpha = 0.5 * i / this.trail.length;
        g.fillStyle = INK; g.save(); g.translate(p.x + ((i / 4) % 2 ? 6 : -6), p.y); g.rotate(a); this.paw(g, 0, 0, 4); g.restore();
      }
      g.restore();
    }

    // explosion du vaisseau : nuage de poils et pluie de balles
    drawExplosion(g, t) {
      const e = this.explo;
      if (!e) return;
      if (!e.done) {
        e.done = true; this.fx.flash = 0.25; this.fx.shake = 0.6;
        for (let k = 0; k < 30; k++) { const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 9; this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, life: 1.4, kind: k % 3 }); }
        this.say(e.x, e.y - 30, ['WAOUUUH !', 'KAÏ KAÏ !', 'NOOOON'][(Math.random() * 3) | 0]);
      }
      const k = (t - e.t0) / 1.4;
      if (k > 1) { this.explo = null; return; }
      g.save(); g.globalAlpha = 1 - k;
      g.fillStyle = '#f5e6d3'; g.strokeStyle = INK; g.lineWidth = 3;
      const r = 20 + 90 * Math.pow(k, 0.5);
      g.beginPath(); for (let j = 0; j < 9; j++) { const a = j / 9 * Math.PI * 2; g.arc(e.x + Math.cos(a) * r * 0.7, e.y + Math.sin(a) * r * 0.7, r * 0.45, 0, Math.PI * 2); } g.fill();
      g.restore();
    }

    // ---------- interface ----------
    drawHud(g, st, t) {
      g.save();
      g.fillStyle = '#fff3e0'; g.fillRect(HX, 0, W - HX, H);
      g.fillStyle = PINK; g.fillRect(HX, 0, 8, H);
      g.fillStyle = 'rgba(255,122,168,0.12)';
      for (let y = 20; y < H; y += 70) for (let x = HX + 30; x < W; x += 70) this.paw(g, x + ((y / 70) % 2) * 35, y, 10);
      g.font = `900 66px ${ROUND}`; g.lineJoin = 'round';
      g.strokeStyle = INK; g.lineWidth = 10; g.strokeText('INERTIE', HX + 40, 92);
      g.fillStyle = '#ffb300'; g.fillText('INERTIE', HX + 40, 92);
      g.fillStyle = INK; g.font = `bold 22px ${ROUND}`; g.fillText('WOUF WOUF ÉDITION', HX + 46, 126);
      g.font = `13px ${ROUND}`; g.fillText('PLANÈTE ' + Math.max(1, st.planet || 1) + '  ·  ÉCRAN ' + st.screen, HX + 46, 148);
      const hud = st.hud || {};
      const energy = parseInt(hud.ENERGIE || '0', 10), oxy = parseInt(hud.OXYGENE || '0', 10);
      const row = (y, label, value, bar, warn) => {
        g.fillStyle = INK; g.font = `bold 15px ${ROUND}`; g.fillText(label, HX + 46, y);
        g.fillStyle = warn && Math.floor(t * 4) % 2 ? '#e53935' : INK; g.font = `900 36px ${ROUND}`; g.fillText(value || '—', HX + 46, y + 38);
        if (bar !== undefined) {
          const n = 10, on = Math.round(bar * n);
          for (let k = 0; k < n; k++) { g.fillStyle = k < on ? (warn ? '#e53935' : '#8bc34a') : 'rgba(59,36,20,0.15)'; this.bone(g, HX + 64 + k * 36, y + 58, 0.5, 0); g.globalCompositeOperation = 'source-atop'; g.globalCompositeOperation = 'source-over'; if (k >= on) { g.fillStyle = 'rgba(255,243,224,0.7)'; g.fillRect(HX + 46 + k * 36, y + 48, 36, 20); } }
        }
      };
      row(196, 'SCORE', hud.SCORE);
      row(286, 'CROQUETTES (énergie)', hud.ENERGIE, Math.min(1, energy / 5000), energy < 1000);
      row(386, 'OXYGÈNE', hud.OXYGENE, Math.min(1, oxy / 100), oxy < 25);
      g.fillStyle = INK; g.font = `bold 15px ${ROUND}`; g.fillText('VIES', HX + 46, 486); g.fillText('TOUTOUS SAUVÉS', HX + 220, 486);
      g.font = `900 36px ${ROUND}`; g.fillText(hud.VIES || '—', HX + 46, 524); g.fillText(hud.COSMONAUTES || '—', HX + 220, 524);
      this.drawMinimap(g, st, t);
      g.restore();
    }

    drawTitle(g, st, t) {
      if (!this.city || this.city.planet !== 1) this.city = this.buildCity(1);
      g.drawImage(this.city.c, (t * 20) % 1200, 0, 1280, 900, 0, -60, 1280, 900);
      g.save();
      g.translate(640, 210); g.rotate(Math.sin(t * 2) * 0.03);
      g.font = `900 150px ${ROUND}`; g.textAlign = 'center'; g.lineJoin = 'round';
      g.strokeStyle = INK; g.lineWidth = 18; g.strokeText('INERTIE', 0, 0);
      g.fillStyle = '#ffb300'; g.fillText('INERTIE', 0, 0);
      g.font = `900 46px ${ROUND}`; g.lineWidth = 9; g.strokeText('WOUF WOUF ÉDITION', 0, 64);
      g.fillStyle = PINK; g.fillText('WOUF WOUF ÉDITION', 0, 64);
      g.restore();
      // chiot qui saute
      this.drawShip(g, { x: (980 - 40) / SX, y: (300 + Math.abs(Math.sin(t * 4)) * -60 - 40) / SY, frame: 7 }, t, true);
      const all = st.texts.filter((s) => s.str.trim());
      g.font = `900 28px ${ROUND}`; g.lineJoin = 'round';
      const txt = (s, x, y, col) => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y); };
      if (st.credits || !all.length) {
        let y = 390;
        for (const c of ['PROGRAMME  CHRISTOPHE LE BOUIL', 'GRAPHISME  PATRICK DAHER', 'MUSIQUE  XAVIER TALGORN', 'UBI SOFT  1987', '', 'APPUYEZ SUR UNE TOUCHE (OUAF)']) { txt(c, 132, y, c.startsWith('APPUYEZ') && Math.floor(t * 2) % 2 ? '#e53935' : INK); y += 40; }
      } else {
        for (const ln of all) txt(ln.str.trim(), 132 + (ln.x >= 50 ? 560 : 0), 380 + ln.y * 1.8, INK);
      }
    }

    // le bandeau de texte en jeu : style bande dessinée
    drawTextLines(g, lines) {
      g.save();
      for (const ln of lines) {
        const s = ln.str.trim();
        if (!s) continue;
        const x = ln.x * SX + 4, y = ln.y * SY;
        g.font = `900 24px ${ROUND}`;
        const w = g.measureText(s).width;
        g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3;
        this.roundRect(g, x - 10, y - 6, w + 20, 38, 10); g.fill(); g.stroke();
        g.fillStyle = INK; g.fillText(s, x, y + 22);
      }
      g.restore();
    }

    render(st, mem, input, dt) {
      // toutes les 7 à 11 s, un mot doux au-dessus du chiot (phrases prises à tour de rôle)
      if (st.phase === 'play' && st.ship && st.ship.frame >= 0 && this.t > this.praiseAt) {
        const x = Math.min(PS - 180, Math.max(180, st.ship.x * SX + 40)), y = Math.max(60, st.ship.y * SY - 10);
        this.words.push({ x, y, txt: PRAISE[this.praiseN++ % PRAISE.length], life: 1.6, rot: (Math.random() - 0.5) * 0.15, size: 34 });
        this.praiseAt = this.t + 7 + Math.random() * 4;
      }
      const out = super.render(st, mem, input, dt);
      if (st.phase !== 'play') this.drawWords(this.g);
      return out;
    }
  }

  root.DogRenderer = DogRenderer;
})(window);
