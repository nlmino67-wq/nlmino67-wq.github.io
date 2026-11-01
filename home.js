/* Nico Tan Leonardia · home page motion. Vanilla JS, one IIFE. Loads before site.js so the clones exist when site.js builds
   its registry and binds previews. Every part fails open: without GSAP (or any selector) the page is fully visible and rails
   scroll natively. Opacity is only ever set from here, never from CSS. Reveals start at .35, never 0.
   No pins. Scrub is used twice, both tiny: the wall parallax. Every once-only reveal has onLeave/onEnterBack guards that jump
   to the end state so a flick never leaves a half-drawn element. */
(() => {
  "use strict";

  /* ================= SWAP POINTS: contact details and the media files that are stand-ins today ================= */
  const CONTACT = { email: "nlmino67@gmail.com", telegram: "https://t.me/+639171776426" };
  const MEDIA = {
    reel: { src: "v/reel_v2.mp4", poster: "p/reel_v2.jpg" },                           // FINAL v/reel_v2.mp4        + p/reel_v2.jpg
    rawFinal: { src: "v/raw_to_final.mp4", poster: "p/raw_to_final.jpg" },       // FINAL v/raw_to_final.mp4   + p/raw_to_final.jpg
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const NET = navigator.connection || {};
  const lowData = () => Boolean(NET.saveData) || ["slow-2g", "2g"].includes(NET.effectiveType);
  const hasIO = "IntersectionObserver" in window;
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const HOME = (window.NICO_HOME = { loops: [], rails: [], cols: [], wall: null, timelines: {},
    playing: () => $$("video").filter((v) => !v.paused && !v.ended && v.closest("#player") === null).length });
  const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const refreshSoon = debounce(() => { if (ST) ST.refresh(); }, 120);
  const smooth = () => (RM.matches ? "auto" : "smooth");

  /* ================= GSAP horizontalLoop helper (items move by xPercent, never scrollLeft) ================= */
  function horizontalLoop(items, config) {
    const tl = G.timeline({ repeat: config.repeat, paused: true, defaults: { ease: "none" },
      onReverseComplete: () => tl.totalTime(tl.rawTime() + tl.duration() * 100) });
    const n = items.length, startX = items[0].offsetLeft, times = [], widths = [], xPct = [];
    const pps = (config.speed || 1) * 100;
    let cur = 0;
    G.set(items, { xPercent: (i, el) => {
      widths[i] = parseFloat(G.getProperty(el, "width", "px"));
      xPct[i] = (parseFloat(G.getProperty(el, "x", "px")) / widths[i]) * 100 + G.getProperty(el, "xPercent");
      return xPct[i];
    } });
    G.set(items, { x: 0 });
    const last = items[n - 1];
    const total = last.offsetLeft + (xPct[n - 1] / 100) * widths[n - 1] - startX + last.offsetWidth * G.getProperty(last, "scaleX") + (config.paddingRight || 0);
    items.forEach((item, i) => {
      const curX = (xPct[i] / 100) * widths[i];
      const toStart = item.offsetLeft + curX - startX;
      const toLoop = toStart + widths[i] * G.getProperty(item, "scaleX");
      tl.to(item, { xPercent: ((curX - toLoop) / widths[i]) * 100, duration: toLoop / pps }, 0)
        .fromTo(item, { xPercent: ((curX - toLoop + total) / widths[i]) * 100 },
          { xPercent: xPct[i], duration: (total - toLoop) / pps, immediateRender: false }, toLoop / pps)
        .add("l" + i, toStart / pps);
      times[i] = toStart / pps;
    });
    const wrapT = (t) => G.utils.wrap(0, tl.duration(), t);
    tl.closestIndex = () => {
      const d = tl.duration(), t = wrapT(tl.time());
      let best = 0, bd = Infinity;
      times.forEach((tm, i) => { const diff = Math.min(Math.abs(tm - t), d - Math.abs(tm - t)); if (diff < bd) { bd = diff; best = i; } });
      cur = best;
      return best;
    };
    tl.toIndex = (index, vars = {}) => {
      if (Math.abs(index - cur) > n / 2) index += index > cur ? -n : n;
      const ni = G.utils.wrap(0, n, index);
      let time = times[ni];
      if ((time > tl.time()) !== (index > cur) && index !== cur) time += tl.duration() * (index > cur ? 1 : -1);
      if (time < 0 || time > tl.duration()) vars.modifiers = { time: wrapT };
      cur = ni;
      vars.overwrite = true;
      return vars.duration === 0 ? tl.time(wrapT(time)) : tl.tweenTo(time, vars);
    };
    tl.next = (v) => { tl.closestIndex(); return tl.toIndex(cur + 1, v); };
    tl.previous = (v) => { tl.closestIndex(); return tl.toIndex(cur - 1, v); };
    tl.totalWidth = total;
    tl.progress(1, true).progress(0, true);
    return tl;
  }

  /* Drag/swipe on the rail: a proxy Draggable steers the loop's progress. Inertia only if the plugin loaded. */
  function addDrag(tl, r, ctl) {
    if (!window.Draggable || !(tl.totalWidth > 0)) return null;
    const proxy = document.createElement("div");
    let ratio = 0, startP = 0, d = null;
    const align = () => tl.progress(G.utils.wrap(0, 1, startP + (d.startX - d.x) * ratio));
    const done = () => { ctl.st.drag = false; ctl.hold(2500); };
    d = window.Draggable.create(proxy, {
      trigger: r.el, type: "x", minimumMovement: 6, dragClickables: true, inertia: Boolean(window.InertiaPlugin),
      cursor: "grab", activeCursor: "grabbing", allowContextMenu: true, overshootTolerance: 0,
      onPressInit() {
        G.killTweensOf(tl);
        ctl.st.drag = true;
        ctl.apply();
        startP = tl.progress();
        ratio = 1 / tl.totalWidth;
        G.set(proxy, { x: -startP / ratio });
      },
      onDragStart() { r.el.dataset.drag = "1"; },
      onDrag: align,
      onThrowUpdate: align,
      onRelease() { setTimeout(() => { delete r.el.dataset.drag; }, 30); if (!this.isThrowing) done(); },
      onThrowComplete: done,
    })[0];
    return d;
  }

  /* ================= rails ================= */
  const cloneItem = (it) => {
    const c = it.cloneNode(true);
    c.setAttribute("aria-hidden", "true");
    c.removeAttribute("id");
    c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    c.querySelectorAll("a, button").forEach((a) => a.setAttribute("tabindex", "-1"));
    return c;
  };

  function fillClones(r) {
    const { track, originals } = r;
    if (!originals.length) return;
    const span = () => { const f = track.firstElementChild, l = track.lastElementChild; return l.offsetLeft + l.offsetWidth - f.offsetLeft; };
    for (let guard = 0; span() < innerWidth * 2 && guard < 6; guard += 1) originals.forEach((it) => track.appendChild(cloneItem(it)));
  }

  const relX = (r, it) => it.getBoundingClientRect().left - r.track.getBoundingClientRect().left;

  function setNative(r) {                                          // default: the rail's own overflow-x scrolling
    const by = (dir) => r.el.scrollBy({ left: dir * Math.max(Math.min(r.el.clientWidth * 0.75, 900), 220), behavior: smooth() });
    r.next = () => by(1);
    r.prev = () => by(-1);
    r.to = (i) => { const it = r.originals[i]; if (it) r.el.scrollTo({ left: relX(r, it), behavior: smooth() }); };
    r.jump = (edge) => r.el.scrollTo({ left: edge < 0 ? 0 : r.el.scrollWidth, behavior: smooth() });
    r.reveal = null;
  }

  function initRail(el) {
    const track = $(".rail-track", el);
    if (!track) return null;
    const sec = el.closest(".rail-sec") || el.parentNode;
    const r = { el, track, sec, kind: el.dataset.rail || "loop", originals: $$(".rail-item", track), items: [], tl: null };
    r.x = () => (r.originals[0] ? Math.round(r.originals[0].getBoundingClientRect().left) : 0);
    $$("img, a", track).forEach((n) => { n.draggable = false; });
    setNative(r);
    $$("[data-rail-prev]", sec).forEach((b) => b.addEventListener("click", () => r.prev()));
    $$("[data-rail-next]", sec).forEach((b) => b.addEventListener("click", () => r.next()));
    el.addEventListener("click", (e) => {                          // capture: a drag must never open the player
      if (el.dataset.drag) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    el.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const map = { ArrowRight: () => r.next(), ArrowLeft: () => r.prev(), Home: () => r.jump(-1), End: () => r.jump(1) };
      if (!map[e.key]) return;
      e.preventDefault();
      map[e.key]();
    });
    el.addEventListener("focusin", (e) => {
      const item = e.target.closest && e.target.closest(".rail-item");
      if (item && r.reveal) r.reveal(item);
    });
    HOME.rails.push(r);
    return r;
  }

  const lockScroll = (el, signal) => el.addEventListener("scroll", () => { if (el.scrollLeft) el.scrollLeft = 0; }, { signal, passive: true });

  function buildLoop(r, reduce, signal) {
    const st = { vis: false, hover: false, drag: false, held: false };
    let live = null, timer = 0;
    const apply = () => {
      if (!live) return;
      const tl = live.tl;
      if (!st.vis || reduce || st.drag || st.held) { tl.pause(); return; }
      tl.play();
      G.to(tl, { timeScale: st.hover ? 0 : 1, duration: 0.4, overwrite: "auto" });
    };
    const hold = (ms) => { st.held = true; clearTimeout(timer); timer = setTimeout(() => { st.held = false; apply(); }, ms); apply(); };
    const sig = (items) => innerWidth + ":" + items.map((i) => i.offsetWidth).join(",");
    const kill = () => {
      if (!live) return;
      live.tl.kill();
      if (live.drag) live.drag.kill();
      if (live.trig) live.trig.kill();
      G.set(live.items, { clearProps: "x,xPercent,transform" });
      const i = HOME.loops.indexOf(live.tl);
      if (i >= 0) HOME.loops.splice(i, 1);
      live = null;
    };
    const make = (progress) => {
      r.el.style.overflowX = "hidden";                             // GSAP owns movement; focus must not scroll the rail
      r.el.scrollLeft = 0;
      fillClones(r);
      const items = $$(".rail-item", r.track);
      const gap = parseFloat(getComputedStyle(r.track).columnGap) || 0;
      const tl = horizontalLoop(items, { repeat: -1, speed: Number(r.el.dataset.speed) || 0.9, paddingRight: gap });
      if (progress) tl.progress(progress);
      const trig = ST.create({ trigger: r.el, start: "top bottom", end: "bottom top", onToggle: (s) => { st.vis = s.isActive; apply(); } });
      st.vis = trig.isActive;
      live = { tl, items, trig, sig: sig(items), drag: null };
      live.drag = addDrag(tl, r, { st, apply, hold });
      Object.assign(r, { items, tl });
      HOME.loops.push(tl);
      apply();
    };
    const step = (fn) => { hold(3500); fn(); };
    const opt = { duration: 0.5, ease: "power2.inOut" };
    r.next = () => step(() => live.tl.next({ ...opt }));
    r.prev = () => step(() => live.tl.previous({ ...opt }));
    r.to = (i) => step(() => { live.tl.closestIndex(); live.tl.toIndex(i, { ...opt }); });
    r.jump = (edge) => r.to(edge < 0 ? 0 : r.originals.length - 1);
    r.reveal = (item) => {
      const i = live ? live.items.indexOf(item) : -1;
      if (i < 0) return;
      hold(6000);
      live.tl.closestIndex();
      live.tl.toIndex(i, { duration: 0.4 });
    };
    const mouse = (on) => (e) => { if (e.pointerType === "mouse") { st.hover = on; apply(); } };
    r.el.addEventListener("pointerenter", mouse(true), { signal });
    r.el.addEventListener("pointerleave", mouse(false), { signal });
    lockScroll(r.el, signal);
    make(0);
    return {
      refit() { if (live && sig(live.items) !== live.sig) { const p = live.tl.progress(); kill(); make(p); } },
      destroy() { clearTimeout(timer); kill(); r.el.style.overflowX = ""; delete r.el.dataset.drag; r.tl = null; setNative(r); },
    };
  }

  /* ================= video scheduler: at most 3 videos playing (2 under 600px); wall videos first while the hero is on screen ================= */
  const S = { modal: false, heroRatio: 0 };
  const maxPlaying = () => (matchMedia("(max-width: 599px)").matches ? 2 : 3);
  const autoOk = () => !RM.matches && !lowData();
  let vids = [];

  const ensureSrc = (v) => { if (!v.getAttribute("src") && v.dataset.src) { v.src = v.dataset.src; v.preload = "auto"; } };
  const playV = (v) => { ensureSrc(v); if (v.paused) quiet(v.play()); };
  const stopV = (v) => { if (!v.paused) v.pause(); };
  const inWall = (v) => Boolean(v.closest(".hm-wall"));

  function schedule() {
    const gate = !S.modal && !document.hidden;
    const pick = [];
    if (gate && autoOk()) {
      const heroOn = S.heroRatio > 0.05;
      const rank = (v) => v._ratio + (heroOn && inWall(v) ? 2 : 0);
      vids.filter((v) => v._ratio >= 0.35).sort((a, b) => rank(b) - rank(a)).forEach((v) => { if (pick.length < maxPlaying()) pick.push(v); });
    }
    vids.forEach((v) => (pick.includes(v) ? playV(v) : stopV(v)));
  }

  function resolveMedia() {
    $$("video[data-media]").forEach((v) => {
      const m = MEDIA[v.dataset.media];
      if (!m) return;
      v.dataset.src = m.src;
      v.poster = m.poster;
    });
  }

  function initScheduler() {
    vids = $$("video.sv").filter((v) => !v.parentNode.closest("[aria-hidden=\"true\"]"));
    vids.forEach((v) => { v.muted = true; v._ratio = hasIO ? 0 : 1; });
    if (RM.addEventListener) RM.addEventListener("change", schedule);
    if (!hasIO) { schedule(); return; }
    const near = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && autoOk()) ensureSrc(e.target); }), { rootMargin: "100% 0px 100% 0px" });
    const seen = new IntersectionObserver((es) => { es.forEach((e) => { e.target._ratio = e.isIntersecting ? e.intersectionRatio : 0; }); schedule(); }, { threshold: [0, 0.35, 0.6, 1] });
    vids.forEach((v) => { near.observe(v); seen.observe(v); });
    const top = $("#top");
    if (top) new IntersectionObserver(([e]) => { S.heroRatio = e.isIntersecting ? e.intersectionRatio : 0; schedule(); }, { threshold: [0, 0.05, 0.35] }).observe(top);
    document.addEventListener("visibilitychange", schedule);
    const pl = $("#player");
    if (pl && "MutationObserver" in window) new MutationObserver(() => { S.modal = pl.open; schedule(); }).observe(pl, { attributes: true, attributeFilter: ["open"] });
  }

  /* ================= chapter rail scrollspy ================= */
  function initSecnav() {
    const links = $$("#secnav a[href^=\"#\"]");
    if (!links.length) return;
    const setCur = (cur) => links.forEach((a) => (a === cur ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    if (!hasIO) { setCur(links[0]); return; }
    const on = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? on.add(e.target.id) : on.delete(e.target.id)));
      const cur = links.find((a) => on.has(a.hash.slice(1)));
      if (cur) setCur(cur);
    }, { rootMargin: "-40% 0px -55% 0px" });
    links.forEach((a) => { const t = document.getElementById(a.hash.slice(1)); if (t) io.observe(t); });
    if (!$("#secnav a[aria-current]")) setCur(links[0]);
    window.addEventListener("scroll", () => {                      // the short last section may never reach the band
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) setCur(links[links.length - 1]);
    }, { passive: true });
  }

  /* ================= hero wall: three columns drift at their own speed; scrolling fast pushes them ================= */
  const paintPause = (btn, off) => {
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(off));
    btn.setAttribute("aria-label", off ? "Play moving work" : "Pause moving work");
    btn.title = off ? "Play moving work" : "Pause moving work";
  };

  function wallColumns(signal, startOff) {
    const wall = $(".hm-wall");
    const cols = wall ? $$(".wall-col", wall) : [];
    if (!cols.length) return null;
    const clones = [];
    cols.forEach((col) => {
      const kids = Array.from(col.children);
      col._n = kids.length;
      kids.forEach((li) => {
        const c = cloneItem(li);
        $$("video", c).forEach((v) => v.remove());                 // clones are posters only: the video cap never sees them
        clones.push(c);
        col.appendChild(c);
      });
    });
    wall.classList.add("is-live");
    const setH = (col) => (col.children.length > col._n ? col.children[col._n].offsetTop - col.children[0].offsetTop : 0);
    const tweens = cols.map((col) => G.to(col, { y: () => -setH(col), repeat: -1, ease: "none", duration: Number(col.dataset.dur) || 54, paused: true }));
    HOME.cols = tweens;
    let inView = false, boost = 1, boostT = 1, hov = 1, hovT = 1, idle = 0, userOff = Boolean(startOff);
    const tick = () => {
      boost += (boostT - boost) * 0.12;
      hov += (hovT - hov) * 0.15;
      tweens.forEach((t) => t.timeScale(boost * hov));
    };
    HOME.wall = { el: wall, cols: tweens, running: false, off: () => userOff };
    const sync = () => {
      const on = inView && !userOff && !S.modal && !document.hidden;
      tweens.forEach((t) => t.paused(!on));
      G.ticker.remove(tick);
      if (on) G.ticker.add(tick);
      HOME.wall.running = on;
    };
    const view = ST.create({ trigger: wall, start: "top bottom", end: "bottom top", onToggle: (s) => { inView = s.isActive; sync(); } });
    inView = view.isActive;
    const vel = ST.create({ start: 0, end: "max", onUpdate: (s) => {
      boostT = 1 + G.utils.clamp(0, 2, Math.abs(s.getVelocity()) / 1200);
      clearTimeout(idle);
      idle = setTimeout(() => { boostT = 1; }, 200);
    } });
    const mouse = (v) => (e) => { if (e.pointerType === "mouse") hovT = v; };
    wall.addEventListener("pointerenter", mouse(0.3), { signal });
    wall.addEventListener("pointerleave", mouse(1), { signal });
    wall.addEventListener("focusin", () => { hovT = 0.3; }, { signal });
    wall.addEventListener("focusout", () => { hovT = 1; }, { signal });
    const btn = $(".wall-pause");
    paintPause(btn, userOff);
    if (btn) btn.addEventListener("click", () => { userOff = !userOff; paintPause(btn, userOff); sync(); }, { signal });
    document.addEventListener("visibilitychange", sync, { signal });
    const pl = $("#player");
    const mo = pl && "MutationObserver" in window ? new MutationObserver(sync) : null;
    if (mo) mo.observe(pl, { attributes: true, attributeFilter: ["open"] });
    sync();
    return {
      refit() { tweens.forEach((t) => t.invalidate()); },
      destroy() {
        clearTimeout(idle);
        G.ticker.remove(tick);
        if (mo) mo.disconnect();
        view.kill();
        vel.kill();
        tweens.forEach((t) => t.kill());
        G.set(cols, { clearProps: "transform" });
        clones.forEach((c) => c.remove());
        wall.classList.remove("is-live");
        HOME.cols = [];
        HOME.wall = null;
      },
    };
  }

  function wallParallax() {                                        // desktop only: the wall lifts a touch slower than the page
    const wc = $(".hm-wall .wall-cols"), top = $("#top");
    if (!wc || !top) return;
    HOME.timelines.wallParallax = G.to(wc, { y: () => -Math.round(wc.parentNode.offsetHeight * 0.06), ease: "none",
      scrollTrigger: { trigger: top, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
  }

  /* ================= GSAP timelines (all against the markup contract; each is a no-op if its selectors are missing) ================= */
  const finals = [];                                               // end-state writers, used by failOpen

  /* Plays tl once when `trigger` reaches `start`. Flicking past it (onLeave) or arriving from below (onEnterBack) jumps to the end. */
  function playOnce(tl, name, trigger, start, instant) {
    HOME.timelines[name] = tl;
    if (instant || !trigger) { tl.progress(1); return tl; }
    let st = null;
    const finish = () => { tl.progress(1); if (st) st.kill(); };
    st = ST.create({ trigger, start, onEnter: () => tl.play(), onLeave: finish, onEnterBack: finish });
    tl.eventCallback("onComplete", () => st.kill());
    if (st.scroll() > st.end) finish();
    return tl;
  }

  function heroIntro() {
    const lines = $$(".h1l");
    const avatar = $(".hero-avatar"), name = $(".hero-name"), lead = $(".hero-lead");
    const names = $$(".hero-names li"), ctas = $$(".hero-cta > *");
    if (!avatar && !lead && !lines.length) return;
    const tl = G.timeline({ paused: true, defaults: { ease: "power3.out" } });
    HOME.timelines.heroIntro = tl;
    if (avatar) tl.from(avatar, { scale: 0.9, autoAlpha: 0.35, duration: 0.6 }, 0);
    if (name) tl.from(name, { y: 8, autoAlpha: 0.35, duration: 0.5 }, 0.05);
    if (lead) tl.from(lead, { y: 12, autoAlpha: 0.35, duration: 0.6 }, 0.55);
    if (names.length) tl.from(names, { y: 8, autoAlpha: 0, stagger: 0.05, duration: 0.4 }, 0.7);
    if (ctas.length) tl.from(ctas, { y: 10, autoAlpha: 0.35, stagger: 0.06, duration: 0.5 }, 0.85);
    const go = () => {
      if (lines.length) {
        if (window.SplitText) {
          const splits = lines.map((l) => window.SplitText.create(l, { type: "lines", mask: "lines" }));
          tl.fromTo(splits.flatMap((s) => s.lines), { yPercent: 110 }, { yPercent: 0, duration: 0.8, stagger: 0.08 }, 0.1);
          tl.eventCallback("onComplete", () => splits.forEach((s) => s.revert()));
        } else {
          tl.fromTo(lines, { clipPath: "inset(0 0 100% 0)", y: 16, autoAlpha: 0.35 },
            { clipPath: "inset(0 0 -20% 0)", y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08, clearProps: "clipPath" }, 0.1);
        }
      }
      tl.play(0);
    };
    const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 300))]) : Promise.resolve();
    fonts.then(go, go);
    setTimeout(() => { if (tl.progress() < 1) tl.progress(1); }, 3500);   // never stays half-drawn
  }

  const NUM = /-?\d+(?:\.\d+)?/;
  function numberWriter(el, dec) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = w.nextNode();
    while (node && !NUM.test(node.nodeValue)) node = w.nextNode();
    if (!node) return (v) => { el.textContent = v.toFixed(dec) + (el.dataset.suffix || ""); };
    const tpl = node.nodeValue;
    return (v) => { node.nodeValue = tpl.replace(NUM, v.toFixed(dec)); };
  }

  function countUp(instant) {
    $$("[data-count]").forEach((el, i) => {
      const to = parseFloat(el.dataset.count);
      if (!Number.isFinite(to)) return;
      const dec = (el.dataset.count.split(".")[1] || "").length;
      const write = numberWriter(el, dec);
      const o = { v: instant ? to : 0 };
      write(o.v);
      finals.push(() => write(to));
      const tl = G.timeline({ paused: true }).to(o, { v: to, duration: 1.2, ease: "power2.out", onUpdate: () => write(o.v) });
      playOnce(tl, "count" + i, el, "top 85%", instant);
    });
  }

  function takes(instant) {
    const box = $(".takes");
    const all = box ? $$(".take", box) : [];
    if (!all.length) return;
    const keep = all.filter((t) => t.hasAttribute("data-keep"));
    const rej = all.filter((t) => !keep.includes(t));
    const gap = parseFloat(getComputedStyle(box).columnGap) || 3;
    const slot = (i, el) => (keep[0].offsetLeft + i * (el.offsetWidth + gap)) - el.offsetLeft;      // measured when the tween first renders
    const tl = G.timeline({ paused: true, defaults: { ease: "power3.out" } });
    if (rej.length) tl.to(rej, { autoAlpha: 0.15, scaleX: 0.3, duration: 0.5, stagger: { amount: 0.4, from: "end" } }, 0);
    if (keep.length) tl.to(keep, { x: slot, duration: 0.7, ease: "power3.inOut" }, 0.5).to(keep, { backgroundColor: "#A1A1AA", duration: 0.4 }, 0.6);
    playOnce(tl, "takes", box, "top 75%", instant);
  }

  function hooks() {
    const box = $(".hooks");
    if (!box) return;
    const phones = $$(".tile", box);
    const body = $(".hooks-body", box);
    const outer = phones.length >= 3 ? [phones[0], phones[phones.length - 1]] : phones.slice(0, 1);
    const tl = G.timeline({ paused: true, defaults: { ease: "power3.out" } });
    outer.forEach((p, i) => {
      const dir = i === 0 ? -1 : 1;
      tl.fromTo(p, { x: 40 * dir, rotation: -6 * dir, autoAlpha: 0.35 }, { x: 0, rotation: 0, autoAlpha: 1, duration: 0.7, clearProps: "transform" }, i * 0.1);
    });
    if (body) tl.fromTo(body, { clipPath: "inset(0 100% 0 0)", autoAlpha: 0.35 }, { clipPath: "inset(0 0% 0 0)", autoAlpha: 1, duration: 0.6, clearProps: "clipPath" }, 0.45);
    playOnce(tl, "hooks", box, "top 70%", false);
  }

  function faces() {
    const box = $(".same-faces");
    if (!box) return;
    const imgs = $$("img", box);
    const labels = $$("figcaption, .sf-label, .sf-cap", box);
    if (!imgs.length) return;
    const tl = G.timeline({ paused: true, defaults: { ease: "power3.out" } });
    tl.fromTo(imgs, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, stagger: 0.15, clearProps: "clipPath" }, 0);
    if (labels.length) tl.fromTo(labels, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.15 }, 0.25);
    playOnce(tl, "faces", box, "top 75%", false);
  }

  /* every .how list draws its line (CSS var --draw on the list, or an optional .how-line child) and pops its dots as it enters */
  function howBatch() {
    const lists = $$(".how");
    if (!lists.length) return;
    const tls = new Map();
    lists.forEach((how, i) => {
      const dots = $$(".how-dot", how), labels = $$(".how-t", how), line = $(".how-line", how);
      const tl = G.timeline({ paused: true, defaults: { ease: "power3.out" } });
      tl.fromTo(how, { "--draw": 0 }, { "--draw": 1, duration: 0.6 }, 0);
      if (line) tl.fromTo(line, { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.6 }, 0);
      if (dots.length) tl.fromTo(dots, { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(1.7)", stagger: 0.12 }, 0.1);
      if (labels.length) tl.fromTo(labels, { autoAlpha: 0.35, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.12 }, 0.1);
      tls.set(how, tl);
      HOME.timelines["how" + i] = tl;
    });
    const finish = (els, sts) => { els.forEach((e) => tls.get(e).progress(1)); sts.forEach((s) => s.kill()); };
    ST.batch(lists, {
      start: "top 85%",
      onEnter: (els) => els.forEach((e) => tls.get(e).play()),
      onLeave: finish,
      onEnterBack: finish,
    });
  }

  /* text and tiles ease in once (.35 to 1); a fast flick lands them at the end state instantly */
  function tileBatch() {
    const els = $$(".rv, .tile").filter((e) => !e.closest(".hm-wall, [data-rail], .hooks, .same-faces, .takes"));
    if (!els.length) return;
    G.set(els, { autoAlpha: 0.35, y: 16 });
    const end = { autoAlpha: 1, y: 0, clearProps: "transform", overwrite: true };
    const finish = (b, sts) => { G.set(b, end); sts.forEach((s) => s.kill()); };
    ST.batch(els, {
      start: "top 100%",
      onEnter: (b) => G.to(b, { ...end, stagger: 0.05, duration: 0.45, ease: "power3.out" }),
      onLeave: finish,
      onEnterBack: finish,
    });
  }

  /* ================= dock, contact ================= */
  function initDock() {                                            // phone bottom bar shows once the hero is behind us, and steps aside at the contact buttons
    const hero = $("#top");
    const contact = $("#contact");
    if (contact && hasIO) new IntersectionObserver(([e]) => document.body.classList.toggle("at-contact", e.isIntersecting), { rootMargin: "0px 0px -12% 0px" }).observe(contact);
    if (!hero) return;
    if (ST) { ST.create({ trigger: hero, start: "bottom 80%", end: "max", toggleClass: { targets: document.body, className: "past-hero" } }); return; }
    if (hasIO) new IntersectionObserver(([e]) => document.body.classList.toggle("past-hero", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(hero);
  }

  function initContact() {
    $$("[data-contact-email]").forEach((a) => {
      a.href = "mailto:" + CONTACT.email;
      if (a.hasAttribute("data-contact-text")) a.textContent = CONTACT.email;
    });
    $$("[data-contact-telegram]").forEach((a) => { a.href = CONTACT.telegram; });
    document.addEventListener("click", (e) => {                    // "Work with me" inside the player: close it, then go to the contact section
      const a = e.target.closest && e.target.closest("a[data-contact]");
      const pl = $("#player");
      if (!a || !pl || !pl.open) return;
      e.preventDefault();
      const close = $("#plClose");
      if (close) close.click();
      setTimeout(() => { const c = $("#contact"); if (c) c.scrollIntoView({ behavior: smooth(), block: "start" }); }, 420);
    });
  }

  /* ================= failing open: anything went wrong, show everything final and scroll natively ================= */
  const MOTION_SEL = ".rv, .tile, .how, .how-dot, .how-t, .how-line, .h1l, .hero-avatar, .hero-name, .hero-lead, .hero-names li, .hero-cta > *, .take, .hooks-body, .same-faces *";
  const failOpen = () => {
    if (ST) ST.getAll().forEach((t) => { if (!(t.vars && t.vars.toggleClass)) t.kill(); });
    if (G) G.killTweensOf(MOTION_SEL);
    $$(MOTION_SEL).forEach((n) => {
      ["opacity", "visibility", "transform", "clip-path", "background-color"].forEach((p) => n.style.removeProperty(p));
      n.style.removeProperty("--draw");
    });
    $$(".wall-col").forEach((n) => { n.style.transform = ""; });
    $$("[data-rail]").forEach((n) => { n.style.overflowX = ""; });
    const w = $(".hm-wall");
    if (w) w.classList.remove("is-live");
    finals.forEach((f) => f());
  };
  const safe = (fn) => { try { fn(); } catch (err) { failOpen(); } };

  /* ================= matchMedia: everything scroll- or motion-driven ================= */
  function motion(rails) {
    const mm = G.matchMedia();
    let introDone = false;
    G.defaults({ ease: "power3.out", duration: 0.6 });
    mm.add({ desktop: "(min-width: 1024px)", ok: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
      const { desktop, ok, reduce } = ctx.conditions;
      const ac = new AbortController();
      const parts = [];
      const add = (p) => { if (p) parts.push(p); return p; };
      safe(() => {
        if (ok) {
          add(wallColumns(ac.signal, false));
          if (desktop) wallParallax();
          if (!introDone) { introDone = true; heroIntro(); }
        } else if (reduce) {                                       // wall stays static posters; the button can still start it
          const btn = $(".wall-pause");
          paintPause(btn, true);
          if (btn) btn.addEventListener("click", () => add(wallColumns(ac.signal, false)), { once: true, signal: ac.signal });
        }
        countUp(reduce);
        takes(reduce);
        if (ok) { hooks(); faces(); }
        rails.forEach((r) => {                                     // page order: top to bottom
          if (!reduce && (r.originals.length > 3 || r.el.closest("#ugc"))) add(buildLoop(r, false, ac.signal));
        });
        if (ok) { howBatch(); tileBatch(); }
      });
      const refit = () => { if (!ac.signal.aborted) parts.forEach((p) => p.refit && p.refit()); };
      let w = innerWidth;
      window.addEventListener("resize", debounce(() => { if (innerWidth !== w) { w = innerWidth; refit(); } }, 250), { signal: ac.signal });
      window.addEventListener("load", () => { refit(); refreshSoon(); }, { signal: ac.signal, once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { refit(); refreshSoon(); }, () => {});
      return () => { ac.abort(); parts.forEach((p) => p.destroy()); };
    });
  }

  function warmPosters() {                                         // after load, fetch every remaining poster so fast scrolling never lands on an empty tile
    const go = () => $$("img[loading=lazy]").forEach((i) => { i.loading = "eager"; });
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200));
    if (document.readyState === "complete") idle(); else window.addEventListener("load", idle, { once: true });
  }

  function start() {
    resolveMedia();
    warmPosters();
    initContact();
    initSecnav();
    const rails = $$("[data-rail]").map(initRail).filter(Boolean);
    initScheduler();
    schedule();
    if (!G || !ST) { initDock(); return; }
    try {
      G.registerPlugin(...[ST, window.Draggable, window.InertiaPlugin, window.SplitText].filter(Boolean));
      initDock();
      motion(rails);
      window.addEventListener("load", refreshSoon);
    } catch (err) {
      failOpen();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
