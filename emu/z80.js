// Cœur Z80 (instructions documentées et non documentées usuelles).
// Utilisé comme référence : il fait tourner le code original d'Inertie pour vérifier le remake.
(function (root) {
  'use strict';

  const FS = 0x80, FZ = 0x40, FY = 0x20, FH = 0x10, FX = 0x08, FP = 0x04, FN = 0x02, FC = 0x01;

  // Tables de drapeaux précalculées
  const SZ = new Uint8Array(256);
  const SZP = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let p = i, par = 1;
    for (let k = 0; k < 8; k++) { par ^= p & 1; p >>= 1; }
    SZ[i] = (i & (FS | FY | FX)) | (i === 0 ? FZ : 0);
    SZP[i] = SZ[i] | (par ? FP : 0);
  }

  // Durées (T-states) du jeu principal
  const CYC = [
    4,10,7,6,4,4,7,4,4,11,7,6,4,4,7,4, 8,10,7,6,4,4,7,4,12,11,7,6,4,4,7,4,
    7,10,16,6,4,4,7,4,7,11,16,6,4,4,7,4, 7,10,13,6,11,11,10,4,7,11,13,6,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4, 4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4, 7,7,7,7,7,7,4,7,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4, 4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4, 4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    5,10,10,10,10,11,7,11,5,10,10,0,10,17,7,11, 5,10,10,11,10,11,7,11,5,4,10,11,10,0,7,11,
    5,10,10,19,10,11,7,11,5,4,10,4,10,0,7,11, 5,10,10,4,10,11,7,11,5,6,10,4,10,0,7,11,
  ];

  class Z80 {
    constructor(bus) {
      // bus : { read(a), write(a,v), input(port), output(port,v) }
      this.bus = bus;
      this.reset();
    }

    reset() {
      this.a = 0xFF; this.f = 0xFF; this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
      this.a_ = 0; this.f_ = 0; this.b_ = 0; this.c_ = 0; this.d_ = 0; this.e_ = 0; this.h_ = 0; this.l_ = 0;
      this.ix = 0xFFFF; this.iy = 0xFFFF; this.sp = 0xFFFF; this.pc = 0;
      this.i = 0; this.r = 0; this.iff1 = 0; this.iff2 = 0; this.im = 0; this.halted = false;
      this.cycles = 0;
    }

    // --- accès mémoire ---
    rb(a) { return this.bus.read(a & 0xFFFF); }
    wb(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
    rw(a) { return this.rb(a) | (this.rb(a + 1) << 8); }
    ww(a, v) { this.wb(a, v); this.wb(a + 1, v >> 8); }
    fetch() { const v = this.rb(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
    fetchw() { const v = this.rw(this.pc); this.pc = (this.pc + 2) & 0xFFFF; return v; }
    fetchd() { const d = this.fetch(); return d < 128 ? d : d - 256; }
    push(v) { this.sp = (this.sp - 2) & 0xFFFF; this.ww(this.sp, v); }
    pop() { const v = this.rw(this.sp); this.sp = (this.sp + 2) & 0xFFFF; return v; }

    get bc() { return (this.b << 8) | this.c; } set bc(v) { this.b = (v >> 8) & 0xFF; this.c = v & 0xFF; }
    get de() { return (this.d << 8) | this.e; } set de(v) { this.d = (v >> 8) & 0xFF; this.e = v & 0xFF; }
    get hl() { return (this.h << 8) | this.l; } set hl(v) { this.h = (v >> 8) & 0xFF; this.l = v & 0xFF; }
    get af() { return (this.a << 8) | this.f; } set af(v) { this.a = (v >> 8) & 0xFF; this.f = v & 0xFF; }

    // --- registres 8 bits par index (0..7 : B C D E H L (HL) A) ---
    getr(i) {
      switch (i) {
        case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e;
        case 4: return this.h; case 5: return this.l; case 6: return this.rb(this.hl); default: return this.a;
      }
    }
    setr(i, v) {
      v &= 0xFF;
      switch (i) {
        case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break;
        case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.wb(this.hl, v); break; default: this.a = v;
      }
    }

    // --- ALU ---
    add8(v, c) {
      const a = this.a, r = a + v + c;
      this.f = SZ[r & 0xFF] | ((a ^ v ^ r) & FH) | (((a ^ ~v) & (a ^ r) & 0x80) ? FP : 0) | (r > 0xFF ? FC : 0);
      this.a = r & 0xFF;
    }
    sub8(v, c) {
      const a = this.a, r = a - v - c;
      this.f = SZ[r & 0xFF] | ((a ^ v ^ r) & FH) | (((a ^ v) & (a ^ r) & 0x80) ? FP : 0) | (r < 0 ? FC : 0) | FN;
      this.a = r & 0xFF;
    }
    cp8(v) {
      const a = this.a, r = a - v;
      this.f = (SZ[r & 0xFF] & ~(FY | FX)) | (v & (FY | FX)) | ((a ^ v ^ r) & FH) |
        (((a ^ v) & (a ^ r) & 0x80) ? FP : 0) | (r < 0 ? FC : 0) | FN;
    }
    and8(v) { this.a &= v; this.f = SZP[this.a] | FH; }
    xor8(v) { this.a = (this.a ^ v) & 0xFF; this.f = SZP[this.a]; }
    or8(v) { this.a = (this.a | v) & 0xFF; this.f = SZP[this.a]; }
    alu(op, v) {
      switch (op) {
        case 0: this.add8(v, 0); break; case 1: this.add8(v, this.f & FC); break;
        case 2: this.sub8(v, 0); break; case 3: this.sub8(v, this.f & FC); break;
        case 4: this.and8(v); break; case 5: this.xor8(v); break; case 6: this.or8(v); break; default: this.cp8(v);
      }
    }
    inc8(v) {
      const r = (v + 1) & 0xFF;
      this.f = (this.f & FC) | SZ[r] | ((v & 0x0F) === 0x0F ? FH : 0) | (v === 0x7F ? FP : 0);
      return r;
    }
    dec8(v) {
      const r = (v - 1) & 0xFF;
      this.f = (this.f & FC) | SZ[r] | FN | ((v & 0x0F) === 0 ? FH : 0) | (v === 0x80 ? FP : 0);
      return r;
    }
    add16(a, b) {
      const r = a + b;
      this.f = (this.f & (FS | FZ | FP)) | (((a ^ b ^ r) >> 8) & FH) | ((r >> 8) & (FY | FX)) | (r > 0xFFFF ? FC : 0);
      return r & 0xFFFF;
    }
    adc16(v) {
      const hl = this.hl, c = this.f & FC, r = hl + v + c;
      this.f = ((r >> 8) & (FS | FY | FX)) | ((r & 0xFFFF) === 0 ? FZ : 0) | (((hl ^ v ^ r) >> 8) & FH) |
        (((hl ^ ~v) & (hl ^ r) & 0x8000) ? FP : 0) | (r > 0xFFFF ? FC : 0);
      this.hl = r & 0xFFFF;
    }
    sbc16(v) {
      const hl = this.hl, c = this.f & FC, r = hl - v - c;
      this.f = ((r >> 8) & (FS | FY | FX)) | ((r & 0xFFFF) === 0 ? FZ : 0) | (((hl ^ v ^ r) >> 8) & FH) |
        (((hl ^ v) & (hl ^ r) & 0x8000) ? FP : 0) | (r < 0 ? FC : 0) | FN;
      this.hl = r & 0xFFFF;
    }
    rot(op, v) {
      let r, c;
      switch (op) {
        case 0: c = v >> 7; r = ((v << 1) | c) & 0xFF; break;                 // RLC
        case 1: c = v & 1; r = (v >> 1) | (c << 7); break;                    // RRC
        case 2: c = v >> 7; r = ((v << 1) | (this.f & FC)) & 0xFF; break;     // RL
        case 3: c = v & 1; r = (v >> 1) | ((this.f & FC) << 7); break;        // RR
        case 4: c = v >> 7; r = (v << 1) & 0xFF; break;                       // SLA
        case 5: c = v & 1; r = (v >> 1) | (v & 0x80); break;                  // SRA
        case 6: c = v >> 7; r = ((v << 1) | 1) & 0xFF; break;                 // SLL
        default: c = v & 1; r = v >> 1;                                       // SRL
      }
      this.f = SZP[r] | c;
      return r;
    }
    bit(n, v, xy) {
      const r = v & (1 << n);
      this.f = (this.f & FC) | FH | (r ? (r & FS) : (FZ | FP)) | (xy & (FY | FX));
    }

    cond(c) {
      switch (c) {
        case 0: return !(this.f & FZ); case 1: return !!(this.f & FZ);
        case 2: return !(this.f & FC); case 3: return !!(this.f & FC);
        case 4: return !(this.f & FP); case 5: return !!(this.f & FP);
        case 6: return !(this.f & FS); default: return !!(this.f & FS);
      }
    }

    getrp(p) { switch (p) { case 0: return this.bc; case 1: return this.de; case 2: return this.hl; default: return this.sp; } }
    setrp(p, v) { switch (p) { case 0: this.bc = v; break; case 1: this.de = v; break; case 2: this.hl = v; break; default: this.sp = v & 0xFFFF; } }

    interrupt(data) {
      if (!this.iff1) return 0;
      this.halted = false;
      this.iff1 = this.iff2 = 0;
      this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
      if (this.im === 2) {
        this.push(this.pc);
        this.pc = this.rw((this.i << 8) | (data & 0xFF));
        return 19;
      }
      this.push(this.pc);
      this.pc = 0x38;
      return 13;
    }

    // Exécute une instruction, renvoie le nombre de T-states.
    step() {
      if (this.halted) return 4;
      this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
      const op = this.fetch();
      switch (op) {
        case 0xCB: return this.execCB();
        case 0xED: return this.execED();
        case 0xDD: return this.execXY('ix');
        case 0xFD: return this.execXY('iy');
        default: return this.execMain(op);
      }
    }

    execMain(op) {
      let t = CYC[op];
      const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
      if (x === 1) {
        if (op === 0x76) { this.halted = true; this.pc = (this.pc - 1) & 0xFFFF; return 4; }
        this.setr(y, this.getr(z));
        return t;
      }
      if (x === 2) { this.alu(y, this.getr(z)); return t; }
      if (x === 0) {
        switch (z) {
          case 0:
            if (y === 0) return t;
            if (y === 1) { let tt = this.a; this.a = this.a_; this.a_ = tt; tt = this.f; this.f = this.f_; this.f_ = tt; return t; }
            {
              const d = this.fetchd();
              if (y === 2) { this.b = (this.b - 1) & 0xFF; if (this.b) { this.pc = (this.pc + d) & 0xFFFF; return 13; } return 8; }
              if (y === 3 || this.cond(y - 4)) { this.pc = (this.pc + d) & 0xFFFF; return 12; }
              return 7;
            }
          case 1:
            if (q === 0) this.setrp(p, this.fetchw());
            else this.hl = this.add16(this.hl, this.getrp(p));
            return t;
          case 2:
            if (q === 0) {
              if (p === 0) this.wb(this.bc, this.a);
              else if (p === 1) this.wb(this.de, this.a);
              else if (p === 2) this.ww(this.fetchw(), this.hl);
              else this.wb(this.fetchw(), this.a);
            } else {
              if (p === 0) this.a = this.rb(this.bc);
              else if (p === 1) this.a = this.rb(this.de);
              else if (p === 2) this.hl = this.rw(this.fetchw());
              else this.a = this.rb(this.fetchw());
            }
            return t;
          case 3:
            this.setrp(p, (this.getrp(p) + (q ? -1 : 1)) & 0xFFFF);
            return t;
          case 4: this.setr(y, this.inc8(this.getr(y))); return t;
          case 5: this.setr(y, this.dec8(this.getr(y))); return t;
          case 6: this.setr(y, this.fetch()); return t;
          default:
            switch (y) {
              case 0: { const c = this.a >> 7; this.a = ((this.a << 1) | c) & 0xFF; this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 1: { const c = this.a & 1; this.a = (this.a >> 1) | (c << 7); this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 2: { const c = this.a >> 7; this.a = ((this.a << 1) | (this.f & FC)) & 0xFF; this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 3: { const c = this.a & 1; this.a = (this.a >> 1) | ((this.f & FC) << 7); this.f = (this.f & (FS | FZ | FP)) | (this.a & (FY | FX)) | c; break; }
              case 4: this.daa(); break;
              case 5: this.a ^= 0xFF; this.f = (this.f & (FS | FZ | FP | FC)) | FH | FN | (this.a & (FY | FX)); break;
              case 6: this.f = (this.f & (FS | FZ | FP)) | FC | (this.a & (FY | FX)); break;
              default: this.f = ((this.f & (FS | FZ | FP | FC)) | ((this.f & FC) ? FH : 0) | (this.a & (FY | FX))) ^ FC;
            }
            return t;
        }
      }
      // x === 3
      switch (z) {
        case 0: if (this.cond(y)) { this.pc = this.pop(); return 11; } return 5;
        case 1:
          if (q === 0) {
            const v = this.pop();
            if (p === 0) this.bc = v; else if (p === 1) this.de = v; else if (p === 2) this.hl = v; else this.af = v;
            return t;
          }
          switch (p) {
            case 0: this.pc = this.pop(); return 10;
            case 1: {
              let tt;
              tt = this.b; this.b = this.b_; this.b_ = tt; tt = this.c; this.c = this.c_; this.c_ = tt;
              tt = this.d; this.d = this.d_; this.d_ = tt; tt = this.e; this.e = this.e_; this.e_ = tt;
              tt = this.h; this.h = this.h_; this.h_ = tt; tt = this.l; this.l = this.l_; this.l_ = tt;
              return 4;
            }
            case 2: this.pc = this.hl; return 4;
            default: this.sp = this.hl; return 6;
          }
        case 2: { const a = this.fetchw(); if (this.cond(y)) this.pc = a; return 10; }
        case 3:
          switch (y) {
            case 0: this.pc = this.fetchw(); return 10;
            case 2: { const n = this.fetch(); this.bus.output((this.a << 8) | n, this.a); return 11; }
            case 3: { const n = this.fetch(); this.a = this.bus.input((this.a << 8) | n); return 11; }
            case 4: { const v = this.rw(this.sp); this.ww(this.sp, this.hl); this.hl = v; return 19; }
            case 5: { const v = this.de; this.de = this.hl; this.hl = v; return 4; }
            case 6: this.iff1 = this.iff2 = 0; return 4;
            default: this.iff1 = this.iff2 = 1; return 4;
          }
        case 4: { const a = this.fetchw(); if (this.cond(y)) { this.push(this.pc); this.pc = a; return 17; } return 10; }
        case 5:
          if (q === 0) {
            const v = p === 0 ? this.bc : p === 1 ? this.de : p === 2 ? this.hl : this.af;
            this.push(v); return 11;
          }
          { const a = this.fetchw(); this.push(this.pc); this.pc = a; return 17; }
        case 6: this.alu(y, this.fetch()); return 7;
        default: this.push(this.pc); this.pc = y * 8; return 11;
      }
    }

    daa() {
      let a = this.a, c = this.f & FC, h = this.f & FH, n = this.f & FN, diff = 0;
      if (h || (a & 0x0F) > 9) diff |= 0x06;
      if (c || a > 0x99) { diff |= 0x60; c = FC; }
      const na = n ? (a - diff) & 0xFF : (a + diff) & 0xFF;
      const nh = n ? (h && (a & 0x0F) < 6 ? FH : 0) : ((a & 0x0F) > 9 ? FH : 0);
      this.a = na;
      this.f = SZP[na] | c | nh | n;
    }

    execCB() {
      const op = this.fetch();
      this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
      const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
      const v = this.getr(z);
      if (x === 0) { this.setr(z, this.rot(y, v)); return z === 6 ? 15 : 8; }
      if (x === 1) { this.bit(y, v, z === 6 ? (this.h) : v); return z === 6 ? 12 : 8; }
      if (x === 2) { this.setr(z, v & ~(1 << y)); return z === 6 ? 15 : 8; }
      this.setr(z, v | (1 << y)); return z === 6 ? 15 : 8;
    }

    execED() {
      const op = this.fetch();
      this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
      const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
      if (x === 1) {
        switch (z) {
          case 0: { const v = this.bus.input(this.bc); if (y !== 6) this.setr(y, v); this.f = (this.f & FC) | SZP[v]; return 12; }
          case 1: this.bus.output(this.bc, y === 6 ? 0 : this.getr(y)); return 12;
          case 2: if (q === 0) this.sbc16(this.getrp(p)); else this.adc16(this.getrp(p)); return 15;
          case 3: { const a = this.fetchw(); if (q === 0) this.ww(a, this.getrp(p)); else this.setrp(p, this.rw(a)); return 20; }
          case 4: { const v = this.a; this.a = 0; this.sub8(v, 0); return 8; }
          case 5: this.pc = this.pop(); this.iff1 = this.iff2; return 14;
          case 6: this.im = [0, 0, 1, 2, 0, 0, 1, 2][y]; return 8;
          default:
            switch (y) {
              case 0: this.i = this.a; return 9;
              case 1: this.r = this.a; return 9;
              case 2: this.a = this.i; this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FP : 0); return 9;
              case 3: this.a = this.r; this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FP : 0); return 9;
              case 4: { // RRD
                const m = this.rb(this.hl);
                this.wb(this.hl, ((this.a << 4) | (m >> 4)) & 0xFF);
                this.a = (this.a & 0xF0) | (m & 0x0F);
                this.f = (this.f & FC) | SZP[this.a]; return 18;
              }
              case 5: { // RLD
                const m = this.rb(this.hl);
                this.wb(this.hl, ((m << 4) | (this.a & 0x0F)) & 0xFF);
                this.a = (this.a & 0xF0) | (m >> 4);
                this.f = (this.f & FC) | SZP[this.a]; return 18;
              }
              default: return 8;
            }
        }
      }
      if (x === 2 && y >= 4 && z <= 3) return this.block(y, z);
      return 8;
    }

    block(y, z) {
      const inc = (y & 1) ? -1 : 1, rep = y >= 6;
      if (z === 0) { // LDI/LDD/LDIR/LDDR
        const v = this.rb(this.hl);
        this.wb(this.de, v);
        this.hl = (this.hl + inc) & 0xFFFF; this.de = (this.de + inc) & 0xFFFF; this.bc = (this.bc - 1) & 0xFFFF;
        const n = (v + this.a) & 0xFF;
        this.f = (this.f & (FS | FZ | FC)) | (this.bc ? FP : 0) | (n & FX) | ((n << 4) & FY);
        if (rep && this.bc) { this.pc = (this.pc - 2) & 0xFFFF; return 21; }
        return 16;
      }
      if (z === 1) { // CPI/CPD/CPIR/CPDR
        const v = this.rb(this.hl), r = (this.a - v) & 0xFF;
        const hf = (this.a ^ v ^ r) & FH;
        this.hl = (this.hl + inc) & 0xFFFF; this.bc = (this.bc - 1) & 0xFFFF;
        const n = (r - (hf ? 1 : 0)) & 0xFF;
        this.f = (this.f & FC) | (SZ[r] & ~(FY | FX)) | hf | FN | (this.bc ? FP : 0) | (n & FX) | ((n << 4) & FY);
        if (rep && this.bc && r !== 0) { this.pc = (this.pc - 2) & 0xFFFF; return 21; }
        return 16;
      }
      if (z === 2) { // INI/IND/INIR/INDR
        const v = this.bus.input(this.bc);
        this.wb(this.hl, v);
        this.hl = (this.hl + inc) & 0xFFFF; this.b = (this.b - 1) & 0xFF;
        this.f = SZ[this.b] | FN;
        if (rep && this.b) { this.pc = (this.pc - 2) & 0xFFFF; return 21; }
        return 16;
      }
      // OUTI/OUTD/OTIR/OTDR
      const v = this.rb(this.hl);
      this.b = (this.b - 1) & 0xFF;
      this.bus.output(this.bc, v);
      this.hl = (this.hl + inc) & 0xFFFF;
      this.f = SZ[this.b] | FN;
      if (rep && this.b) { this.pc = (this.pc - 2) & 0xFFFF; return 21; }
      return 16;
    }

    execXY(reg) {
      const op = this.fetch();
      this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
      let xy = this[reg];
      const hi = () => xy >> 8, lo = () => xy & 0xFF;
      const setHi = (v) => { xy = (xy & 0xFF) | ((v & 0xFF) << 8); }, setLo = (v) => { xy = (xy & 0xFF00) | (v & 0xFF); };
      const ea = () => (xy + this.fetchd()) & 0xFFFF;
      const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
      let t;
      // registres avec substitution H/L -> IXH/IXL
      const getx = (i) => i === 4 ? hi() : i === 5 ? lo() : this.getr(i);
      const setx = (i, v) => { if (i === 4) setHi(v); else if (i === 5) setLo(v); else this.setr(i, v); };

      if (op === 0xCB) {
        const a = ea();
        const op2 = this.fetch();
        const x2 = op2 >> 6, y2 = (op2 >> 3) & 7, z2 = op2 & 7;
        const v = this.rb(a);
        if (x2 === 1) { this.bit(y2, v, a >> 8); return 20; }
        let r;
        if (x2 === 0) r = this.rot(y2, v);
        else if (x2 === 2) r = v & ~(1 << y2);
        else r = v | (1 << y2);
        this.wb(a, r);
        if (z2 !== 6) this.setr(z2, r);
        return 23;
      }

      switch (op) {
        case 0x21: xy = this.fetchw(); t = 14; break;
        case 0x22: this.ww(this.fetchw(), xy); t = 20; break;
        case 0x2A: xy = this.rw(this.fetchw()); t = 20; break;
        case 0x23: xy = (xy + 1) & 0xFFFF; t = 10; break;
        case 0x2B: xy = (xy - 1) & 0xFFFF; t = 10; break;
        case 0x09: case 0x19: case 0x29: case 0x39: {
          const v = p === 0 ? this.bc : p === 1 ? this.de : p === 2 ? xy : this.sp;
          xy = this.add16(xy, v); t = 15; break;
        }
        case 0x24: setHi(this.inc8(hi())); t = 8; break;
        case 0x25: setHi(this.dec8(hi())); t = 8; break;
        case 0x2C: setLo(this.inc8(lo())); t = 8; break;
        case 0x2D: setLo(this.dec8(lo())); t = 8; break;
        case 0x26: setHi(this.fetch()); t = 11; break;
        case 0x2E: setLo(this.fetch()); t = 11; break;
        case 0x34: { const a = ea(); this.wb(a, this.inc8(this.rb(a))); t = 23; break; }
        case 0x35: { const a = ea(); this.wb(a, this.dec8(this.rb(a))); t = 23; break; }
        case 0x36: { const a = ea(); this.wb(a, this.fetch()); t = 19; break; }
        case 0xE1: xy = this.pop(); t = 14; break;
        case 0xE5: this.push(xy); t = 15; break;
        case 0xE3: { const v = this.rw(this.sp); this.ww(this.sp, xy); xy = v; t = 23; break; }
        case 0xE9: this.pc = xy; t = 8; break;
        case 0xF9: this.sp = xy; t = 10; break;
        default:
          if (x === 1 && op !== 0x76) {
            if (y === 6) { const a = ea(); this.wb(a, this.getr(z)); t = 19; }
            else if (z === 6) { const a = ea(); this.setr(y, this.rb(a)); t = 19; }
            else { setx(y, getx(z)); t = 8; }
            break;
          }
          if (x === 2) {
            if (z === 6) { const a = ea(); this.alu(y, this.rb(a)); t = 19; }
            else { this.alu(y, getx(z)); t = 8; }
            break;
          }
          // préfixe sans effet : exécuter comme instruction normale
          this[reg] = xy;
          if (op === 0xED) return 4 + this.execED();
          if (op === 0xDD || op === 0xFD) { this.pc = (this.pc - 1) & 0xFFFF; return 4; }
          return 4 + this.execMain(op);
      }
      this[reg] = xy;
      return t;
    }
  }

  root.Z80 = Z80;
  if (typeof module !== 'undefined') module.exports = Z80;
})(typeof window !== 'undefined' ? window : globalThis);
