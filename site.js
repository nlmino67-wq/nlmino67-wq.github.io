/* Nico Tan Leonardia · portfolio. Vanilla JS, no build step, one IIFE, no globals.
   Modules: registry · player · router · hero · previews · spy · reveal · motionPref.
   The page is fully usable without this file: every tile is a real link to its media. */
(() => {
  "use strict";

  /* ================= utils ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mq = (q) => window.matchMedia(q);
  const RM = mq("(prefers-reduced-motion: reduce)");
  const FINE = mq("(hover: hover) and (pointer: fine)");
  const COARSE = mq("(pointer: coarse)");
  const NET = navigator.connection || {};
  const saveData = () => Boolean(NET.saveData);
  const slowNet = () => ["slow-2g", "2g", "3g"].includes(NET.effectiveType);
  const pad = (n) => String(n).padStart(2, "0");
  const hasIO = "IntersectionObserver" in window;
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
  const ICON = {
    play: "M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z",
    pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
    chevR: "M9 18l6-6-6-6",
    replay: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  };
  const svg = (n) => `<svg class="i i-${n}${n === "play" || n === "pause" ? " i-fill" : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

  const SET_NAMES = {
    showreels: "Showreels", ugc: "AI UGC ads", product: "Product ads", statics: "Static ads",
    animated: "3D animated ad", faceless: "Faceless YouTube", baytree: "Baytree Cars", george: "George Cordon",
    renders: "Architecture", onsite: "Filmed on site", property: "AI property reel",
  };
  const HOME = {
    showreels: "top", ugc: "ugc", product: "product", statics: "product", animated: "animated", faceless: "faceless",
    baytree: "baytree", george: "george", renders: "architecture", onsite: "capita", property: "property",
  };
  const ALIASES = {
    tools: "process", editing: "clients", arch: "architecture", compare: "george", shorts: "george",
    animGrid: "animated", ugcGrid: "ugc", prodGrid: "product", aiGrid: "faceless", capitaGrid: "capita",
  };
  const AR = { "16x9": "16:9", "9x16": "9:16", "3x4": "3:4", "4x5": "4:5" };

  let R = null;                                                     // registry
  const PL = { st: { id: null, pushed: false, opener: null, dispose: null, backTimer: 0, closing: false, openY: 0 } };
  const HERO = { el: null, st: null };
  const PV = { cur: null, vid: null, timer: 0, skipEl: null, skipUntil: 0 };

  /* ================= segment playlist (stage + player) ================= */
  // A frame is "kept" only inside a segment; everything else (presenter, portal, crowd) must never be shown.
  // It ends where the playlist advances, so a failed jump never presents the first frame after a cut.
  const inKept = (segs, t, eps = 0.05) => segs.some(([s, e]) => t >= s - 0.02 && t < e - eps);
  // Seek only where the browser can (servers without Range support make far seeks snap back to 0 and loop).
  function seekIfCan(video, t) {
    const r = video.seekable;
    for (let k = 0; k < r.length; k += 1) {
      if (t >= r.start(k) && t <= r.end(k)) { video.currentTime = t; return true; }
    }
    return false;
  }

  function watchSegments(video, segs, { loop, onEnd, onTick }) {
    let i = 0;
    let stopped = false;
    let fixes = 0;
    const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    const EPS = hasRVFC ? 0.05 : 0.3;
    const advance = () => {
      i += 1;
      fixes = 0;
      if (i < segs.length) { seekIfCan(video, segs[i][0]); return; }
      i = 0;
      if (!loop) { video.pause(); onEnd(); return; }
      if (!seekIfCan(video, segs[0][0])) video.currentTime = 0;
      quiet(video.play());
    };
    const schedule = () => (hasRVFC ? video.requestVideoFrameCallback(check) : video.addEventListener("timeupdate", check, { once: true }));
    const sync = (t) => {                                          // derive the segment from the playhead, never from a stale index
      const k = segs.findIndex(([s, e]) => t >= s - EPS && t < e);
      if (k >= 0) { i = k; if (t >= segs[i][1] - EPS) advance(); return; }
      const n = segs.findIndex(([s]) => s > t);                    // in a gap: on to the next kept segment
      i = n < 0 ? segs.length - 1 : n - 1;
      advance();
    };
    function check() {
      if (stopped) return;
      if (!video.paused && !video.seeking) sync(video.currentTime);   // mid-seek: the user's target wins (onSeeked snaps it)
      const kept = inKept(segs, video.currentTime, EPS);
      if (kept) fixes = 0;
      if (onTick) onTick(kept);
      schedule();
    }
    const onSeeked = () => {
      const t = video.currentTime;
      const k = segs.findIndex(([, e]) => t < e);
      i = k < 0 ? segs.length - 1 : k;
      if (t < segs[i][0] - EPS && fixes < 3) { fixes += 1; seekIfCan(video, segs[i][0]); }
      if (onTick) onTick(inKept(segs, video.currentTime, EPS));
    };
    const onTime = () => { if (!stopped && onTick) onTick(inKept(segs, video.currentTime, EPS)); };
    const onEnded = () => { if (!stopped) { i = segs.length - 1; advance(); } };
    const subs = [["seeked", onSeeked], ["ended", onEnded], ["timeupdate", onTime]];
    subs.forEach(([n, f]) => video.addEventListener(n, f));
    schedule();
    return () => { stopped = true; subs.forEach(([n, f]) => video.removeEventListener(n, f)); };
  }

  /* ================= registry ================= */
  function buildRegistry() {
    const node = $("#items");
    let items = [];
    try { items = node ? JSON.parse(node.textContent) : []; } catch (err) { items = []; }
    const byId = new Map(items.map((it) => [it.id, it]));
    const sets = [{ key: "showreels", ids: ["reel_ai", "reel"].filter((id) => byId.has(id)) }];
    $$("[data-set]").forEach((box) => {
      const ids = $$("[data-id]", box).filter((el) => el.closest("[data-set]") === box).map((el) => el.dataset.id).filter((id) => byId.has(id));
      if (ids.length) sets.push({ key: box.dataset.set, ids });
    });
    const seq = sets.flatMap((s) => s.ids.map((id, i) => ({ id, set: s.key, i, n: s.ids.length })));
    const index = new Map(seq.map((p, k) => [p.id, k]));
    return {
      byId, seq,
      pos: (id) => seq[index.get(id)] || null,
      at: (id, d) => (index.has(id) ? seq[index.get(id) + d] || null : null),
    };
  }
  const homeOf = (id) => HOME[(R.pos(id) || {}).set] || "top";
  function homeHeading(anchor) {
    const box = document.getElementById(anchor);
    if (!box) return null;
    const h = box.matches("h1, h2, h3") ? box : box.querySelector("h1, h3");
    if (h && !h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    return h;
  }

  /* ================= player ================= */
  const curItem = () => R.byId.get(PL.st.id);
  const say = (msg) => { PL.live.textContent = ""; requestAnimationFrame(() => { PL.live.textContent = msg; }); };

  function plInit() {
    const d = $("#player");
    if (!d || typeof d.showModal !== "function") return;
    Object.assign(PL, {
      d, media: $("#plMedia"), v: $("#plv"), img: $("#pli"), end: $("#plEnd"), err: $("#plErr"),
      live: $("#plLive"), copy: $("#plCopy"), prev: $("#plPrev"), next: $("#plNext"), count: $("#plCount"),
      tag: $("#plTag"), title: $("#plTitle"), meta: $("#plMeta"), desc: $("#plDesc"), bar: $$(".pl-bar [data-step]"),
    });
    plBind();
  }

  function plBind() {
    const { d, v } = PL;
    $("#plClose").addEventListener("click", plClose);
    PL.prev.addEventListener("click", () => plStep(-1));
    PL.next.addEventListener("click", () => plStep(1));
    PL.bar.forEach((b) => b.addEventListener("click", () => plStep(Number(b.dataset.step))));
    d.addEventListener("cancel", (e) => { if (!e.cancelable) return; e.preventDefault(); plClose(); });
    d.addEventListener("close", plOnNativeClose);
    d.addEventListener("click", (e) => { if (e.target === d || e.target.matches(".pl, .pl-stage, .pl-media")) plClose(); });
    d.addEventListener("keydown", plKeys);
    v.addEventListener("ended", () => { const it = curItem(); if (it && !it.segments) plShowEnd(); });
    v.addEventListener("seeking", plHideEnd);
    v.addEventListener("play", plHideEnd);
    v.addEventListener("error", () => { if (PL.st.id && v.getAttribute("src")) PL.err.hidden = false; });
    $("#plRetry").addEventListener("click", plRetry);
    PL.copy.addEventListener("click", plCopy);
    plBindSwipe();
  }

  function plOpen(id, opts = {}) {
    const it = R.byId.get(id);
    if (!it || !PL.d) return;
    heroSuspend();
    pvStop();
    const wasOpen = PL.d.open;
    if (wasOpen) plStopMedia();
    else Object.assign(PL.st, { opener: opts.opener || null, pushed: Boolean(opts.pushed), openY: window.scrollY });
    PL.st.id = id;
    plFill(it);
    plLoad(it);
    if (!wasOpen) PL.d.showModal();
    const p = R.pos(id);
    say(`Now playing: ${it.title}, ${p.i + 1} of ${p.n}`);
  }

  function plMetaText(it) {
    const ar = AR[it.ar] || "";
    if (it.kind === "yt") return `${ar} · YouTube`;
    if (it.kind === "img") return `${ar} · Image`;
    return `${ar} · ${it.dur}${it.ep ? ` of ${it.ep}` : ""} · ${it.silent ? "No sound" : "With sound"}`;
  }

  function plFill(it) {
    const p = R.pos(it.id);
    PL.count.textContent = `${pad(p.i + 1)} / ${pad(p.n)} · ${SET_NAMES[p.set] || ""}`;
    PL.tag.className = `tag tag--${it.tag}`;
    PL.tag.textContent = it.tagText;
    PL.title.textContent = it.title;
    PL.meta.textContent = plMetaText(it);
    PL.desc.textContent = it.desc;
    PL.media.classList.toggle("is-tall", it.ar !== "16x9");
    plClearUrl();
    plNavState();
  }

  function stepLabel(dir) {
    const here = R.pos(PL.st.id);
    const to = R.at(PL.st.id, dir);
    if (!here || !to) return null;
    const word = dir > 0 ? "Next" : "Previous";
    return to.set === here.set ? `${word}: ${R.byId.get(to.id).title}` : `${word} set: ${SET_NAMES[to.set]}`;
  }

  function plNavState() {
    const pairs = [[PL.prev, -1], [PL.next, 1], ...PL.bar.map((b) => [b, Number(b.dataset.step)])];
    pairs.forEach(([b, dir]) => {
      const label = stepLabel(dir);
      b.disabled = !label;
      b.setAttribute("aria-label", label || (dir > 0 ? "Next (end of page)" : "Previous (start of page)"));
    });
    if (document.activeElement && document.activeElement.disabled) $("#plClose").focus();
  }

  function plLoad(it) {
    PL.media.classList.add("is-swap");
    if (it.kind === "yt") plSwapFrame(it);
    else if (it.kind === "img") Object.assign(PL.img, { hidden: false, alt: it.title, src: `p/${it.id}.jpg` });
    else plLoadVideo(it);
    requestAnimationFrame(() => requestAnimationFrame(() => PL.media.classList.remove("is-swap")));
  }

  // A fresh iframe per YouTube item: changing a live iframe's src adds joint-history entries that hijack Back.
  function plSwapFrame(it) {
    const cur = $("#plf", PL.media);
    const f = document.createElement("iframe");
    f.id = "plf";
    f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
    f.allowFullscreen = true;
    f.title = it ? `${it.title} on YouTube` : "YouTube player";
    f.hidden = !it;
    if (it) f.src = `https://www.youtube-nocookie.com/embed/${it.yt}?autoplay=1&rel=0&playsinline=1`;
    if (cur) cur.replaceWith(f); else PL.media.prepend(f);
  }

  function plLoadVideo(it) {
    const v = PL.v;
    v.hidden = false;
    v.poster = `p/${it.id}.jpg`;
    v.preload = it.id.startsWith("cap_") ? "metadata" : "auto";
    v.setAttribute("aria-label", `${it.title}, ${it.tagText}`);
    v.src = `v/${it.id}.mp4`;
    if (it.segments) {
      const start = it.segments[0][0];
      v.addEventListener("loadedmetadata", () => { if (PL.st.id === it.id && v.currentTime < start) seekIfCan(v, start); }, { once: true });
      const onTick = (kept) => PL.media.classList.toggle("is-gap", !kept && !v.paused);
      PL.st.dispose = watchSegments(v, it.segments, { loop: false, onEnd: plShowEnd, onTick });
    }
    quiet(v.play());
  }

  function plStopMedia() {
    const { v, img } = PL;
    if (PL.st.dispose) { PL.st.dispose(); PL.st.dispose = null; }
    v.pause();
    if (v.hasAttribute("src")) { v.removeAttribute("src"); v.removeAttribute("poster"); v.load(); }
    v.hidden = true;
    plSwapFrame(null);
    img.removeAttribute("src");
    img.hidden = true;
    plHideEnd();
    PL.err.hidden = true;
    PL.media.classList.remove("is-gap");
  }

  function plRetry() {
    const it = curItem();
    if (it && it.kind === "video") { plStopMedia(); plLoadVideo(it); }
  }

  const plStep = (dir) => { const to = PL.st.id ? R.at(PL.st.id, dir) : null; if (to) plGo(to.id); };

  function plGo(id) {
    if (!id || id === PL.st.id) return;
    history.replaceState({ v: id }, "", `#v=${id}`);
    plOpen(id);
  }

  function plJump(edge) {
    const here = R.pos(PL.st.id);
    if (!here) return;
    const same = R.seq.filter((p) => p.set === here.set);
    plGo((edge < 0 ? same[0] : same[same.length - 1]).id);
  }

  function mkBtn(html, fn) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "btn ghost", innerHTML: html });
    b.addEventListener("click", fn);
    return b;
  }

  function plShowEnd() {
    const it = curItem();
    if (!it || it.kind !== "video") return;
    const to = R.at(it.id, 1);
    const here = R.pos(it.id);
    const replay = mkBtn(`${svg("replay")}<span>Replay</span>`, plReplay);
    let next;
    if (!to) next = $(".pl-info .btn.primary").cloneNode(true);
    else if (to.set === here.set) next = mkBtn(`<span></span>${svg("chevR")}`, () => plStep(1));
    else next = mkBtn("<span></span>", () => plStep(1));
    if (to) next.querySelector("span").textContent = to.set === here.set ? `Next: ${R.byId.get(to.id).title}` : `Next set: ${SET_NAMES[to.set]} →`;
    PL.end.replaceChildren(replay, next);
    PL.end.hidden = false;
  }

  function plHideEnd() {
    if (PL.end.hidden) return;
    const hadFocus = PL.end.contains(document.activeElement);
    PL.end.hidden = true;
    PL.end.replaceChildren();
    if (hadFocus) PL.v.focus();
  }

  function plReplay() {
    const it = curItem();
    if (!it) return;
    plHideEnd();
    PL.v.currentTime = it.segments ? it.segments[0][0] : 0;
    quiet(PL.v.play());
  }

  // Close runs once, whatever fires it (button, backdrop, Esc, Back, the native close): exactly one history.back().
  function plClose() {
    if (!PL.d || !PL.st.id || PL.st.closing) return;
    if (PL.st.pushed) {
      PL.st.closing = true;
      history.back();
      clearTimeout(PL.st.backTimer);
      PL.st.backTimer = setTimeout(() => { if (PL.st.id) plTeardown(); }, 450);
      return;
    }
    history.replaceState(null, "", `#${homeOf(PL.st.id)}`);
    plTeardown();
  }

  function plTeardown() {
    if (!PL.st.id) return;
    const { id, opener, openY } = PL.st;
    Object.assign(PL.st, { id: null, pushed: false, opener: null, closing: false });
    clearTimeout(PL.st.backTimer);
    plStopMedia();
    plClearUrl();
    if (opener) Object.assign(PV, { skipEl: opener, skipUntil: performance.now() + 1000 });   // returning focus is not a preview request
    if (PL.d.open) PL.d.close();
    if (opener && opener.isConnected) {
      opener.focus({ preventScroll: true });
      plRestoreAfter(opener, openY);
    } else plRealignHome(homeOf(id));
    heroResume();
  }

  // A history traversal to an #anchor entry can blur the opener and scroll to that anchor after popstate has run.
  // Put the visitor back where they were, once, after the traversal (hashchange) or a short fallback.
  function plRestoreAfter(target, y) {
    const taken = watchTakeover();
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      window.removeEventListener("hashchange", run);
      if (!taken()) {
        if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: "instant" });
        if (document.activeElement !== target) target.focus({ preventScroll: true });
      }
      setTimeout(() => { history.scrollRestoration = "auto"; }, 0);
    };
    window.addEventListener("hashchange", run);
    setTimeout(run, 200);
  }

  // After a deep link, Back must leave the visitor on the piece's row with focus on its heading. The saved scroll can
  // predate the web-font swap and the traversal can blur focus, so re-align instantly, then once more after it.
  function plRealignHome(anchor) {
    const root = document.documentElement;
    const taken = watchTakeover();
    const go = () => {
      const el = document.getElementById(anchor);
      if (!el || taken() || PL.d.open) return;
      el.scrollIntoView({ behavior: "instant", block: "start" });
      const h = homeHeading(anchor);
      const cur = document.activeElement;
      if (h && (!cur || cur === document.body || cur === h)) h.focus({ preventScroll: true });
    };
    root.style.scrollBehavior = "auto";
    go();
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(() => { go(); root.style.scrollBehavior = ""; history.scrollRestoration = "auto"; }, 450);
  }

  function plOnNativeClose() {
    if (!PL.st.id) return;                                          // already torn down by our own path
    const { pushed, closing } = PL.st;
    const home = homeOf(PL.st.id);
    plTeardown();
    if (pushed && !closing) history.back();                         // our back() may already be in flight
    else if (!pushed) history.replaceState(null, "", `#${home}`);
  }

  function plKeys(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest("video, iframe, input, textarea, select")) return;
    const map = { ArrowRight: () => plStep(1), ArrowLeft: () => plStep(-1), Home: () => plJump(-1), End: () => plJump(1) };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
  }

  function plBindSwipe() {
    let x0 = null;
    let y0 = 0;
    PL.media.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      const r = PL.media.getBoundingClientRect();
      x0 = e.target.tagName === "IFRAME" || t.clientY > r.bottom - 56 ? null : t.clientX;
      y0 = t.clientY;
    }, { passive: true });
    PL.media.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) plStep(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  async function plCopy() {
    const url = `${location.origin}${location.pathname}#v=${PL.st.id}`;
    const label = $(".copy-l", PL.copy);
    try {
      await navigator.clipboard.writeText(url);
      say("Link copied");
      label.textContent = "Link copied";
      setTimeout(() => { label.textContent = "Copy link to this piece"; }, 2000);
    } catch (err) {
      plShowUrl(url);
    }
  }

  function plShowUrl(url) {
    plClearUrl();
    const input = document.createElement("input");
    Object.assign(input, { type: "text", readOnly: true, value: url, className: "pl-url" });
    input.setAttribute("aria-label", "Link to this piece");
    PL.copy.after(input);
    input.focus();
    input.select();
    say("Copy the selected link");
  }
  const plClearUrl = () => $$(".pl-url").forEach((n) => n.remove());

  /* ================= router ================= */
  const idFromHash = () => { const m = /^#v=([\w-]+)$/.exec(location.hash); return m && R.byId.has(m[1]) ? m[1] : null; };

  function applyAlias(instant) {
    const to = ALIASES[location.hash.slice(1)];
    if (!to) return;
    history.replaceState(null, "", `#${to}`);
    const el = document.getElementById(to);
    if (el) el.scrollIntoView(instant ? { behavior: "instant", block: "start" } : { block: "start" });
  }

  function coldLoad() {
    const id = idFromHash();
    if (!id || !PL.d) return;
    const home = homeOf(id);
    history.replaceState(null, "", `#${home}`);
    const el = document.getElementById(home);
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    history.scrollRestoration = "manual";
    history.pushState({ v: id }, "", `#v=${id}`);
    plOpen(id, { pushed: true });
  }

  // True once the visitor wheels, touches, types or clicks: automatic re-alignment must then stay out of the way.
  function watchTakeover() {
    let taken = false;
    const stop = () => { taken = true; };
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((ev) => window.addEventListener(ev, stop, { once: true, passive: true }));
    return () => taken;
  }

  // Web fonts swap in after the browser's first jump to #anchor, which shifts the target. Re-align once fonts
  // and images are in, unless the visitor has already taken over. No scroll listeners.
  function settleAnchor(targetId) {
    if (!targetId || !document.getElementById(targetId)) return;
    const taken = watchTakeover();
    const fix = () => {
      const el = document.getElementById(targetId);
      if (!taken() && el) el.scrollIntoView({ behavior: "instant", block: "start" });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fix, () => {});
    if (document.readyState === "complete") fix(); else window.addEventListener("load", fix, { once: true });
  }

  function onPop() {
    if (!PL.d) return;
    const id = idFromHash();
    if (id) { if (PL.st.id !== id) plOpen(id, { pushed: true }); return; }
    if (PL.st.id) plTeardown();                                     // the dialog may already be natively closed
  }

  function onDocClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target.closest("[data-open], [data-id]");
    if (!el || !PL.d || el.closest("dialog")) return;
    const id = el.dataset.open || el.dataset.id;
    if (!R.byId.has(id)) return;
    e.preventDefault();
    history.scrollRestoration = "manual";                           // Back must not jump to the last #anchor on close
    history.pushState({ v: id }, "", `#v=${id}`);
    plOpen(id, { opener: el, pushed: true });
  }

  /* ================= hero reel ================= */
  const REELS = {
    reel_ai: { src: "v/reel_ai.mp4", poster: "p/reel_ai.jpg", name: "AI showreel", label: "AI-generated", dur: "0:18",
      group: "AI showreel, AI-generated", sound: ": AI showreel, AI-generated, 18 seconds" },
    reel: { src: "v/reel.mp4", poster: "p/reel.jpg", name: "Editing showreel", label: "Client work", dur: "0:46",
      group: "Editing showreel, client work", sound: ": editing showreel, client work, 46 seconds" },
  };
  const heroReel = () => REELS[HERO.st.reel];
  const heroSegs = () => (R.byId.get(HERO.st.reel) || {}).segments || null;
  const heroGate = () => !RM.matches && !saveData() && !slowNet();
  function heroCanAuto() {
    const s = HERO.st;
    return s.visible && s.loaded && !s.userPaused && !s.done && !s.modal && !document.hidden && (heroGate() || s.userStarted);
  }

  function heroInit() {
    const stage = $(".stage");
    if (!stage) return;
    HERO.el = { stage, v: $(".stage-video", stage), poster: $(".stage-poster", stage), btn: $(".stage-pause"),
      sound: $(".stage-sound", stage), status: $(".stage-status"), segs: $$(".seg button") };
    HERO.st = { reel: "reel_ai", userPaused: false, userStarted: false, done: false, visible: !hasIO,
      loaded: document.readyState === "complete", modal: false, pending: heroGate(), dispose: null };
    heroBind();
    heroRender();
  }

  function heroBind() {
    const { stage, v, btn, segs } = HERO.el;
    v.addEventListener("playing", () => { HERO.st.pending = false; heroTick(!heroSegs() || inKept(heroSegs(), v.currentTime)); heroRender(); });
    v.addEventListener("pause", heroRender);
    v.addEventListener("ended", () => { if (!heroSegs()) heroRest(); });
    btn.addEventListener("click", heroTogglePlay);
    segs.forEach((b) => b.addEventListener("click", () => heroSwap(b.dataset.reel)));
    window.addEventListener("load", () => { HERO.st.loaded = true; heroSync(); });
    document.addEventListener("visibilitychange", heroSync);
    if (!hasIO) return;
    new IntersectionObserver(([e]) => {
      HERO.st.visible = e.isIntersecting && e.intersectionRatio >= 0.24;
      heroSync();
    }, { threshold: [0, 0.25, 0.5, 1] }).observe(stage);
  }

  function heroRender() {
    const { v, btn, status } = HERO.el;
    const r = heroReel();
    const playing = !v.paused && !v.ended && v.hasAttribute("src");
    const icon = playing ? '<span class="dot"></span>' : HERO.st.pending ? "" : svg("pause");
    const word = playing ? "Playing · " : HERO.st.pending ? "" : "Paused · ";      // .st-x parts drop on phones
    status.innerHTML = `${icon}<span><span class="st-x">${word}${r.name} · </span>${r.label}<span class="st-x"> · ${r.dur}</span></span>`;
    btn.setAttribute("aria-label", playing ? "Pause showreel" : "Play showreel");
    btn.innerHTML = svg(playing ? "pause" : "play");
  }

  function heroSync() {
    if (HERO.st && heroCanAuto()) heroPlay();
    else if (HERO.st && !HERO.el.v.paused) HERO.el.v.pause();
  }

  function heroPlay() {
    const { v } = HERO.el;
    if (!v.hasAttribute("src")) heroAttach();
    const p = v.play();
    if (p && p.catch) p.catch(() => { HERO.st.pending = false; heroRender(); });
  }

  function heroAttach() {
    const { v } = HERO.el;
    const segs = heroSegs();
    const reel = HERO.st.reel;
    v.preload = "auto";
    v.loop = !segs && !COARSE.matches;
    v.src = heroReel().src;
    if (!segs) return;
    const start = segs[0][0];
    v.addEventListener("loadedmetadata", () => { if (HERO.st.reel === reel && v.currentTime < start) seekIfCan(v, start); }, { once: true });
    HERO.st.dispose = watchSegments(v, segs, { loop: !COARSE.matches, onEnd: heroRest, onTick: heroTick });
  }

  function heroTick(kept) {                                        // the video only covers the poster on kept frames
    HERO.el.stage.classList.toggle("is-live", kept && !HERO.st.done && HERO.el.v.hasAttribute("src"));
  }

  function heroDetach() {
    const { v } = HERO.el;
    if (HERO.st.dispose) { HERO.st.dispose(); HERO.st.dispose = null; }
    v.pause();
    v.removeAttribute("src");
    v.load();
    v.loop = false;
  }

  function heroRest() {                                            // coarse pointers: one pass, then back to the poster
    const { v, stage } = HERO.el;
    const segs = heroSegs();
    HERO.st.done = true;
    v.pause();
    stage.classList.remove("is-live");
    v.currentTime = segs ? segs[0][0] : 0;
    heroRender();
  }

  function heroTogglePlay() {
    const { v } = HERO.el;
    if (!v.paused) { HERO.st.userPaused = true; v.pause(); return; }
    Object.assign(HERO.st, { userPaused: false, userStarted: true, done: false });
    heroPlay();
  }

  function heroSwap(reel) {
    if (!REELS[reel] || reel === HERO.st.reel) return;
    const { stage, segs } = HERO.el;
    segs.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.reel === reel)));
    Object.assign(HERO.st, { reel, done: false });
    stage.classList.add("is-out");
    setTimeout(heroSwapNow, RM.matches ? 0 : 180);
  }

  function heroSwapNow() {
    const { stage, poster, sound } = HERO.el;
    const r = heroReel();
    heroDetach();
    stage.classList.remove("is-live", "is-out");
    poster.src = r.poster;
    stage.dataset.reel = HERO.st.reel;
    stage.setAttribute("aria-label", r.group);
    sound.href = r.src;
    sound.dataset.open = HERO.st.reel;
    $(".vh", sound).textContent = r.sound;
    HERO.st.pending = heroCanAuto();
    heroRender();
    heroSync();
  }

  const heroSuspend = () => { if (HERO.st) { HERO.st.modal = true; HERO.el.v.pause(); } };
  const heroResume = () => { if (HERO.st) { HERO.st.modal = false; heroSync(); } };

  /* ================= hover / focus previews (fine pointers only) ================= */
  const pvAllowed = () => FINE.matches && !RM.matches && !saveData();

  function pvInit() {
    $$(".tile[data-preview]").forEach((t) => {
      t.addEventListener("pointermove", (e) => {                   // scroll or a closing dialog fire synthetic enters with no movement
        if (e.pointerType === "mouse" && (e.movementX || e.movementY) && PV.cur !== t) pvArm(t, 150);
      });
      t.addEventListener("pointerleave", () => pvCancel(t));
      t.addEventListener("focus", () => {
        if (t === PV.skipEl && performance.now() < PV.skipUntil) return;
        if (t.matches(":focus-visible")) pvArm(t, 400);
      });
      t.addEventListener("blur", () => pvCancel(t));
    });
  }

  function pvArm(t, ms) {
    clearTimeout(PV.timer);
    if (!pvAllowed() || (PL.d && PL.d.open)) return;
    PV.timer = setTimeout(() => pvStart(t), ms);
  }

  const pvCancel = (t) => { clearTimeout(PV.timer); if (PV.cur === t) pvStop(); };

  function pvStart(t) {
    pvStop();
    const frame = $(".frame", t);
    const img = frame && $("img", frame);
    if (!img) return;
    const vid = document.createElement("video");
    Object.assign(vid, { muted: true, loop: true, playsInline: true, preload: "auto" });
    vid.setAttribute("muted", "");
    vid.setAttribute("aria-hidden", "true");
    vid.addEventListener("playing", () => { if (PV.vid === vid) frame.classList.add("is-live"); }, { once: true });
    vid.src = `v/${t.dataset.id}.mp4`;
    img.after(vid);
    Object.assign(PV, { cur: t, vid });
    quiet(vid.play());
  }

  function pvStop() {
    clearTimeout(PV.timer);
    const { cur, vid } = PV;
    if (!vid) return;
    Object.assign(PV, { cur: null, vid: null });
    vid.pause();
    vid.removeAttribute("src");
    vid.load();
    const frame = $(".frame", cur);
    if (frame) frame.classList.remove("is-live");
    setTimeout(() => vid.remove(), 180);
  }

  /* ================= scrollspy + header border (IntersectionObserver only, no scroll listeners) ================= */
  function spyInit() {
    if (!hasIO) return;
    const bar = $(".bar");
    const sentinel = $("#top-sentinel");
    if (bar && sentinel) new IntersectionObserver(([e]) => bar.classList.toggle("is-scrolled", !e.isIntersecting)).observe(sentinel);
    const ids = ["ai", "clients", "services", "process"];
    const links = $$(".nav-links a, .navchip");
    const on = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? on.add(e.target.id) : on.delete(e.target.id)));
      const cur = ids.find((id) => on.has(id));
      links.forEach((a) => {
        if (cur && a.getAttribute("href") === `#${cur}`) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ids.forEach((id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ================= reveal (once; anything already passed is revealed too) ================= */
  const REVEAL_SEL = ".sec-head, .case, .row, .svc li, .index-cols, .cta-band";

  function revealInit() {
    if (!hasIO || RM.matches) return;
    const targets = $$(REVEAL_SEL);
    targets.forEach((t) => $$(".tile", t).forEach((tile, i) => tile.style.setProperty("--i", String(Math.min(i, 5)))));
    const upTo = (k) => targets.slice(0, k + 1).forEach((t) => { t.classList.add("in"); io.unobserve(t); });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) upTo(targets.indexOf(e.target)); });
    }, { rootMargin: "0px 0px -8% 0px" });
    const vh = window.innerHeight;
    let last = -1;
    targets.forEach((t, k) => { if (t.getBoundingClientRect().top < vh) last = k; });
    targets.forEach((t, k) => { if (k <= last) t.classList.add("in"); else io.observe(t); });
    document.documentElement.classList.add("js-reveal");
  }

  const revealAll = () => $$(REVEAL_SEL).forEach((t) => t.classList.add("in"));

  /* ================= motion preference fan-out ================= */
  function onMotionChange() {
    if (!RM.matches) return;
    pvStop();
    revealAll();
    if (!HERO.st) return;
    Object.assign(HERO.st, { userStarted: false, pending: false });
    heroSync();
    heroRender();
  }

  /* ================= boot ================= */
  function init() {
    R = buildRegistry();
    plInit();
    heroInit();
    pvInit();
    spyInit();
    revealInit();
    document.addEventListener("click", onDocClick);
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", () => applyAlias(false));
    if (RM.addEventListener) RM.addEventListener("change", onMotionChange);
    else if (RM.addListener) RM.addListener(onMotionChange);
    applyAlias(true);
    const deep = idFromHash();
    coldLoad();
    settleAnchor(deep ? homeOf(deep) : location.hash.slice(1));
  }

  init();
})();
