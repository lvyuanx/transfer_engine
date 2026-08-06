import { $, fmtSize, getErrorMessage } from "./utils.js";
import { icon, setIcon } from "./icons.js";
import { alertModal, confirmModal, promptModal } from "./modal.js";

const tree = $("tree");
const empty = $("tree-empty");
const refresh = $("refresh");
const newDirectory = $("new-dir");

async function getEntries(path = "") {
  const query = path ? "?path=" + encodeURIComponent(path) : "";
  const response = await fetch("/api/tree" + query);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function download(path, name) {
  const link = document.createElement("a");
  link.href = "/api/download?path=" + encodeURIComponent(path);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function actionButton(name, label, handler, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "download-btn row-btn" + (danger ? " danger" : "");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(icon(name));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
  return button;
}

function buildNode(entry) {
  const item = document.createElement("li");
  item.className = entry.type === "dir" ? "folder" : "file";
  item.dataset.path = entry.path;

  const row = document.createElement("div");
  row.className = "tree-row";
  row.title = entry.path;
  const twisty = document.createElement("span");
  twisty.className = "twisty";
  if (entry.type === "dir") twisty.append(icon("chevron-right"));
  const typeIcon = document.createElement("span");
  typeIcon.className = "icon";
  typeIcon.append(icon(entry.type === "dir" ? "folder" : "file"));
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = entry.name;
  const size = document.createElement("span");
  size.className = "size";
  size.textContent = entry.type === "file" ? fmtSize(entry.size) : "";
  row.append(twisty, typeIcon, name, size);
  row.append(actionButton("download", "下载 " + entry.name, () => download(entry.path, entry.name)));

  if (entry.type === "dir") {
    row.append(
      actionButton("upload", "上传到 " + entry.path, () => requestUpload(entry.path)),
      actionButton("new-folder", "在 " + entry.path + " 下新建文件夹", () => createDirectory(entry.path)),
    );
  }
  row.append(actionButton("delete", "删除 " + entry.path, () => removeEntry(entry), true));
  item.appendChild(row);

  if (entry.type === "dir") addChildren(item, row, twisty, typeIcon, entry.path);
  return item;
}

function addChildren(item, row, twisty, typeIcon, path) {
  const wrapper = document.createElement("div");
  wrapper.className = "children";
  const children = document.createElement("ul");
  wrapper.appendChild(children);
  item.appendChild(wrapper);
  row.addEventListener("click", async (event) => {
    if (event.target.closest("button")) return;
    const open = wrapper.classList.toggle("open");
    twisty.classList.toggle("open", open);
    setIcon(typeIcon, open ? "folder-open" : "folder");
    if (open && !children.dataset.loaded) await loadChildren(path, children);
  });
}

export async function loadChildren(path, container) {
  try {
    const data = await getEntries(path);
    container.dataset.loaded = "1";
    container.replaceChildren();
    if (!data.entries.length) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = "（空目录）";
      container.appendChild(item);
      return;
    }
    container.append(...data.entries.map(buildNode));
  } catch {
    container.textContent = "加载失败";
  }
}

export async function loadRoot() {
  refresh.classList.add("spinning");
  tree.replaceChildren();
  try {
    const data = await getEntries();
    empty.classList.toggle("hidden", data.entries.length > 0);
    tree.append(...data.entries.map(buildNode));
  } catch {
    empty.textContent = "文件列表加载失败";
    empty.classList.remove("hidden");
  } finally {
    refresh.classList.remove("spinning");
  }
}

function requestUpload(path) {
  tree.dispatchEvent(new CustomEvent("upload-request", { detail: path }));
}

async function removeEntry(entry) {
  const ok = await confirmModal(
    "删除确认",
    "确定删除" + (entry.type === "dir" ? "目录" : "文件") + "「" + entry.path + "」？",
    { danger: true }
  );
  if (!ok) return;
  const response = await fetch("/api/files?path=" + encodeURIComponent(entry.path), { method: "DELETE" });
  if (!response.ok) return alertModal("删除失败", await getErrorMessage(response, "删除失败"));
  await loadRoot();
}

async function addDirectory(parent, name) {
  const response = await fetch("/api/dirs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "创建失败"));
  await loadRoot();
}

async function createDirectory(parent = "") {
  const name = await promptModal(
    parent ? "在「" + parent + "」下新建文件夹" : "新建文件夹",
    { placeholder: "文件夹名称", hint: "输入文件夹名称，不支持 / 和开头为 . 的名称" }
  );
  if (!name) return;
  addDirectory(parent, name).catch((error) => alertModal("创建失败", error.message));
}

refresh.addEventListener("click", loadRoot);
newDirectory.addEventListener("click", () => createDirectory());
