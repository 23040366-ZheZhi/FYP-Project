(function () {
  const list = document.getElementById("routeList");
  const form = document.getElementById("rotateForm");
  const routesCsv = document.getElementById("routesCsv");
  const addBtn = document.getElementById("addRouteBtn");
  const newRoute = document.getElementById("newRoute");

  function getRoutes() {
    return Array.from(list.querySelectorAll(".row-item")).map(x => x.dataset.route);
  }

  function syncHidden() {
    routesCsv.value = getRoutes().join(",");
  }

  function normalizeRoute(s) {
    const t = String(s || "").trim();
    if (!t) return "";
    return t.startsWith("/") ? t : "/" + t;
  }

  addBtn.addEventListener("click", () => {
    const r = normalizeRoute(newRoute.value);
    if (!r) return;

    const exists = getRoutes().includes(r);
    if (exists) return;

    const row = document.createElement("div");
    row.className = "row-item";
    row.draggable = true;
    row.dataset.route = r;
    row.innerHTML = `
      <div class="drag-handle">↕</div>
      <p class="route-text"></p>
      <button type="button" class="btn btn-sm btn-outline-danger" data-action="remove">Remove</button>
    `;
    row.querySelector(".route-text").textContent = r;
    list.appendChild(row);
    newRoute.value = "";
    syncHidden();
  });

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='remove']");
    if (!btn) return;
    const row = btn.closest(".row-item");
    if (!row) return;
    row.remove();
    syncHidden();
  });

  let dragEl = null;

  list.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".row-item");
    if (!row) return;
    dragEl = row;
    e.dataTransfer.effectAllowed = "move";
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const over = e.target.closest(".row-item");
    if (!over || !dragEl || over === dragEl) return;

    const rect = over.getBoundingClientRect();
    const before = (e.clientY - rect.top) < (rect.height / 2);
    list.insertBefore(dragEl, before ? over : over.nextSibling);
  });

  list.addEventListener("dragend", () => {
    dragEl = null;
    syncHidden();
  });

  form.addEventListener("submit", () => {
    syncHidden();
  });

  syncHidden();
})();
