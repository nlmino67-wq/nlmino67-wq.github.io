/* Rolling rows (one per style), the chapter rail, and light GSAP motion. */
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- rolling rows ---------- */
  function initRow(track) {
    const row = track.closest("[data-loop-row]");
    const prev = row.querySelector("[data-car-prev]");
    const next = row.querySelector("[data-car-next]");
    const inner = track.querySelector(".loop-track");
    const set = inner.querySelector(".loop-set");
    const speed = Number(track.dataset.speed || 30);
    let pos = 0, last = performance.now(), hold = 0, hover = false, tween = null, written = -1, seen = false;
    const setW = () => set.offsetWidth;

    /* enough copies that one full set can always scroll past, even on very wide screens */
    const fill = () => {
      const fits = setW() <= track.clientWidth * 0.8;   /* clearly short rows would show the same tile twice */
      row.classList.toggle("is-static", fits);
      if (fits) {
        while (inner.children.length > 1) inner.lastElementChild.remove();
        pos = 0;
        return;
      }
      while (inner.children.length < 2 || inner.scrollWidth < setW() + track.clientWidth + 8) {
        const c = set.cloneNode(true);
        c.setAttribute("aria-hidden", "true");
        c.querySelectorAll("a").forEach((a) => a.setAttribute("tabindex", "-1"));
        inner.appendChild(c);
      }
    };
    fill();
    window.addEventListener("resize", fill);

    const wrap = (p) => { const w = setW(); return w ? ((p % w) + w) % w : p; };
    const write = () => { track.scrollLeft = pos; written = track.scrollLeft; };
    const pause = (ms) => { hold = performance.now() + ms; };
    const step = () => Math.max(Math.min(track.clientWidth * 0.75, 900), 220);
    const move = (dir) => {
      pause(3500);
      const from = pos, to = pos + dir * step(), t0 = performance.now(), dur = reduce ? 1 : 480;
      tween = (now) => {
        const k = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3);
        pos = wrap(from + (to - from) * e);
        if (k >= 1) tween = null;
      };
    };
    prev.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    track.addEventListener("pointerenter", () => { hover = true; });
    track.addEventListener("pointerleave", () => { hover = false; });
    track.addEventListener("focusin", () => pause(6000));
    track.addEventListener("scroll", () => {
      if (Math.abs(track.scrollLeft - written) > 1.5) { pos = wrap(track.scrollLeft); pause(3000); write(); }
    }, { passive: true });
    /* only rows on screen roll */
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { seen = e.isIntersecting; }).observe(track);
    else seen = true;

    const tick = (now) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      if (tween) tween(now);
      else if (seen && !reduce && !hover && now > hold && !document.hidden && !row.classList.contains("is-static")) pos = wrap(pos + speed * dt);
      if (Math.abs(track.scrollLeft - pos) > 0.5) write();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- chapter rail: highlight the style on screen ---------- */
  function initRail() {
    const bar = document.querySelector(".bar");
    const setBar = () => document.documentElement.style.setProperty("--bar-h", bar.offsetHeight + "px");
    if (bar) { setBar(); window.addEventListener("resize", setBar); }
    const links = [...document.querySelectorAll("#secnav a")];
    if (!links.length || !("IntersectionObserver" in window)) return;
    const on = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? on.add(e.target.id) : on.delete(e.target.id)));
      const cur = links.find((a) => on.has(a.hash.slice(1)));
      if (!cur) return;
      links.forEach((a) => (a === cur ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    }, { rootMargin: "-40% 0px -55% 0px" });
    links.forEach((a) => { const t = document.getElementById(a.hash.slice(1)); if (t) io.observe(t); });
  }

  /* ---------- GSAP: rows ease in once, proof numbers count up ---------- */
  function initMotion() {
    const { gsap, ScrollTrigger } = window;
    if (!gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
      gsap.utils.toArray(".lrow").forEach((row) => {
        const st = { trigger: row, start: "top 88%", once: true };
        gsap.from(row.querySelectorAll(".lrow-copy > *"), { y: 14, autoAlpha: 0, duration: 0.6, ease: "power3.out", stagger: 0.07, scrollTrigger: st });
        gsap.from(row.querySelector(".loop-track"), { x: 48, autoAlpha: 0, duration: 0.9, ease: "power3.out", scrollTrigger: st });
      });
      gsap.utils.toArray("[data-count]").forEach((el) => {
        const end = parseFloat(el.dataset.count);
        const dec = (el.dataset.count.split(".")[1] || "").length;
        const n = { v: 0 };
        gsap.to(n, {
          v: end, duration: 1.4, ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 92%", once: true },
          onUpdate: () => { el.textContent = n.v.toFixed(dec); },
        });
      });
    });
  }

  const start = () => {
    document.querySelectorAll("[data-loop]").forEach(initRow);
    initRail();
    initMotion();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
