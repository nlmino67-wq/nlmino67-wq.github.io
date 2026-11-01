/* Calm topographic contour background. One fullscreen triangle, one fragment shader, no dependencies.
   Contour look after ReactBits Topography (MIT, reactbits.dev/backgrounds/topography); independent implementation.
   API: window.NICO_BG = { init(opts), start(), stop(), destroy(), mode, measure(el) } plus setMode, pointer, resize, frames.
   Fails open: init() returns false when WebGL is missing, and the page then stays on its plain #09090B ground. */
(function () {
  "use strict";

  /* ---- settings ---- */
  var CFG = {
    color: [0.50, 0.56, 0.85],   // rgb 128,143,217
    intensity: 0.11,             // the cap: brightest line pixel over #09090B is about luma 24 of 255
    lines: 22, lineWidth: 1.1, elevation: 0.55, scale: 0.9, tilt: 32,
    speed: 0.06,                 // world units per second, forward glide
    morph: 0.05, fog: 0.45, gain: 1.4, cursorRadius: 0.35, fps: 30, dprCap: 1.25,
  };
  var CAM = 1.7, FOV_K = 0.466, BG = [9, 9, 11];
  var FRAME_MS = 1000 / CFG.fps - 4;                 // timestamp throttle with a little jitter room

  var f = function (v) { return Number(v).toFixed(4); };

  function shaders(gl2) {
    var vs = (gl2 ? "#version 300 es\nin vec2 a;" : "attribute vec2 a;") + "void main(){gl_Position=vec4(a,0.,1.);}";
    var head = gl2
      ? "#version 300 es\nprecision highp float;out vec4 oc;\n#define FRAG oc\n"
      : "#extension GL_OES_standard_derivatives : enable\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n#define FRAG gl_FragColor\n";
    var fs = head +
      "uniform vec2 uRes,uMouse;uniform float uTime,uDrift,uInt,uLight,uRad2;\n" +
      "const float CAM=" + f(CAM) + ",K=" + f(FOV_K) + ";\n" +
      "float hs(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}\n" +
      "float vn(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);\n" +
      " return mix(mix(hs(i),hs(i+vec2(1,0)),u.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),u.x),u.y);}\n" +
      "float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);\n" +
      " for(int i=0;i<4;i++){v+=a*vn(p);p=r*p*2.03+17.;a*=.5;}return v/.9375;}\n" +
      "float H(vec2 w){vec2 p=w*" + f(CFG.scale) + "+vec2(0.,uDrift);\n" +
      " return mix(fbm(p),fbm(p+37.1),.5+.5*sin(uTime*" + f(CFG.morph) + "));}\n" +
      "vec3 ray(vec2 n){float t=radians(" + f(CFG.tilt) + ");\n" +
      " vec3 fw=vec3(0.,-sin(t),cos(t)),up=vec3(0.,cos(t),sin(t));\n" +
      " vec3 d=normalize(fw+vec3(n.x*uRes.x/uRes.y*K,0.,0.)+up*n.y*K);d.y=min(d.y,-.02);return d;}\n" +
      "void main(){\n" +
      " vec2 n=gl_FragCoord.xy/uRes*2.-1.;vec3 d=ray(n);\n" +
      " float t=-CAM/d.y;vec2 w0=d.xz*t,w=w0;float h=H(w),dist=t;\n" +
      " for(int i=0;i<2;i++){t=(h*" + f(CFG.elevation) + "-CAM)/d.y;w=d.xz*t;h=H(w);dist=t;}\n" +
      " float c=h*" + f(CFG.lines) + ",fw=fwidth(c);\n" +
      " float fl=abs(fract(c)-.5),wd=clamp(fw*" + f(CFG.lineWidth) + ",.0001,.5);\n" +
      " float line=1.-smoothstep(0.,wd,fl);\n" +
      " line*=1.-smoothstep(.4,.9,fw);\n" +
      " line*=mix(.7,1.,step(mod(floor(c),5.),.5));\n" +
      " line*=1./(1.+max(dist-2.,0.)*" + f(CFG.fog) + ");\n" +
      " line*=1.-smoothstep(.6,1.,n.y);\n" +
      " vec3 dm=ray(uMouse);vec2 mw=dm.xz*(-CAM/dm.y);vec2 dd=w0-mw;\n" +
      " float L=uLight*exp(-dot(dd,dd)/uRad2);\n" +
      " line*=mix(.65,1.,L);\n" +
      " float a=clamp(line*" + f(CFG.gain) + ",0.,1.)*uInt;\n" +
      " FRAG=vec4(vec3(" + CFG.color.map(f).join(",") + ")*a,a);}\n";
    return { vs: vs, fs: fs };
  }

  /* ---- state ---- */
  var gl, gl2, canvas, prog, buf, U, lostFlag;
  var st = { mode: "none", running: false, raf: 0, last: 0, time: 0, drift: 0, frames: 0,
    mx: 0, my: 0, tx: 0, ty: 0, light: 0, lightT: 0, intensity: CFG.intensity };

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader");
    return s;
  }

  function build() {
    var src = shaders(gl2), p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, src.vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src.fs));
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link");
    prog = p;
    gl.useProgram(p);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    U = {};
    ["uRes", "uMouse", "uTime", "uDrift", "uInt", "uLight", "uRad2"].forEach(function (k) { U[k] = gl.getUniformLocation(p, k); });
    gl.clearColor(0, 0, 0, 0);
  }

  function draw() {
    if (!gl || lostFlag) return;
    var w = canvas.width, h = canvas.height;
    var rad = CFG.cursorRadius * 2 * FOV_K * 3.2 * (w / h);                      // world units, about 35% of viewport width
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform2f(U.uMouse, st.mx, st.my);
    gl.uniform1f(U.uTime, st.time);
    gl.uniform1f(U.uDrift, st.drift);
    gl.uniform1f(U.uInt, st.intensity);
    gl.uniform1f(U.uLight, st.light);
    gl.uniform1f(U.uRad2, rad * rad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(t) {
    if (!st.running) return;
    st.raf = requestAnimationFrame(frame);
    if (!st.last) st.last = t;
    var ms = t - st.last;
    if (ms < FRAME_MS && st.frames) return;
    st.last = t;
    var dt = Math.min(ms / 1000, 0.1), k = 1 - Math.exp(-dt * 6);
    st.time += dt;
    st.drift += CFG.speed * CFG.scale * dt;
    st.mx += (st.tx - st.mx) * k;
    st.my += (st.ty - st.my) * k;
    st.light += (st.lightT - st.light) * k;
    draw();
    st.frames += 1;
  }

  function size() {
    if (!canvas) return;
    var r = Math.min(window.devicePixelRatio || 1, CFG.dprCap);
    var w = Math.max(1, Math.round(canvas.clientWidth * r)), h = Math.max(1, Math.round(canvas.clientHeight * r));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function stop() {
    st.running = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
  }

  function start() {
    if (!gl || lostFlag) return;
    if (st.mode !== "live") { draw(); return; }                                   // static: one frame, no loop
    if (st.running) return;
    st.running = true;
    st.last = 0;                                                                  // fresh timestamp, no catch-up jump
    st.raf = requestAnimationFrame(frame);
  }

  function setMode(m) {
    if (!gl) return;
    st.mode = m === "live" ? "live" : "static";
    if (st.mode === "static") { stop(); st.lightT = 0; st.light = 0; draw(); }
  }

  function destroy() {
    stop();
    try {
      if (gl) {
        if (prog) gl.deleteProgram(prog);
        if (buf) gl.deleteBuffer(buf);
        var x = gl.getExtension("WEBGL_lose_context");
        if (x) x.loseContext();
      }
    } catch (e) { /* nothing to free */ }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    gl = canvas = prog = buf = null;
    st.mode = "none";
  }

  function context() {
    var a = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true, powerPreference: "low-power" };
    var c = canvas.getContext("webgl2", a);
    if (c) { gl2 = true; return c; }
    gl2 = false;
    c = canvas.getContext("webgl", a);
    if (c && !c.getExtension("OES_standard_derivatives")) return null;
    return c;
  }

  function init(opts) {
    opts = opts || {};
    if (gl) return true;
    try {
      var host = opts.container || document.getElementById("bg") || document.body;
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText = "display:block;width:100%;height:100%";
      host.appendChild(canvas);
      gl = context();
      if (!gl) throw new Error("no webgl");
      if (typeof opts.intensity === "number") st.intensity = opts.intensity;
      lostFlag = false;
      build();
      canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lostFlag = true; stop(); });
      canvas.addEventListener("webglcontextrestored", function () {
        try { lostFlag = false; build(); size(); if (st.mode === "live") start(); else draw(); } catch (err) { lostFlag = true; }
      });
      st.mode = opts.mode === "live" ? "live" : "static";
      size();
      draw();
      return true;
    } catch (err) {
      destroy();
      return false;
    }
  }

  /* Cursor light: ndc position of the pointer; only has an effect in live mode. */
  function pointer(x, y) {
    if (st.mode !== "live") return;
    st.tx = (x / window.innerWidth) * 2 - 1;
    st.ty = 1 - (y / window.innerHeight) * 2;
    if (!st.lightT) { st.mx = st.tx; st.my = st.ty; }
    st.lightT = 1;
  }

  function resize() {
    if (!gl) return;
    size();
    if (!st.running) draw();
  }

  /* QA only: renders one frame, reads the pixels under el, composites over #09090B, returns luma 0-255. */
  function measure(el) {
    if (!gl || !el || lostFlag) return { maxLuma: 0, meanLuma: 0 };
    draw();
    var r = el.getBoundingClientRect(), sx = canvas.width / canvas.clientWidth, sy = canvas.height / canvas.clientHeight;
    var x0 = Math.max(0, Math.floor(r.left * sx)), x1 = Math.min(canvas.width, Math.ceil(r.right * sx));
    var y0 = Math.max(0, Math.floor(r.top * sy)), y1 = Math.min(canvas.height, Math.ceil(r.bottom * sy));
    var w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return { maxLuma: 0, meanLuma: 0 };
    var px = new Uint8Array(w * h * 4);
    gl.readPixels(x0, canvas.height - y1, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var max = 0, sum = 0, n = w * h;
    for (var i = 0; i < px.length; i += 4) {
      var k = 1 - px[i + 3] / 255;
      var l = 0.2126 * (px[i] + BG[0] * k) + 0.7152 * (px[i + 1] + BG[1] * k) + 0.0722 * (px[i + 2] + BG[2] * k);
      if (l > max) max = l;
      sum += l;
    }
    return { maxLuma: max, meanLuma: sum / n };
  }

  window.NICO_BG = {
    init: init, start: start, stop: stop, destroy: destroy, setMode: setMode, pointer: pointer, resize: resize, measure: measure,
    get mode() { return st.mode; },
    get frames() { return st.frames; },
    get running() { return st.running; },
  };
})();
