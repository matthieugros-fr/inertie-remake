// Mode « Amélioré » : même jeu, rendu modernisé sur la carte graphique (WebGL2).
//  1. l'image CPC (160 x 200 pixels mode 0) est agrandie deux fois par l'algorithme EPX,
//     qui lisse les diagonales du pixel art sans le flouter (640 x 800) ;
//  2. un halo (bloom) fait rayonner les couleurs vives : lasers, réacteurs, explosions ;
//  3. un éclairage doux suit le vaisseau dans la caverne.
(function (root) {
  'use strict';

  const VS = `#version 300 es
  in vec2 p; out vec2 uv;
  void main() { uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

  // EPX / Scale2x
  const FS_EPX = `#version 300 es
  precision highp float;
  uniform sampler2D src; uniform vec2 srcSize;
  in vec2 uv; out vec4 o;
  bool eq(vec3 a, vec3 b) { return all(lessThan(abs(a - b), vec3(0.01))); }
  void main() {
    vec2 sp = uv * srcSize;
    ivec2 ip = ivec2(floor(sp));
    vec2 f = fract(sp);
    ivec2 mx = ivec2(srcSize) - 1;
    vec3 P = texelFetch(src, ip, 0).rgb;
    vec3 A = texelFetch(src, clamp(ip + ivec2(0, -1), ivec2(0), mx), 0).rgb;
    vec3 B = texelFetch(src, clamp(ip + ivec2(1, 0), ivec2(0), mx), 0).rgb;
    vec3 C = texelFetch(src, clamp(ip + ivec2(-1, 0), ivec2(0), mx), 0).rgb;
    vec3 D = texelFetch(src, clamp(ip + ivec2(0, 1), ivec2(0), mx), 0).rgb;
    vec3 r = P;
    if (f.x < 0.5 && f.y < 0.5) { if (eq(C, A) && !eq(C, D) && !eq(A, B)) r = A; }
    else if (f.x >= 0.5 && f.y < 0.5) { if (eq(A, B) && !eq(A, C) && !eq(B, D)) r = B; }
    else if (f.x < 0.5 && f.y >= 0.5) { if (eq(D, C) && !eq(D, B) && !eq(C, A)) r = C; }
    else { if (eq(B, D) && !eq(B, A) && !eq(D, C)) r = D; }
    o = vec4(r, 1.0);
  }`;

  // Extraction des zones lumineuses
  const FS_BRIGHT = `#version 300 es
  precision highp float;
  uniform sampler2D src; in vec2 uv; out vec4 o;
  void main() {
    vec3 c = texture(src, uv).rgb;
    float l = max(c.r, max(c.g, c.b));
    float sat = l - min(c.r, min(c.g, c.b));
    float k = smoothstep(0.55, 1.0, l) * (0.35 + 0.65 * sat);
    o = vec4(c * k, 1.0);
  }`;

  // Flou gaussien séparable
  const FS_BLUR = `#version 300 es
  precision highp float;
  uniform sampler2D src; uniform vec2 dir; in vec2 uv; out vec4 o;
  void main() {
    vec3 s = texture(src, uv).rgb * 0.227;
    s += texture(src, uv + dir * 1.385).rgb * 0.316;
    s += texture(src, uv - dir * 1.385).rgb * 0.316;
    s += texture(src, uv + dir * 3.231).rgb * 0.070;
    s += texture(src, uv - dir * 3.231).rgb * 0.070;
    o = vec4(s, 1.0);
  }`;

  // Composition finale
  const FS_FINAL = `#version 300 es
  precision highp float;
  uniform sampler2D img; uniform sampler2D bloom;
  uniform vec2 ship; uniform float light; uniform float bloomK; uniform float playW;
  in vec2 uv; out vec4 o;
  void main() {
    vec3 c = texture(img, uv).rgb;
    vec3 b = texture(bloom, uv).rgb;
    if (uv.x < playW && light > 0.0) {
      // éclairage : la caverne s'assombrit loin du vaisseau
      vec2 d = (uv - ship) * vec2(1.6, 1.0);
      float k = 1.0 - smoothstep(0.08, 0.75, length(d));
      c *= mix(1.0, 0.55 + 0.6 * k, light);
    }
    c += b * bloomK;
    // légère courbe de contraste
    c = c / (1.0 + 0.12 * c);
    o = vec4(c * 1.08, 1.0);
  }`;

  class HDRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
      this.gl = gl;
      if (!gl) return;
      this.light = 1;
      this.bloomK = 0.9;
      canvas.width = 1280; canvas.height = 800;
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.progs = {
        epx: this.prog(FS_EPX), bright: this.prog(FS_BRIGHT), blur: this.prog(FS_BLUR), final: this.prog(FS_FINAL),
      };
      this.src = this.tex(160, 200, gl.NEAREST);
      this.t1 = this.target(320, 400, gl.NEAREST);
      this.t2 = this.target(640, 800, gl.LINEAR);
      this.b1 = this.target(320, 200, gl.LINEAR);
      this.b2 = this.target(320, 200, gl.LINEAR);
      this.pix = new Uint8Array(160 * 200 * 4);
    }

    get ok() { return !!this.gl; }

    prog(fs) {
      const gl = this.gl;
      const mk = (type, srcText) => {
        const s = gl.createShader(type); gl.shaderSource(s, srcText); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }

    tex(w, h, filter) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    target(w, h, filter) {
      const gl = this.gl;
      const tex = this.tex(w, h, filter);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w, h };
    }

    pass(prog, target, textures, uniforms) {
      const gl = this.gl;
      gl.useProgram(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
      let unit = 0;
      for (const [name, t] of Object.entries(textures)) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(gl.getUniformLocation(prog, name), unit);
        unit++;
      }
      for (const [name, v] of Object.entries(uniforms || {})) {
        const loc = gl.getUniformLocation(prog, name);
        if (Array.isArray(v)) gl.uniform2f(loc, v[0], v[1]); else gl.uniform1f(loc, v);
      }
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Image CPC en pixels mode 0 (un texel par pixel)
    capture(m) {
      const pal = [];
      for (let p = 0; p < 16; p++) pal.push(m.penRGB(p));
      const d = this.pix, mem = m.mem;
      let o = 0;
      for (let y = 0; y < 200; y++) {
        const base = 0xC000 + (y & 7) * 0x800 + (y >> 3) * 80;
        for (let xb = 0; xb < 80; xb++) {
          const b = mem[base + xb];
          const p0 = ((b >> 7) & 1) | ((b >> 2) & 2) | ((b >> 3) & 4) | ((b << 2) & 8);
          const p1 = ((b >> 6) & 1) | ((b >> 1) & 2) | ((b >> 2) & 4) | ((b << 3) & 8);
          let c = pal[p0]; d[o++] = c[0]; d[o++] = c[1]; d[o++] = c[2]; d[o++] = 255;
          c = pal[p1]; d[o++] = c[0]; d[o++] = c[1]; d[o++] = c[2]; d[o++] = 255;
        }
      }
    }

    // Position du vaisseau (adresse écran du sprite en &040B), en coordonnées 0..1
    shipPos(m) {
      const a = (m.mem[0x040B] | (m.mem[0x040C] << 8)) - 0xC000;
      if (a < 0 || a >= 0x4000) return [0.3, 0.5];
      const line = Math.floor(a / 0x800) + 8 * Math.floor((a % 0x800) / 80);
      const col = (a % 0x800) % 80;
      return [(col * 2 + 5) / 160, (line + 10) / 200];
    }

    render(m) {
      if (!this.gl) return;
      const gl = this.gl;
      this.capture(m);
      gl.bindTexture(gl.TEXTURE_2D, this.src);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 160, 200, gl.RGBA, gl.UNSIGNED_BYTE, this.pix);
      const P = this.progs;
      this.pass(P.epx, this.t1, { src: this.src }, { srcSize: [160, 200] });
      this.pass(P.epx, this.t2, { src: this.t1.tex }, { srcSize: [320, 400] });
      this.pass(P.bright, this.b1, { src: this.t1.tex });
      this.pass(P.blur, this.b2, { src: this.b1.tex }, { dir: [1 / 320, 0] });
      this.pass(P.blur, this.b1, { src: this.b2.tex }, { dir: [0, 1 / 200] });
      this.pass(P.blur, this.b2, { src: this.b1.tex }, { dir: [2 / 320, 0] });
      this.pass(P.blur, this.b1, { src: this.b2.tex }, { dir: [0, 2 / 200] });
      const inGame = m.mem[0x040C] >= 0xC0 && this.playing(m);
      this.pass(P.final, null, { img: this.t2.tex, bloom: this.b1.tex }, {
        ship: this.shipPos(m), light: inGame ? this.light : 0, bloomK: this.bloomK, playW: 100 / 160,
      });
    }

    // Vrai pendant une partie : l'adresse du vaisseau pointe dans la zone de jeu (50 premiers octets)
    playing(m) {
      const a = (m.mem[0x040B] | (m.mem[0x040C] << 8)) - 0xC000;
      return a >= 0 && (a % 0x800) % 80 < 50 && m.mem[0x041D] >= 0x13 && m.mem[0x041D] <= 0xC7;
    }
  }

  root.HDRenderer = HDRenderer;
})(window);
