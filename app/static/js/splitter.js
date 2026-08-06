import { $ } from "./utils.js";

const SPLITTER_KEY = "lan_splitter";

/**
 * 左右面板拖动分隔：拖中间分隔条调整侧栏/聊天区宽度，宽度持久化到 localStorage。
 * 侧栏最小 280px，最大 75%，避免把聊天区挤没。
 */
export function initSplitter() {
  const app = document.querySelector(".app");
  const splitter = document.querySelector(".splitter");
  if (!app || !splitter) return;

  const MIN = 280;
  const MAX_RATIO = 0.75;

  function setSidebarWidth(width) {
    app.style.gridTemplateColumns = `${Math.round(width)}px 6px 1fr`;
    localStorage.setItem(SPLITTER_KEY, String(Math.round(width)));
  }

  function restore() {
    const saved = Number(localStorage.getItem(SPLITTER_KEY));
    if (saved && saved >= MIN) setSidebarWidth(saved);
  }

  let dragging = false;
  splitter.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    splitter.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const rect = app.getBoundingClientRect();
    const width = Math.min(Math.max(event.clientX - rect.left, MIN), rect.width * MAX_RATIO);
    setSidebarWidth(width);
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  restore();
}
