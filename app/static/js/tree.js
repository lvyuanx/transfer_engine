import { $, fmtSize, getErrorMessage } from "./utils.js";
import { icon, setIcon } from "./icons.js";
import { alertModal, confirmModal, openModal } from "./modal.js";

const tree = $("tree");
const empty = $("tree-empty");
const refresh = $("refresh");
const newDirectory = $("new-dir");
/** 已解锁的加密文件夹 token 缓存，key 为 vault 路径 */
const vaultTokens = new Map();

/** 根据路径向上查找匹配的 vault token */
export function getVaultToken(p) {
  let current = p;
  while (current) {
    if (vaultTokens.has(current)) return vaultTokens.get(current);
    const idx = current.lastIndexOf("/");
    current = idx > 0 ? current.slice(0, idx) : "";
  }
  return null;
}

async function getEntries(path = "", token = null) {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  if (token) params.set("token", token);
  const qs = params.toString();
  const response = await fetch("/api/tree" + (qs ? "?" + qs : ""));
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function download(path, name) {
  const params = new URLSearchParams({ path });
  const token = getVaultToken(path);
  if (token) params.set("token", token);
  const link = document.createElement("a");
  link.href = "/api/download?" + params.toString();
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

function fileIconName(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    jpg: "file-image", jpeg: "file-image", png: "file-image", gif: "file-image",
    webp: "file-image", svg: "file-image", bmp: "file-image", ico: "file-image",
    mp4: "file-video", avi: "file-video", mkv: "file-video", mov: "file-video", webm: "file-video",
    mp3: "file-audio", wav: "file-audio", flac: "file-audio", ogg: "file-audio", aac: "file-audio",
    zip: "file-archive", rar: "file-archive", "7z": "file-archive", tar: "file-archive",
    gz: "file-archive", bz2: "file-archive", xz: "file-archive",
  };
  return map[ext] || "file";
}

function passwordPrompt(title) {
  return openModal({
    title,
    input: true,
    inputType: "password",
    placeholder: "请输入密码",
    hint: "输入密码以解锁加密文件夹",
    confirmText: "解锁",
    maxLength: 128,
  });
}

function buildNode(entry) {
  const item = document.createElement("li");
  const isDir = entry.type === "dir";
  const isEncrypted = isDir && entry.encrypted;
  item.className = isEncrypted ? "folder encrypted" : isDir ? "folder" : "file";
  item.dataset.path = entry.path;

  const row = document.createElement("div");
  row.className = "tree-row";
  row.title = entry.path + (isEncrypted ? "（加密）" : "");
  const twisty = document.createElement("span");
  twisty.className = "twisty";
  if (isDir) twisty.append(icon("chevron-right"));
  const typeIcon = document.createElement("span");
  typeIcon.className = "icon";
  typeIcon.append(icon(isEncrypted ? "lock" : isDir ? "folder" : fileIconName(entry.name)));
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = entry.name;
  const size = document.createElement("span");
  size.className = "size";
  size.textContent = entry.type === "file" ? fmtSize(entry.size) : "";
  row.append(twisty, typeIcon, name, size);

  if (isEncrypted && !vaultTokens.has(entry.path)) {
    // 已解锁的加密文件夹显示正常操作按钮
  } else if (!isEncrypted) {
    row.append(actionButton("download", "下载 " + entry.name, () => download(entry.path, entry.name)));
  }

  if (isDir && !isEncrypted) {
    row.append(
      actionButton("upload", "上传到 " + entry.path, () => requestUpload(entry.path)),
      actionButton("new-folder", "在 " + entry.path + " 下新建文件夹", () => createDirectory(entry.path)),
    );
  }
  if (!isEncrypted) {
    row.append(actionButton("delete", "删除 " + entry.path, () => removeEntry(entry), true));
  }
  item.appendChild(row);

  if (isDir) addChildren(item, row, twisty, typeIcon, entry.path, isEncrypted);
  return item;
}

function addChildren(item, row, twisty, typeIcon, path, encrypted = false) {
  const wrapper = document.createElement("div");
  wrapper.className = "children";
  const children = document.createElement("ul");
  wrapper.appendChild(children);
  item.appendChild(wrapper);
  row.addEventListener("click", async (event) => {
    if (event.target.closest("button")) return;

    if (encrypted && !vaultTokens.has(path)) {
      // 未解锁：弹出密码输入框
      const pw = await passwordPrompt("解锁加密文件夹「" + path + "」");
      if (!pw) return;
      try {
        const resp = await fetch("/api/vaults/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, password: pw }),
        });
        if (!resp.ok) {
          const detail = await getErrorMessage(resp, "解锁失败");
          throw new Error(detail);
        }
        const data = await resp.json();
        vaultTokens.set(path, data.token);
        // 解锁成功，切换图标并加载内容
        setIcon(typeIcon, "folder-open");
        item.classList.add("unlocked");
        wrapper.classList.add("open");
        twisty.classList.add("open");
        await loadChildren(path, children, data.token);
        // 重建行内按钮
        rebuildEncryptedRow(item, row, path);
      } catch (err) {
        await alertModal("解锁失败", err.message);
      }
      return;
    }

    if (encrypted && vaultTokens.has(path)) {
      const open = wrapper.classList.toggle("open");
      twisty.classList.toggle("open", open);
      setIcon(typeIcon, open ? "folder-open" : "folder");
      if (open && !children.dataset.loaded) {
        await loadChildren(path, children, vaultTokens.get(path));
      }
      return;
    }

    const open = wrapper.classList.toggle("open");
    twisty.classList.toggle("open", open);
    setIcon(typeIcon, open ? "folder-open" : "folder");
    if (open && !children.dataset.loaded) await loadChildren(path, children);
  });
}

