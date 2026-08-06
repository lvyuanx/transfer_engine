const ICONS = {
  logo: "↗",
  upload: "↑",
  download: "↓",
  refresh: "↻",
  "new-folder": "+",
  delete: "×",
  send: "➤",
  rename: "✎",
  clear: "×",
  users: "●",
  folder: "▸",
  "folder-open": "▾",
  "chevron-right": "▸",
  file: "□",
};

export function icon(name) {
  const node = document.createElement("span");
  node.className = "inline-icon";
  node.textContent = ICONS[name] || ICONS.file;
  return node;
}

export function setIcon(element, name) {
  element.replaceChildren(icon(name));
}

export function injectIcons() {
  document.querySelectorAll("[data-icon]").forEach((element) => {
    element.prepend(icon(element.dataset.icon));
  });
}
