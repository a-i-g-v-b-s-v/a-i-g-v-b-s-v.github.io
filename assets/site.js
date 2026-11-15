/* Reveal on scroll, figure drawing, project filters and a lightbox. No dependencies. */
(function () {
  /* reveal on scroll with a small stagger inside each group; draw the hero plate as it appears */
  var rv = [].slice.call(document.querySelectorAll('.rv'));
  rv.forEach(function (el) {
    var sibs = el.parentElement ? [].slice.call(el.parentElement.children).filter(function (c) { return c.classList.contains('rv'); }) : [];
    el.style.setProperty('--d', Math.min(sibs.indexOf(el), 6) * 70 + 'ms');
  });
  [].slice.call(document.querySelectorAll('.plate')).forEach(function (svg) {
    [].slice.call(svg.querySelectorAll('.d, .t, .dot, .bar')).forEach(function (n, i) { n.style.setProperty('--i', Math.min(i, 80)); });
  });
  function show(el) {
    el.classList.add('in');
    var svg = el.querySelector && el.querySelector('.plate');
    if (svg) svg.classList.add('go');
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.02, rootMargin: '0px 0px -4% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(show);
  }
  /* safety net: a plain position check, so nothing stays hidden if the observer is late or throttled */
  function sweep() {
    var h = window.innerHeight || document.documentElement.clientHeight;
    rv = rv.filter(function (el) {
      if (el.classList.contains('in')) return false;
      var r = el.getBoundingClientRect();
      if (r.top < h * 0.96 && r.bottom > 0) { show(el); return false; }
      return true;
    });
  }
  var due = false;
  function ask() { if (!due) { due = true; setTimeout(function () { due = false; sweep(); }, 120); } }
  window.addEventListener('scroll', ask, { passive: true });
  window.addEventListener('resize', ask);
  window.addEventListener('load', ask);
  setTimeout(sweep, 600);

  /* project filters on the Work page */
  var chips = [].slice.call(document.querySelectorAll('.chip'));
  if (chips.length) {
    var cards = [].slice.call(document.querySelectorAll('#index .card'));
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var f = c.dataset.filter;
        chips.forEach(function (o) { o.setAttribute('aria-pressed', o === c ? 'true' : 'false'); });
        cards.forEach(function (card) {
          card.hidden = !(f === 'all' || card.dataset.kind === f);
          if (!card.hidden) show(card);
        });
        try { history.replaceState(null, '', f === 'all' ? location.pathname : '#' + f); } catch (e) {}
      });
    });
    var hash = location.hash.replace('#', '');
    var start = chips.filter(function (c) { return c.dataset.filter === hash; })[0];
    if (start) start.click();
  }

  /* lightbox: figures are inline drawings, so the enlarged view is a copy of the drawing itself */
  var lb = document.querySelector('.lightbox');
  if (lb) {
    var stage = lb.querySelector('.lb-stage'), lbCap = lb.querySelector('.lb-cap');
    var close = function () { lb.hidden = true; stage.innerHTML = ''; document.body.style.overflow = ''; };
    [].slice.call(document.querySelectorAll('.fig .zoom')).forEach(function (b) {
      b.addEventListener('click', function () {
        var svg = b.querySelector('svg, img');
        if (!svg) return;
        stage.innerHTML = '';
        stage.appendChild(svg.cloneNode(true));
        lbCap.textContent = b.dataset.cap || '';
        lb.hidden = false;
        document.body.style.overflow = 'hidden';
      });
    });
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) close(); });
  }
})();

/* about: the section menu follows the scroll */
(function () {
  var links = [].slice.call(document.querySelectorAll('.cv-nav a')); if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = {}; links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting && byId[e.target.id]) { links.forEach(function (a) { a.classList.remove('on'); }); byId[e.target.id].classList.add('on'); } });
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('.cv-sec').forEach(function (s) { io.observe(s); });
})();

/* about: the career line fills with scroll and lights each role as it passes */
(function () {
  var el = document.getElementById('fpath'); if (!el) return;
  var pts = el.querySelectorAll('.pt');
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { pts.forEach(function (p) { p.classList.add('on'); }); return; }
  var line = el.querySelector('.fpath-line'), tick = false;
  el.classList.add('live');
  function draw() {
    tick = false;
    var r = line.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * 0.62 - r.top) / r.height)), y = r.top + p * r.height;
    line.style.setProperty('--p', p.toFixed(4));
    pts.forEach(function (n) { n.classList.toggle('on', n.getBoundingClientRect().top + 8 <= y); });
  }
  function ask() { if (!tick) { tick = true; requestAnimationFrame(draw); } }
  addEventListener('scroll', ask, { passive: true }); addEventListener('resize', ask); draw();
})();