function rebuildEncryptedRow(item, row, path) {
  // 在已解锁的加密文件夹行末尾重新添加操作按钮
  const entry = { path, type: "dir", name: path.split("/").pop() };
  const btnDownload = actionButton("download", "下载 " + entry.name, () => download(entry.path, entry.name));
  const btnUpload = actionButton("upload", "上传到 " + entry.path, () => requestUpload(entry.path));
  const btnMkdir = actionButton("new-folder", "在 " + entry.path + " 下新建文件夹", () => createDirectory(entry.path));
  const btnDelete = actionButton("delete", "删除 " + entry.path, () => removeEntry(entry), true);
  row.append(btnDownload, btnUpload, btnMkdir, btnDelete);
}

export async function loadChildren(path, container, token = null) {
  try {
    const data = await getEntries(path, token || getVaultToken(path));
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
  const params = new URLSearchParams({ path: entry.path });
  const token = getVaultToken(entry.path);
  if (token) params.set("token", token);
  const response = await fetch("/api/files?" + params.toString(), { method: "DELETE" });
  if (!response.ok) return alertModal("删除失败", await getErrorMessage(response, "删除失败"));
  await loadRoot();
}

async function addDirectory(parent, name) {
  const body = { name, parent };
  const token = getVaultToken(parent);
  if (token) body.token = token;
  const response = await fetch("/api/dirs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "创建失败"));
  await loadRoot();
}

async function createDirectory(parent = "") {
  const title = parent ? "在「" + parent + "」下新建文件夹" : "新建文件夹";
  const result = await openModal({
    title,
    input: true,
    placeholder: "文件夹名称",
    hint: "输入文件夹名称，不支持 / 和开头为 . 的名称",
    confirmText: "确定",
    switch: true,
    switchLabel: "加密",
  });
  if (!result) return;

  if (result.encrypted) {
    try {
      const body = { name: result.name, parent, password: result.password };
      const token = getVaultToken(parent);
      if (token) body.token = token;
      const response = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, "创建失败"));
      await loadRoot();
    } catch (error) {
      await alertModal("创建失败", error.message);
    }
  } else {
    addDirectory(parent, result.name).catch((error) => alertModal("创建失败", error.message));
  }
}

refresh.addEventListener("click", loadRoot);
newDirectory.addEventListener("click", () => createDirectory());
