/* Nico Tan Leonardia · home page motion. Vanilla JS, one IIFE. Loads before site.js so the clones exist when site.js builds
   its registry and binds previews. Every part fails open: without GSAP the page is fully visible and rails scroll natively.
   Opacity is only ever set from here, never from CSS.
   No pins, no scrub-driven reveals: the only scroll-linked motion is the hero parallax (desktop) and the column speed-up. */
(() => {
  "use strict";

  /* ================= SWAP POINTS: contact details and the media files that are stand-ins today ================= */
  const CONTACT = { email: "nlmino67@gmail.com", telegram: "https://t.me/+639171776426" };
  const MEDIA = {
    // STAND-INS (existing files). Replace each with the FINAL path in the comment when the render lands.
    heroWide: { src: "media/hero_wide.mp4", poster: "img/hero_wide.jpg" },       // FINAL media/hero_wide.mp4  + img/hero_wide.jpg
    heroTall: { src: "media/hero_tall.mp4", poster: "img/hero_tall.jpg" },   // FINAL media/hero_tall.mp4  + img/hero_tall.jpg
    reel: { src: "v/reel_v2.mp4", poster: "p/reel_v2.jpg" },                           // FINAL v/reel_v2.mp4        + p/reel_v2.jpg
    rawFinal: { src: "v/raw_to_final.mp4", poster: "p/raw_to_final.jpg" },       // FINAL v/raw_to_final.mp4   + p/raw_to_final.jpg
  };
  // Proof captions for the real hero cut (4 pieces, 26 s loop). Keep captionsReady false while heroWide/heroTall are stand-ins:
  // the captions describe the real pieces and would be false on a stand-in film.
  const HERO_CAPTIONS = {
    captionsReady: true,
    cues: [
      [0, 7, "Baytree Cars, YouTube Short, 2.5M views"],
      [7, 13, "Baytree Cars, YouTube Short, 2.2M views"],
      [13, 20, "George Cordon, YouTube long-form, every 2026 episode"],
      [20, 26, "Italian skincare brand, 5-minute drama ad, AI-generated"],
    ],
  };
  const OVERRIDE = window.NICO_MEDIA_OVERRIDE || null;      // test hook only
  if (OVERRIDE && OVERRIDE.captionsReady) HERO_CAPTIONS.captionsReady = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const NET = navigator.connection || {};
  const lowData = () => Boolean(NET.saveData) || ["slow-2g", "2g"].includes(NET.effectiveType);
  const hasIO = "IntersectionObserver" in window;
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const HOME = (window.NICO_HOME = { loops: [], rails: [], cols: [], playing: () => $$("video").filter((v) => !v.paused && !v.ended && v.closest("#player") === null).length });
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

  /* ================= video scheduler: at most 3 videos playing (2 under 600px), hero first, then the most visible ================= */
  const S = { modal: false, heroOn: false, heroRatio: 0 };
  const maxPlaying = () => (matchMedia("(max-width: 599px)").matches ? 2 : 3);
  const autoOk = () => !RM.matches && !lowData();
  let heroV = null;
  let vids = [];

  const ensureSrc = (v) => { if (!v.getAttribute("src") && v.dataset.src) { v.src = v.dataset.src; v.preload = "auto"; } };
  const playV = (v) => { ensureSrc(v); if (v.paused) quiet(v.play()); };
  const stopV = (v) => { if (!v.paused) v.pause(); };

  function schedule() {
    const gate = !S.modal && !document.hidden;
    const pick = [];
    if (gate && heroV && S.heroOn && S.heroRatio > 0.05) pick.push(heroV);
    if (gate && autoOk()) {
      vids.filter((v) => v._ratio >= 0.35).sort((a, b) => b._ratio - a._ratio).forEach((v) => { if (pick.length < maxPlaying()) pick.push(v); });
    }
    [heroV, ...vids].filter(Boolean).forEach((v) => (pick.includes(v) ? playV(v) : stopV(v)));
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
    vids = $$("video.sv");
    vids.forEach((v) => { v.muted = true; v._ratio = hasIO ? 0 : 1; });
    if (!hasIO) { schedule(); return; }
    const near = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && autoOk()) ensureSrc(e.target); }), { rootMargin: "100% 0px 100% 0px" });
    const seen = new IntersectionObserver((es) => { es.forEach((e) => { e.target._ratio = e.isIntersecting ? e.intersectionRatio : 0; }); schedule(); }, { threshold: [0, 0.35, 0.6, 1] });
    vids.forEach((v) => { near.observe(v); seen.observe(v); });
    document.addEventListener("visibilitychange", schedule);
    const pl = $("#player");
    if (pl && "MutationObserver" in window) new MutationObserver(() => { S.modal = pl.open; schedule(); }).observe(pl, { attributes: true, attributeFilter: ["open"] });
  }

  /* ================= hero film ================= */
  function initHero() {
    heroV = $("#heroFilm");
    if (!heroV) return;
    const btn = $("#heroBtn");
    const proof = $("#heroProof");
    const wide = matchMedia("(min-width: 600px)");
    heroV.muted = true;
    S.heroOn = autoOk();
    const paint = () => {
      if (!btn) return;
      btn.setAttribute("aria-pressed", String(!S.heroOn));
      btn.setAttribute("aria-label", S.heroOn ? "Pause film" : "Play film");
    };
    const load = () => {
      const m = wide.matches ? MEDIA.heroWide : MEDIA.heroTall;
      heroV.poster = m.poster;
      if (m.src === heroV.dataset.k) return;
      heroV.dataset.k = m.src;
      heroV.dataset.src = m.src;
      heroV.removeAttribute("src");
      if (autoOk()) ensureSrc(heroV);
    };
    load();
    if (wide.addEventListener) wide.addEventListener("change", () => { load(); schedule(); });
    if (btn) btn.addEventListener("click", () => { S.heroOn = !S.heroOn; paint(); schedule(); });
    if (hasIO) new IntersectionObserver(([e]) => { S.heroRatio = e.isIntersecting ? e.intersectionRatio : 0; schedule(); }, { threshold: [0, 0.05, 0.35] }).observe($("#top") || heroV);
    else S.heroRatio = 1;
    if (proof && HERO_CAPTIONS.captionsReady) {
      let cur = -1;
      heroV.addEventListener("timeupdate", () => {
        const t = heroV.currentTime;
        const i = HERO_CAPTIONS.cues.findIndex(([a, b]) => t >= a && t < b);
        if (i === cur || i < 0) return;
        cur = i;
        proof.textContent = HERO_CAPTIONS.cues[i][2];
        proof.hidden = false;
      });
    }
    const onRM = () => { if (RM.matches) S.heroOn = false; paint(); schedule(); };
    if (RM.addEventListener) RM.addEventListener("change", onRM);
    paint();
  }

  /* ================= volume wall: three columns drift at their own speed, scrolling fast pushes them ================= */
  function wallColumns(signal) {
    const wall = $(".vol");
    const stacks = wall ? $$(".vol-stack", wall) : [];
    if (!stacks.length) return null;
    const durs = $$(".vol-col", wall).map((c) => Number(c.dataset.dur) || 54);
    const clones = [];
    stacks.forEach((st) => Array.from(st.children).forEach((li) => { const c = cloneItem(li); clones.push(c); st.appendChild(c); }));
    wall.classList.add("is-live");
    const tweens = stacks.map((st, i) => G.to(st, { yPercent: -50, repeat: -1, ease: "none", duration: durs[i], paused: true }));
    HOME.cols = tweens;
    let inView = false, boost = 1, boostT = 1, hov = 1, hovT = 1, idle = 0, userOff = false;
    const tick = () => {
      boost += (boostT - boost) * 0.12;
      hov += (hovT - hov) * 0.15;
      const ts = boost * hov;
      tweens.forEach((t) => t.timeScale(ts));
    };
    const sync = () => {
      const on = inView && !userOff && !S.modal && !document.hidden;
      tweens.forEach((t) => t.paused(!on));
      G.ticker.remove(tick);
      if (on) G.ticker.add(tick);
    };
    const view = ST.create({ trigger: wall, start: "top bottom", end: "bottom top", onToggle: (s) => { inView = s.isActive; sync(); } });
    inView = view.isActive;
    const vel = ST.create({ start: 0, end: "max", onUpdate: (s) => {
      boostT = 1 + G.utils.clamp(0, 2, Math.abs(s.getVelocity()) / 1200);
      clearTimeout(idle);
      idle = setTimeout(() => { boostT = 1; }, 200);
    } });
    const field = $(".vol-wall", wall) || wall;                    // hover and focus act on the columns, not the heading beside them
    const mouse = (v) => (e) => { if (e.pointerType === "mouse") hovT = v; };
    field.addEventListener("pointerenter", mouse(0.3), { signal });
    field.addEventListener("pointerleave", mouse(1), { signal });
    field.addEventListener("focusin", () => { hovT = 0; }, { signal });
    field.addEventListener("focusout", () => { hovT = 1; }, { signal });
    const btn = $(".vol-pause", wall);
    if (btn) btn.addEventListener("click", () => {
      userOff = !userOff;
      btn.setAttribute("aria-pressed", String(userOff));
      btn.setAttribute("aria-label", userOff ? "Play moving work" : "Pause moving work");
      sync();
    }, { signal });
    document.addEventListener("visibilitychange", sync, { signal });
    const pl = $("#player");
    const mo = pl && "MutationObserver" in window ? new MutationObserver(sync) : null;
    if (mo) mo.observe(pl, { attributes: true, attributeFilter: ["open"] });
    sync();
    return {
      destroy() {
        clearTimeout(idle);
        G.ticker.remove(tick);
        if (mo) mo.disconnect();
        view.kill();
        vel.kill();
        tweens.forEach((t) => t.kill());
        G.set(stacks, { clearProps: "transform" });
        clones.forEach((c) => c.remove());
        wall.classList.remove("is-live");
        HOME.cols = [];
      },
    };
  }

  /* ================= reveals, dock, contact ================= */
  function revealBatch() {                                         // text only, never fully hidden: .35 -> 1, once
    const els = $$(".rv");
    if (!els.length) return;
    G.set(els, { autoAlpha: 0.35, y: 12 });
    const show = (b, sts, anim) => {
      if (anim) G.to(b, { autoAlpha: 1, y: 0, stagger: 0.05, duration: 0.45, ease: "power3.out", overwrite: true });
      else G.set(b, { autoAlpha: 1, y: 0, overwrite: true });
      sts.forEach((s) => s.kill());
    };
    ST.batch(els, { start: "top 100%", onEnter: (b, sts) => show(b, sts, true), onLeave: (b, sts) => show(b, sts, false) });
  }

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

  /* ================= matchMedia: everything scroll- or motion-driven ================= */
  function motion(rails) {
    const mm = G.matchMedia();
    mm.add({ desktop: "(min-width: 1024px)", ok: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
      const { desktop, ok, reduce } = ctx.conditions;
      const ac = new AbortController();
      const parts = [];
      if (ok && desktop && $(".hm-film-px") && $("#top")) {
        G.to(".hm-film-px", { yPercent: -8, ease: "none", scrollTrigger: { trigger: "#top", start: "top top", end: "bottom top", scrub: true } });
      }
      if (ok) { const w = wallColumns(ac.signal); if (w) parts.push(w); }
      rails.forEach((r) => parts.push(buildLoop(r, reduce, ac.signal)));      // page order: top to bottom
      if (ok) revealBatch();
      const refit = () => { if (!ac.signal.aborted) parts.forEach((p) => p.refit && p.refit()); };
      let w = innerWidth;
      window.addEventListener("resize", debounce(() => { if (innerWidth !== w) { w = innerWidth; refit(); } }, 250), { signal: ac.signal });
      window.addEventListener("load", () => { refit(); refreshSoon(); }, { signal: ac.signal, once: true });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit, () => {});
      return () => { ac.abort(); parts.forEach((p) => p.destroy()); };
    });
  }

  const failOpen = () => {                                         // anything went wrong: show everything, scroll natively
    $$(".rv, .hm-copy > *").forEach((n) => { n.style.opacity = ""; n.style.visibility = ""; n.style.transform = ""; });
    $$("[data-rail]").forEach((n) => { n.style.overflowX = ""; });
    const w = $(".vol");
    if (w) w.classList.remove("is-live");
  };

  function warmPosters() {                                         // after load, fetch every remaining poster so fast scrolling never lands on an empty tile
    const go = () => $$("img[loading=lazy]").forEach((i) => { i.loading = "eager"; });
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200));
    if (document.readyState === "complete") idle(); else window.addEventListener("load", idle, { once: true });
  }

  function start() {
    resolveMedia();
    warmPosters();
    initContact();
    const rails = $$("[data-rail]").map(initRail).filter(Boolean);
    initScheduler();
    initHero();
    schedule();
    if (!G || !ST) { initDock(); return; }
    try {
      G.registerPlugin(...[ST, window.Draggable, window.InertiaPlugin].filter(Boolean));
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
