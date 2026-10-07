/* Nico Tan Leonardia · law firm marketing page. Vanilla JS, no build step, one IIFE, no globals.
   Modules: header state · section spy · inline video · image viewer · video player.
   The page is fully usable without this file: every tile is a real link to its image or video.
   The hero fan-out is pure CSS and needs nothing from here. */
(() => {
  "use strict";

  /* ================= utils ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)");
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
  const plainClick = (e) => e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  const textOf = (root, sel) => { const el = $(sel, root); return el ? el.textContent.trim() : ""; };
  const titleOf = (tile) => tile.dataset.title || textOf(tile, ".t");

  /* ================= header shadow ================= */
  const bar = $(".bar");
  const sentinel = $("#top-sentinel");
  if (bar && sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => bar.classList.toggle("is-scrolled", !entry.isIntersecting)).observe(sentinel);
  }

  /* ================= section spy: marks the current section in both navs (ids come from the nav hrefs) ================= */
  const navLinks = $$(".nav-links a, .navchip");
  if (navLinks.length && "IntersectionObserver" in window) {
    const ids = Array.from(new Set(navLinks.map((a) => a.getAttribute("href").slice(1))));
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
    const mark = (id) => {
      navLinks.forEach((a) => {
        const on = a.getAttribute("href") === "#" + id;
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
        if (on && a.classList.contains("navchip")) a.scrollIntoView({ block: "nearest", inline: "center", behavior: RM.matches ? "auto" : "smooth" });
      });
    };
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) mark(entry.target.id); });
    }, { rootMargin: "-20% 0px -70% 0px" });
    sections.forEach((s) => spy.observe(s));
  }

  /* ================= inline video: plays muted only while at least half visible; never with reduced motion or a dialog open ================= */
  const live = $("#liveVideo");
  let syncLive = () => {};
  if (live && "IntersectionObserver" in window) {
    let visible = false;
    syncLive = () => {
      const blocked = RM.matches || document.hidden || $$("dialog").some((d) => d.open);
      if (visible && !blocked) quiet(live.play()); else live.pause();
    };
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncLive(); }, { threshold: 0.5 }).observe(live);
    document.addEventListener("visibilitychange", () => syncLive());
    if (RM.addEventListener) RM.addEventListener("change", () => syncLive());
  }

  /* Both dialogs need <dialog>.showModal; without it the tiles simply open their files. */
  if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) return;
  $$("a[data-viewer], a[data-video]").forEach((a) => a.setAttribute("aria-haspopup", "dialog"));

  /* ================= image viewer ================= */
  const viewer = $("#viewer");
  if (viewer) {
    const body = $("#vwBody");
    const img = $("#vwImg");
    const prev = $("#vwPrev");
    const next = $("#vwNext");
    const full = $("#vwFull");
    let items = [];
    let index = 0;
    let opener = null;

    const show = (i) => {
      index = Math.min(Math.max(i, 0), items.length - 1);
      const tile = items[index];
      const thumb = $("img", tile);
      const title = titleOf(tile) || thumb.alt;
      img.src = tile.href;
      img.alt = thumb.alt;
      img.setAttribute("width", thumb.getAttribute("width"));
      img.setAttribute("height", thumb.getAttribute("height"));
      viewer.style.setProperty("--nw", thumb.getAttribute("width") + "px");
      full.href = tile.href;
      $("#vwTitle").textContent = title;
      $("#vwName").textContent = title;
      $("#vwDesc").textContent = tile.dataset.desc || textOf(tile, ".desc");
      $("#vwCount").textContent = (index + 1) + " / " + items.length;
      $("#vwLive").textContent = title + ", " + (index + 1) + " of " + items.length;
      prev.disabled = index === 0;
      next.disabled = index === items.length - 1;
      /* a button that just became disabled cannot keep focus: hand it to the viewer body so arrow keys and Esc keep working */
      if (document.activeElement && document.activeElement.disabled) body.focus({ preventScroll: true });
      body.scrollTop = 0;
    };

    const open = (tile) => {
      items = $$('a[data-viewer][data-group="' + tile.dataset.group + '"]');
      opener = tile;
      show(items.indexOf(tile));
      const multi = items.length > 1;
      prev.hidden = next.hidden = !multi;
      viewer.showModal();
      body.focus({ preventScroll: true });
      syncLive();
    };

    $$("a[data-viewer]").forEach((tile) => {
      tile.addEventListener("click", (e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        open(tile);
      });
    });
    prev.addEventListener("click", () => show(index - 1));
    next.addEventListener("click", () => show(index + 1));
    /* Cleanup runs from the close event and from the explicit close paths (button, backdrop, Esc); it is safe to run twice. */
    const cleanup = () => {
      img.removeAttribute("src");
      if (opener) opener.focus();
      syncLive();
    };
    const closeViewer = () => { if (viewer.open) viewer.close(); cleanup(); };
    $("#vwClose").addEventListener("click", closeViewer);
    viewer.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") { e.preventDefault(); closeViewer(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    });
    viewer.addEventListener("click", (e) => {
      if (e.target === viewer || e.target === body || e.target.classList.contains("dlg")) closeViewer();
    });
    viewer.addEventListener("close", cleanup);
  }

  /* ================= video player ================= */
  const player = $("#vplayer");
  if (player) {
    const video = $("#vpVideo");
    const err = $("#vpErr");
    const stage = $(".vp", player);
    let opener = null;

    const open = (tile) => {
      const thumb = $("img:not([aria-hidden])", tile);
      const inline = $("video", tile);
      const tag = $(".tag", tile);
      const title = titleOf(tile);
      const tagText = tag ? tag.textContent : (tile.dataset.tag || "");
      opener = tile;
      err.hidden = true;
      /* native portrait tiles carry data-ar="9x16" on their link; the pillarboxed tile is the same case */
      stage.dataset.ar = tile.dataset.ar || ($(".frame--pillar", tile) ? "9x16" : "16x9");
      $("#vpTitle").textContent = title;
      $("#vpName").textContent = title;
      $("#vpDesc").textContent = tile.dataset.desc || textOf(tile, ".desc");
      $("#vpTag").textContent = tagText;
      /* the showreel has no tag inside its link: AI labels get the outlined chip, client labels the filled one */
      $("#vpTag").className = tag ? tag.className : (tagText ? (/^AI/i.test(tagText) ? "tag tag--ai" : "tag tag--real") : "tag");
      $("#vpFile").href = tile.href;
      video.setAttribute("aria-label", title);
      if (thumb) video.poster = thumb.currentSrc || thumb.src;
      else if (inline && inline.poster) video.poster = inline.poster;
      video.src = tile.href;
      player.showModal();
      syncLive();
      quiet(video.play());
    };

    $$("a[data-video]").forEach((tile) => {
      tile.addEventListener("click", (e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        open(tile);
      });
    });
    video.addEventListener("error", () => { if (video.getAttribute("src")) err.hidden = false; });
    /* Pause and unload on close. Runs from the close event and the explicit close paths; safe to run twice. */
    const cleanup = () => {
      video.pause();
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load();
      if (opener) opener.focus();
      syncLive();
    };
    const closePlayer = () => { if (player.open) player.close(); cleanup(); };
    $("#vpClose").addEventListener("click", closePlayer);
    /* Esc is handled here as well: the close event alone left the video playing in one browser. */
    player.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closePlayer(); }
    });
    player.addEventListener("click", (e) => {
      if (e.target === player || e.target === stage) closePlayer();
    });
    player.addEventListener("close", cleanup);
  }
})();
