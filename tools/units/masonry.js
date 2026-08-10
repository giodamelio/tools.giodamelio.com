// CSS masonry isn't supported yet, so polyfill `display: grid-lanes`.
// https://github.com/ninjamar/grid-lanes-polyfill
import GridLanesPolyfill from "./grid-lanes-polyfill.js";
let pf = null;
const applyMasonry = () => {
  if (!GridLanesPolyfill.supportsGridLanes()) {
    pf = GridLanesPolyfill.init({ force: true });
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyMasonry);
} else {
  applyMasonry();
}
// Web fonts swap in after the first layout and make the cards taller, so
// the polyfill's measured container height (from the fallback font) ends
// up short and clips the tallest card. Recompute exactly when the fonts
// are ready — no timers or guesswork.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (pf && pf.refresh) pf.refresh();
  });
}
