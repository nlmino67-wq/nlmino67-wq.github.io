/* /ai-video-editor/ only. Runs after ../home.js, which builds the hero wall (one GSAP tween per column, all moving up).
   This file makes every second column drift down instead, and holds the wall still while a mouse is over it.
   Fails open: without GSAP or the wall nothing changes and the page stays fully usable. */
(() => {
  "use strict";

  // home.js sets each column tween's timeScale every frame (scroll boost, hover), and in GSAP a reversed tween is a negative
  // timeScale, so reversing would be undone at once. Instead, swap every second tween in place (same array home.js reads)
  // for one that runs the same distance the other way: from one full set up, down to zero.
  const setH = (col) => (col._n && col.children.length > col._n ? col.children[col._n].offsetTop - col.children[0].offsetTop : 0);

  function alternate(home) {
    const G = window.gsap;
    const cols = Array.from(document.querySelectorAll(".hm-wall .wall-col"));
    const tweens = home.cols || [];
    if (!G || tweens.length !== cols.length) return;
    tweens.forEach((tween, i) => {
      if (i % 2 === 0 || tween._nicoDown) return;
      const col = cols[i];
      const down = G.fromTo(col, { y: () => -setH(col) }, { y: 0, repeat: -1, ease: "none", duration: tween.duration(), paused: true });
      down._nicoDown = true;
      down.progress(1 - tween.progress());
      down.timeScale(tween.timeScale());
      const wasPaused = tween.paused();
      tween.kill();
      tweens[i] = down;
      down.paused(wasPaused);
    });
  }

  // home.js strips the <video> out of the wall's copies, which leaves those frames black. Give each one its poster.
  function fillPosters(wall) {
    wall.querySelectorAll(".wall-item[aria-hidden='true'] .frame").forEach((frame) => {
      if (frame.querySelector("img, video")) return;
      const tile = frame.closest("[data-id]");
      const src = tile && wall.querySelector(`.wall-item:not([aria-hidden]) [data-id="${tile.dataset.id}"] video`);
      if (!src || !src.poster) return;
      const img = document.createElement("img");
      Object.assign(img, { src: src.poster, alt: "", width: src.width, height: src.height, decoding: "async" });
      frame.prepend(img);
    });
  }

  function start() {
    const home = window.NICO_HOME;
    const wall = document.querySelector(".hm-wall");
    if (!home || !wall) return;
    const apply = () => { fillPosters(wall); alternate(home); };
    apply();
    if ("MutationObserver" in window) new MutationObserver(apply).observe(wall, { attributes: true, attributeFilter: ["class"] });

    const hold = (on) => (e) => {
      if (e.pointerType !== "mouse") return;
      (home.cols || []).forEach((t) => {
        if (on) t.pause();
        else if (home.wall && home.wall.running) t.resume();
      });
    };
    wall.addEventListener("pointerenter", hold(true));
    wall.addEventListener("pointerleave", hold(false));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
