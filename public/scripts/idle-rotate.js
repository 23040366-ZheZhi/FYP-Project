(() => {
  const cfg = window.__ROTATE_CFG__;
  if (!cfg || !cfg.enabled) return;

  const routes = Array.isArray(cfg.routes) ? cfg.routes : [];
  if (routes.length < 2) return;

  const idleMs = (cfg.idleSeconds || 30) * 1000;

  const norm = (p) => (p || "/").replace(/\/+$/, "") || "/";
  const path = norm(window.location.pathname);
  const idx = routes.map(norm).indexOf(path);
  if (idx === -1) return;

  let last = Date.now();
  const bump = () => { last = Date.now(); };

  [
    "mousemove","mousedown","mouseup","click",
    "scroll","wheel",
    "keydown","keyup",
    "touchstart","touchmove",
    "pointerdown","pointermove"
  ].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) bump();
  });

  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - last < idleMs) return;

    const next = routes[(idx + 1) % routes.length];
    window.location.href = next;
  }, 500);
})();
