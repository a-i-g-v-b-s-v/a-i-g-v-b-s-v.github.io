/* 3D model viewer: rotate, zoom, explode, read part names. Plain WebGL, no dependencies.
   Markup (written by build.py):  <div class="model3d" data-src="assets/models/<name>.json">
   The JSON is a parts list written by build/rc_model.py: each part has a label, an explode vector
   and a few solids, either a box ["b", x0,y0,z0, x1,y1,z1] or a cylinder ["c", ax,ay,az, bx,by,bz, r0, r1].
   Millimetres, z up. */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PALETTE = [[0.80, 0.81, 0.86], [0.56, 0.59, 0.67], [0.38, 0.40, 0.47], [1.0, 0.357, 0.18], [0.27, 0.28, 0.33]];
  var FOV = 32 * Math.PI / 180, SIDES = 36;

  /* ---- small vector helpers ---- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b, k) { k = k === undefined ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function persp(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, target, up) {
    var z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mul(a, b) {
    var o = new Array(16), i, j, k;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { var s = 0; for (k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
    return o;
  }

  /* ---- solids to triangles and edge lines ---- */
  function meshPart(prims) {
    var pos = [], nor = [], lin = [], boxes = [];
    function tri(a, b, c, na, nb, nc) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]); }
    function seg(a, b) { lin.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    prims.forEach(function (p) {
      if (p[0] === 'b') {
        var x0 = p[1], y0 = p[2], z0 = p[3], x1 = p[4], y1 = p[5], z1 = p[6];
        var c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
        [[0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]], [0, 1, 5, 4, [0, -1, 0]], [1, 2, 6, 5, [1, 0, 0]], [2, 3, 7, 6, [0, 1, 0]], [3, 0, 4, 7, [-1, 0, 0]]].forEach(function (f) {
          tri(c[f[0]], c[f[1]], c[f[2]], f[4], f[4], f[4]); tri(c[f[0]], c[f[2]], c[f[3]], f[4], f[4], f[4]);
        });
        [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (e) { seg(c[e[0]], c[e[1]]); });
        boxes.push([x0, y0, z0, x1, y1, z1]);
      } else {
        var a = [p[1], p[2], p[3]], b = [p[4], p[5], p[6]], r0 = p[7], r1 = p[8];
        var ax = norm(sub(b, a)), t = Math.abs(ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = norm(cross(ax, t)), v = cross(ax, u);
        var A = [], B = [], N = [], i, back = [-ax[0], -ax[1], -ax[2]];
        for (i = 0; i < SIDES; i++) {
          var th = i / SIDES * Math.PI * 2, n = add([u[0] * Math.cos(th), u[1] * Math.cos(th), u[2] * Math.cos(th)], v, Math.sin(th));
          N.push(n); A.push(add(a, n, r0)); B.push(add(b, n, r1));
        }
        for (i = 0; i < SIDES; i++) {
          var j = (i + 1) % SIDES;
          tri(A[i], A[j], B[j], N[i], N[j], N[j]); tri(A[i], B[j], B[i], N[i], N[j], N[i]);
          tri(a, A[j], A[i], back, back, back); tri(b, B[i], B[j], ax, ax, ax);
          seg(A[i], A[j]); seg(B[i], B[j]);
        }
        var r = Math.max(r0, r1);
        boxes.push([Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r]);
      }
    });
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), lin: new Float32Array(lin), boxes: boxes };
  }

  var VS = 'attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uMVP; uniform vec3 uOff; varying vec3 vN;' +
    'void main(){ vN = aNor; gl_Position = uMVP * vec4(aPos + uOff, 1.0); }';
  var FS = 'precision mediump float; varying vec3 vN; uniform vec3 uCol; uniform float uLine;' +
    'void main(){ if (uLine > 0.5) { gl_FragColor = vec4(0.80, 0.82, 0.88, 0.30); return; }' +
    ' vec3 n = normalize(vN);' +
    ' vec3 c = uCol * mix(vec3(0.17, 0.17, 0.22), vec3(0.58, 0.60, 0.68), 0.5 + 0.5 * n.z);' +
    ' c += uCol * 0.78 * max(dot(n, normalize(vec3(0.42, 0.34, 0.84))), 0.0);' +
    ' c += vec3(1.0, 0.63, 0.48) * 0.17 * max(dot(n, normalize(vec3(-0.62, -0.52, -0.22))), 0.0);' +
    ' gl_FragColor = vec4(c, 1.0); }';

  function ui(el) {
    el.innerHTML = '<canvas></canvas><div class="m3-bar"><label class="m3-ex">Explode <input type="range" min="0" max="1" step="0.005" value="0" aria-label="Explode"></label>' +
      '<button type="button" class="m3-b" data-a="spin" aria-pressed="false">Spin</button><button type="button" class="m3-b" data-a="edges" aria-pressed="true">Edges</button>' +
      '<button type="button" class="m3-b" data-a="reset">Reset</button></div><div class="m3-tip" hidden></div><div class="m3-load">Loading model</div><div class="m3-chip">Drag to rotate</div>';
    return { canvas: el.querySelector('canvas'), slider: el.querySelector('input'), tip: el.querySelector('.m3-tip'), load: el.querySelector('.m3-load') };
  }

  function mount(el) {
    var o = ui(el), canvas = o.canvas, slider = o.slider, tip = o.tip, load = o.load;
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true }) || canvas.getContext('experimental-webgl');
    if (!gl) { load.textContent = 'This browser cannot draw the 3D model'; return; }
    function shader(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { load.textContent = 'Model could not load'; return; }
    gl.useProgram(prog);
    var aPos = gl.getAttribLocation(prog, 'aPos'), aNor = gl.getAttribLocation(prog, 'aNor');
    var uMVP = gl.getUniformLocation(prog, 'uMVP'), uOff = gl.getUniformLocation(prog, 'uOff'), uCol = gl.getUniformLocation(prog, 'uCol'), uLine = gl.getUniformLocation(prog, 'uLine');
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var st = { parts: [], t: 0, edges: true, spin: false, yaw: 0.76, pitch: 0.48, dist: 1, target: [0, 0, 0], r0: 1, r1: 1, dirty: true, ready: false };

    function eye() {
      var cp = Math.cos(st.pitch);
      return add(st.target, [cp * Math.cos(st.yaw), cp * Math.sin(st.yaw), Math.sin(st.pitch)], st.dist);
    }
    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round((canvas.clientWidth || el.clientWidth) * dpr)), h = Math.max(1, Math.round((canvas.clientHeight || 400) * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      st.dirty = true;
    }
    function draw() {
      st.dirty = false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!st.ready) return;
      var mvp = mul(persp(FOV, canvas.width / canvas.height, st.dist / 50, st.dist * 8), lookAt(eye(), st.target, [0, 0, 1]));
      gl.uniformMatrix4fv(uMVP, false, new Float32Array(mvp));
      gl.enableVertexAttribArray(aPos);
      st.parts.forEach(function (p) {
        gl.uniform3f(uOff, p.ex[0] * st.t, p.ex[1] * st.t, p.ex[2] * st.t);
        gl.uniform3fv(uCol, p.col); gl.uniform1f(uLine, 0);
        gl.enableVertexAttribArray(aNor);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.bPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.bNor); gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, p.nTri);
      });
      if (st.edges) {
        gl.enable(gl.BLEND); gl.uniform1f(uLine, 1);
        gl.disableVertexAttribArray(aNor); gl.vertexAttrib3f(aNor, 0, 0, 1);
        st.parts.forEach(function (p) {
          gl.uniform3f(uOff, p.ex[0] * st.t, p.ex[1] * st.t, p.ex[2] * st.t);
          gl.bindBuffer(gl.ARRAY_BUFFER, p.bLin); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.LINES, 0, p.nLin);
        });
        gl.disable(gl.BLEND);
      }
    }
    function fitDist(r) { return r / Math.sin(FOV / 2) * 1.02; }
    function setExplode(t) { st.t = t; st.dist = fitDist(st.r0 + (st.r1 - st.r0) * t) * (st.zoom || 1); st.dirty = true; }
    function home() { st.yaw = 0.76; st.pitch = 0.48; st.zoom = 1; setExplode(st.t); }

    /* pointer: drag to orbit, wheel to zoom, hover for the part name */
    var drag = null;
    canvas.addEventListener('pointerdown', function (e) {
      drag = [e.clientX, e.clientY]; st.active = true; canvas.setPointerCapture(e.pointerId);
      var c = el.querySelector('.m3-chip'); if (c) c.classList.add('gone');
    });
    canvas.addEventListener('pointerup', function () { drag = null; });
    canvas.addEventListener('pointercancel', function () { drag = null; });
    canvas.addEventListener('pointermove', function (e) {
      if (drag) {
        st.yaw -= (e.clientX - drag[0]) * 0.008; st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch + (e.clientY - drag[1]) * 0.008));
        drag = [e.clientX, e.clientY]; st.dirty = true; tip.hidden = true; return;
      }
      var r = canvas.getBoundingClientRect(), nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      var ey = eye(), fw = norm(sub(st.target, ey)), rt = norm(cross(fw, [0, 0, 1])), up = cross(rt, fw), tn = Math.tan(FOV / 2);
      var d = norm(add(add(fw, rt, nx * tn * r.width / r.height), up, ny * tn)), best = null, bt = 1e18;
      st.parts.forEach(function (p) {
        var off = [p.ex[0] * st.t, p.ex[1] * st.t, p.ex[2] * st.t];
        p.boxes.forEach(function (b) {
          var t0 = -1e18, t1 = 1e18, k;
          for (k = 0; k < 3; k++) {
            var lo = b[k] + off[k], hi = b[k + 3] + off[k];
            if (Math.abs(d[k]) < 1e-9) { if (ey[k] < lo || ey[k] > hi) { t0 = 1; t1 = 0; } continue; }
            var ta = (lo - ey[k]) / d[k], tb = (hi - ey[k]) / d[k];
            t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
          }
          if (t0 <= t1 && t1 > 0 && t0 < bt) { bt = t0; best = p; }
        });
      });
      tip.hidden = !best;
      if (best) { tip.textContent = best.label; tip.style.left = e.clientX - r.left + 14 + 'px'; tip.style.top = e.clientY - r.top + 14 + 'px'; }
    });
    canvas.addEventListener('pointerleave', function () { tip.hidden = true; st.active = false; });
    canvas.addEventListener('wheel', function (e) {
      if (!st.active) return;  /* the page keeps scrolling until the model has been clicked */
      e.preventDefault(); st.zoom = Math.max(0.35, Math.min(2.5, (st.zoom || 1) * Math.exp(e.deltaY * 0.0012))); setExplode(st.t);
    }, { passive: false });
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.m3-b') : null; if (!b) return;
      var a = b.dataset.a;
      if (a === 'spin') { st.spin = !st.spin; b.setAttribute('aria-pressed', st.spin); }
      if (a === 'edges') { st.edges = !st.edges; b.setAttribute('aria-pressed', st.edges); }
      if (a === 'reset') { slider.value = 0; st.t = 0; home(); }
      st.dirty = true;
    });
    slider.addEventListener('input', function () { setExplode(+slider.value); draw(); });
    if ('ResizeObserver' in window) new ResizeObserver(function () { size(); draw(); }).observe(canvas);
    size();

    fetch(el.dataset.src).then(function (r) { return r.json(); }).then(function (meta) {
      var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], xl = [1e9, 1e9, 1e9], xh = [-1e9, -1e9, -1e9];
      meta.parts.forEach(function (p) {
        var m = meshPart(p.prims), part = { label: p.label, ex: p.explode || [0, 0, 0], col: PALETTE[p.col] || PALETTE[2], boxes: m.boxes, nTri: m.pos.length / 3, nLin: m.lin.length / 3 };
        part.bPos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, part.bPos); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
        part.bNor = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, part.bNor); gl.bufferData(gl.ARRAY_BUFFER, m.nor, gl.STATIC_DRAW);
        part.bLin = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, part.bLin); gl.bufferData(gl.ARRAY_BUFFER, m.lin, gl.STATIC_DRAW);
        m.boxes.forEach(function (b) {
          for (var k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], b[k]); hi[k] = Math.max(hi[k], b[k + 3]);
            xl[k] = Math.min(xl[k], b[k] + part.ex[k], b[k]); xh[k] = Math.max(xh[k], b[k + 3] + part.ex[k], b[k + 3]);
          }
        });
        st.parts.push(part);
      });
      st.target = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      function rad(a, b) { var m = 0; for (var k = 0; k < 3; k++) m += Math.pow(Math.max(Math.abs(a[k] - st.target[k]), Math.abs(b[k] - st.target[k])), 2); return Math.sqrt(m); }
      st.r0 = rad(lo, hi) * 0.6; st.r1 = Math.max(st.r0, rad(xl, xh) * 0.66);
      st.ready = true; load.remove(); home();
      if (!reduce && el.dataset.spin === '1') { st.spin = true; el.querySelector('[data-a="spin"]').setAttribute('aria-pressed', 'true'); }
      draw();
      el.dispatchEvent(new CustomEvent('model-ready'));
    }).catch(function (err) { load.textContent = 'Model could not load'; if (window.console) console.error(err); });

    (function loop() {
      requestAnimationFrame(loop);
      if (st.spin && st.ready && !drag) { st.yaw += 0.004; st.dirty = true; }
      if (st.dirty) draw();
    })();
  }

  [].slice.call(document.querySelectorAll('.model3d')).forEach(function (el) {
    if (!('IntersectionObserver' in window)) { mount(el); return; }
    var done = false, io = new IntersectionObserver(function (es) { if (es[0].isIntersecting && !done) { done = true; io.disconnect(); mount(el); } }, { rootMargin: '300px' });
    io.observe(el);
    setTimeout(function () { if (!done) { var r = el.getBoundingClientRect(); if (r.top < innerHeight + 300 && r.bottom > -300) { done = true; io.disconnect(); mount(el); } } }, 800);
  });
})();
