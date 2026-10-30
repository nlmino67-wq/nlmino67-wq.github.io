/* Nico Tan Leonardia · home page motion. Vanilla JS, one IIFE. Loads before site.js so the rail clones exist
   when site.js builds its registry and binds previews. Every part fails open: without GSAP the page is fully
   visible and rails scroll natively. Opacity is only ever set from here, never from CSS. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const NET = navigator.connection || {};
  const lowData = () => Boolean(NET.saveData) || ["slow-2g", "2g"].includes(NET.effectiveType);
  const hasIO = "IntersectionObserver" in window;
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const HOME = (window.NICO_HOME = { loops: [], rails: [], wall: { tracks: [], tweens: [], videos: [] } });
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

  function buildPan(r, signal) {                                   // desktop: the section pins and the track slides
    const { el, track, sec } = r;
    const gutter = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const dist = () => Math.max(0, track.scrollWidth - innerWidth + 2 * gutter);   // last tile ends one gutter inside the screen
    const PAN_PACE = 0.7;                                          // tiles travel 1/0.7 px per scrolled px: about 2 flings per screen of tiles
    if (dist() < 40) return null;
    el.style.overflowX = "hidden";
    el.scrollLeft = 0;
    lockScroll(el, signal);
    const end = () => "+=" + Math.round(dist() * PAN_PACE);
    const tw = G.to(track, { x: () => -dist(), ease: "none",
      scrollTrigger: { trigger: sec, start: "top top", end, pin: true, scrub: 0.8, invalidateOnRefresh: true } });
    const line = $(".pan-progress", sec);
    const lw = line && G.fromTo(line, { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 1, ease: "none",
      scrollTrigger: { trigger: sec, start: "top top", end, scrub: true, invalidateOnRefresh: true } });
    const goTo = (p) => { const s = tw.scrollTrigger; window.scrollTo({ top: s.start + G.utils.clamp(0, 1, p) * (s.end - s.start), behavior: smooth() }); };
    r.next = () => { const d = dist(); if (d) goTo(tw.scrollTrigger.progress + Math.min(el.clientWidth * 0.75, 900) / d); };
    r.prev = () => { const d = dist(); if (d) goTo(tw.scrollTrigger.progress - Math.min(el.clientWidth * 0.75, 900) / d); };
    r.to = (i) => { const it = r.originals[i], d = dist(); if (it && d) goTo((relX(r, it) - gutter) / d); };
    r.jump = (edge) => goTo(edge < 0 ? 0 : 1);
    r.reveal = (it) => { const b = it.getBoundingClientRect(); if (b.left < 0 || b.right > innerWidth) r.to(r.originals.indexOf(it)); };
    return {
      destroy() {
        [tw, lw].forEach((t) => { if (t) { if (t.scrollTrigger) t.scrollTrigger.kill(true); t.kill(); } });
        G.set([track, line].filter(Boolean), { clearProps: "transform" });
        el.style.overflowX = "";
        setNative(r);
      },
    };
  }

  /* ================= hero wall: strips play, drift, speed up with scroll, slow on hover ================= */
  const W = { vis: !hasIO, loaded: document.readyState === "complete", paused: false, modal: false };

  function wallSync() {
    const playOk = W.loaded && W.vis && !W.paused && !document.hidden && !W.modal && !lowData();
    HOME.wall.videos.forEach((v) => { if (playOk) quiet(v.play()); else if (!v.paused) v.pause(); });
    const run = W.vis && !W.paused && !document.hidden && !W.modal;
    HOME.wall.tweens.forEach((t) => t.paused(!run));
  }

  function initWall() {
    const wall = $(".wall");
    if (!wall) return;
    if (matchMedia("(max-width: 599px)").matches) $$(".wall-row", wall).slice(1).forEach((row) => row.remove());   // phone: one row, second never loads
    HOME.wall.tracks = $$(".wall-track", wall);
    HOME.wall.videos = $$("video", wall);
    HOME.wall.videos.forEach((v) => {
      v.muted = true;
      if (v.readyState >= 1) refreshSoon(); else v.addEventListener("loadedmetadata", refreshSoon, { once: true });
    });
    const hero = $("#top") || wall;
    if (hasIO) new IntersectionObserver(([e]) => { W.vis = e.isIntersecting; wallSync(); }).observe(hero);
    const pl = $("#player");
    if (pl && "MutationObserver" in window) new MutationObserver(() => { W.modal = pl.open; wallSync(); }).observe(pl, { attributes: true, attributeFilter: ["open"] });
    document.addEventListener("visibilitychange", wallSync);
    window.addEventListener("load", () => { W.loaded = true; wallSync(); });
    const btn = $("[data-wall-pause]");
    if (btn) btn.addEventListener("click", () => {
      W.paused = !W.paused;
      btn.setAttribute("aria-pressed", String(W.paused));
      btn.setAttribute("aria-label", W.paused ? "Play background" : "Pause background");
      wallSync();
    });
    wallSync();
  }

  function wallDrift(signal) {
    const tracks = HOME.wall.tracks;
    const hero = $("#top");
    if (!tracks.length || !hero) return;
    const tweens = tracks.map((t, i) => G.fromTo(t, { xPercent: i % 2 ? -50 : 0 }, { xPercent: i % 2 ? 0 : -50, ease: "none", duration: i % 2 ? 80 : 64, repeat: -1 }));
    HOME.wall.tweens = tweens;
    let hover = false, kick = 0;
    const speed = (ts, d) => G.to(tweens, { timeScale: ts, duration: d, overwrite: true });
    ST.create({ trigger: hero, start: "top top", end: "bottom top", onUpdate: (s) => {
      const ts = G.utils.clamp(1, 3, 1 + Math.abs(s.getVelocity()) / 900);
      if (ts < 1.05) return;
      tweens.forEach((t) => t.timeScale(ts));
      clearTimeout(kick);
      kick = setTimeout(() => speed(hover ? 0.35 : 1, 0.8), 80);
    } });
    const mouse = (on) => (e) => { if (e.pointerType === "mouse") { hover = on; speed(on ? 0.35 : 1, 0.6); } };
    hero.addEventListener("pointerenter", mouse(true), { signal });
    hero.addEventListener("pointerleave", mouse(false), { signal });
    signal.addEventListener("abort", () => { clearTimeout(kick); HOME.wall.tweens = []; });
    wallSync();
  }

  /* ================= hero intro: runs once, outside matchMedia so a breakpoint change cannot re-hide anything =================
     It never waits for fonts, video or load. A plain timer (not the GSAP ticker, which needs a painted frame) forces
     everything visible 800ms after this script runs, so the hero text can never stay hidden. */
  const INTRO_MAX_MS = 800;
  function heroIntro() {
    if (RM.matches) return;
    const wall = $(".wall"), h1 = $("#h1");
    const small = [$(".hero-name"), $(".hero-lead")].filter(Boolean);
    const btns = $$(".hero-cta > *");
    const all = [wall, h1, ...small, ...btns].filter(Boolean);
    if (!all.length) return;
    let split = null;
    let tl = null;
    let over = false;
    const finish = () => {                                         // idempotent: always ends fully visible, no transforms
      if (over) return;
      over = true;
      clearTimeout(safety);
      if (tl) tl.kill();
      if (split) split.revert();
      G.set(all, { autoAlpha: 1 });
      G.set(all.filter((n) => n !== wall), { clearProps: "transform" });   // the wall keeps its parallax transform
    };
    const safety = setTimeout(finish, INTRO_MAX_MS);
    try {
      G.set(all, { autoAlpha: 0 });
      tl = G.timeline({ defaults: { ease: "power3.out" }, onComplete: finish });
      if (wall) tl.to(wall, { autoAlpha: 1, duration: 0.5, ease: "power2.out" }, 0);
      if (h1) {
        G.set(h1, { autoAlpha: 1 });
        if (window.SplitText) split = window.SplitText.create(h1, { type: "lines", mask: "lines" });
        if (split) tl.from(split.lines, { yPercent: 100, duration: 0.6, ease: "expo.out", stagger: 0.06 }, 0);
        else tl.from(h1, { y: 14, autoAlpha: 0, duration: 0.5 }, 0);
      }
      if (small.length) tl.fromTo(small, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45 }, 0.15);
      if (btns.length) tl.fromTo(btns, { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4 }, 0.3);
    } catch (err) { finish(); }
    RM.addEventListener("change", () => { if (RM.matches) finish(); });
  }

  /* ================= case, reveals, extras ================= */
  function caseTimeline() {                                        // desktop only: the case pins and beats light up in turn
    const sec = $("#longform");
    const beats = sec ? $$("[data-beat]", sec) : [];
    if (!beats.length) return;
    G.set(beats, { autoAlpha: 0.3, x: 24 });
    const tl = G.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: sec, start: "top top", end: "+=1400", pin: true, scrub: 0.6 } });
    beats.forEach((b, i) => {
      tl.to(b, { autoAlpha: 1, x: 0, duration: 1 }, i);
      if (i) tl.to(beats[i - 1], { autoAlpha: 0.45, duration: 1 }, i);
    });
    tl.to({}, { duration: 0.5 });
  }

  function revealBatch(desktop) {
    const els = $$(".rv").filter((el) => !(desktop && el.closest("[data-beat]")));
    if (!els.length) return;
    G.set(els, { autoAlpha: 0, y: 20 });
    ST.batch(els, { start: "top 88%", once: true,
      onEnter: (b) => G.to(b, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.7, ease: "power3.out" }) });
  }

  function initCaseVideo() {
    const vid = $("#longform video");
    if (!vid || !hasIO) return;
    vid.muted = true;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !RM.matches && !lowData() && !W.modal) quiet(vid.play()); else vid.pause();
    }, { threshold: 0.4 }).observe(vid);
  }

  function initDock() {                                            // phone bottom bar shows once the hero is behind us
    const hero = $("#top");
    if (!hero) return;
    if (ST) { ST.create({ trigger: hero, start: "bottom 80%", end: "max", toggleClass: { targets: document.body, className: "past-hero" } }); return; }
    if (hasIO) new IntersectionObserver(([e]) => document.body.classList.toggle("past-hero", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(hero);
  }

  /* ================= matchMedia: everything scroll- or motion-driven ================= */
  function motion(rails) {
    const mm = G.matchMedia();
    mm.add({ desktop: "(min-width: 1024px)", ok: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
      const { desktop, ok, reduce } = ctx.conditions;
      const ac = new AbortController();
      const parts = [];
      if (ok) {
        wallDrift(ac.signal);
        if (desktop && $(".wall") && $("#top")) {
          G.to(".wall", { yPercent: -10, ease: "none", scrollTrigger: { trigger: "#top", start: "top top", end: "bottom top", scrub: true } });
        }
      }
      rails.filter((r) => r.kind !== "pan").forEach((r) => parts.push(buildLoop(r, reduce, ac.signal)));   // page order: top to bottom
      if (ok && desktop) caseTimeline();
      if (ok && desktop) rails.filter((r) => r.kind === "pan").forEach((r) => { const p = buildPan(r, ac.signal); if (p) parts.push(p); });
      if (ok) revealBatch(desktop);
      const refit = () => { if (!ac.signal.aborted) parts.forEach((p) => p.refit && p.refit()); };
      let w = innerWidth;
      window.addEventListener("resize", debounce(() => { if (innerWidth !== w) { w = innerWidth; refit(); } }, 250), { signal: ac.signal });
      window.addEventListener("load", () => { refit(); refreshSoon(); }, { signal: ac.signal, once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit, () => {});
      return () => { ac.abort(); parts.forEach((p) => p.destroy()); };
    });
  }

  const failOpen = () => {                                         // anything went wrong: show everything, scroll natively
    $$(".wall, #h1, .hero-name, .hero-lead, .hero-cta > *, .rv, [data-beat]").forEach((n) => {
      n.style.opacity = "";
      n.style.visibility = "";
      n.style.transform = "";
    });
    $$("[data-rail]").forEach((n) => { n.style.overflowX = ""; });
  };

  function start() {
    const rails = $$("[data-rail]").map(initRail).filter(Boolean);
    initWall();
    initCaseVideo();
    if (!G || !ST) { initDock(); return; }
    try {
      G.registerPlugin(...[ST, window.Draggable, window.InertiaPlugin, window.SplitText].filter(Boolean));
      initDock();
      heroIntro();
      motion(rails);
      window.addEventListener("load", refreshSoon);
    } catch (err) {
      failOpen();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
