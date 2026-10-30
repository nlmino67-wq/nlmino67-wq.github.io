/* Copies made by rows.js have no player handler, so a click on one opens its original tile. */
document.addEventListener("click", (e) => {
  const copy = e.target.closest('.loop-set[aria-hidden="true"] a[data-video]');
  if (!copy) return;
  const original = copy.closest(".loop-track").querySelector(`.loop-set:not([aria-hidden]) a[href="${copy.getAttribute("href")}"]`);
  if (!original) return;
  e.preventDefault();
  original.click();
});
