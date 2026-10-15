// Passe d'effets du mode Néo-Tokyo (WebGL2) : halo lumineux, aberration chromatique,
// lignes de balayage, grain, vignettage, parasites vidéo et éclair blanc.
(function (root) {
  'use strict';

  const VS = `#version 300 es
  in vec2 p; out vec2 uv;
  void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

  const FS_BRIGHT = `#version 300 es
  precision highp float;
  uniform sampler2D src; in vec2 uv; out vec4 o;
  void main() {
    vec3 c = texture(src, uv).rgb;
    float l = max(c.r, max(c.g, c.b));
    o = vec4(c * smoothstep(0.45, 1.0, l), 1.0);
  }`;

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

  const FS_FINAL = `#version 300 es
  precision highp float;
  uniform sampler2D img; uniform sampler2D bloom;
  uniform float time, aberr, glitch, flash, bloomK, soft;
  in vec2 uv; out vec4 o;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 u = uv;
    // parasites : tranches horizontales décalées
    if (glitch > 0.02) {
      float band = floor(u.y * 40.0);
      float r = h(vec2(band, floor(time * 30.0)));
      if (r < glitch * 0.6) u.x += (h(vec2(band, 3.0)) - 0.5) * 0.08 * glitch;
    }
    vec2 d = (u - 0.5);
    float a = 0.0015 + 0.012 * aberr;
    vec3 c;
    c.r = texture(img, u + d * a * 2.0).r;
    c.g = texture(img, u).g;
    c.b = texture(img, u - d * a * 2.0).b;
    c += texture(bloom, u).rgb * bloomK;
    // lignes de balayage et grain
    float k = 1.0 - soft;
    c *= 1.0 - k * (0.07 - 0.07 * sin(u.y * 800.0 * 3.14159));
    c += (h(u * vec2(1280.0, 800.0) + time) - 0.5) * 0.045 * k;
    // vignettage
    c *= 1.0 - (0.45 * k + 0.12) * dot(d * vec2(1.2, 1.0), d * vec2(1.2, 1.0)) * 1.6;
    // étalonnage : noirs teintés rouge sombre, hautes lumières crues
    c = mix(c, c * vec3(1.06, 0.97, 0.97) + vec3(0.012, 0.0, 0.004), 0.8 * k);
    c += vec3(flash);
    o = vec4(clamp(c, 0.0, 1.0), 1.0);
  }`;

  class NeoFX {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = 1280; canvas.height = 800;
      const gl = canvas.getContext('webgl2', { antialias: false });
      this.gl = gl;
      if (!gl) return;
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.p = { bright: this.prog(FS_BRIGHT), blur: this.prog(FS_BLUR), final: this.prog(FS_FINAL) };
      this.src = this.tex(1280, 800);
      this.b1 = this.target(320, 200); this.b2 = this.target(320, 200);
    }

    get ok() { return !!this.gl; }

    prog(fs) {
      const gl = this.gl;
      const mk = (type, s) => { const sh = gl.createShader(type); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      return p;
    }

    tex(w, h) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      return t;
    }

    target(w, h) {
      const gl = this.gl, tex = this.tex(w, h), fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w, h };
    }

    pass(prog, target, texs, uni) {
      const gl = this.gl;
      gl.useProgram(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : 1280, target ? target.h : 800);
      let u = 0;
      for (const [n, t] of Object.entries(texs)) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(prog, n), u); u++; }
      for (const [n, v] of Object.entries(uni || {})) { const l = gl.getUniformLocation(prog, n); if (Array.isArray(v)) gl.uniform2f(l, v[0], v[1]); else gl.uniform1f(l, v); }
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    render(scene, fx, time) {
      const gl = this.gl;
      if (!gl) return;
      gl.bindTexture(gl.TEXTURE_2D, this.src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, scene);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.pass(this.p.bright, this.b1, { src: this.src });
      this.pass(this.p.blur, this.b2, { src: this.b1.tex }, { dir: [1 / 320, 0] });
      this.pass(this.p.blur, this.b1, { src: this.b2.tex }, { dir: [0, 1 / 200] });
      this.pass(this.p.blur, this.b2, { src: this.b1.tex }, { dir: [2.5 / 320, 0] });
      this.pass(this.p.blur, this.b1, { src: this.b2.tex }, { dir: [0, 2.5 / 200] });
      this.pass(this.p.final, null, { img: this.src, bloom: this.b1.tex }, {
        time, aberr: fx.aberr, glitch: fx.glitch, flash: fx.flash * 0.5, bloomK: fx.bloomK ?? 1.1, soft: fx.soft || 0,
      });
    }
  }

  root.NeoFX = NeoFX;
})(window);
