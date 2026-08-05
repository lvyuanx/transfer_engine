"use strict";

const $ = (id) => document.getElementById(id);
const treeEl = $("tree");
const treeTitle = $("tree-title");
const treeEmpty = $("tree-empty");
const messagesEl = $("messages");
const onlineEl = $("online");
const meInput = $("me");
const renameBtn = $("rename");
const refreshBtn = $("refresh");
const uploadRootBtn = $("upload-root");
const newDirBtn = $("new-dir");
const uploadsEl = $("uploads");
const uploadListEl = $("upload-list");
const uploadsTitleEl = $("uploads-title");
const uploadsClearBtn = $("uploads-clear");
const composer = $("composer");
const input = $("input");

const SCROLL_FOLLOW_EPS = 40;

let ws = null;
let myUser = "";
let myName = "";
let lastId = 0;
let oldestId = 0;
let hasMoreHistory = false;
let loadingOlder = false;
let uploadBusy = false;
const expanded = new Set();

/* ---------- icons ---------- */

const ICONS = {
  logo:
    '<rect x="2.5" y="2.5" width="19" height="19" rx="5"/>' +
    '<path d="M8 16 16 8"/><polyline points="10.5 8 16 8 16 13.5"/>' +
    '<path d="M16 16 8 8"/><polyline points="13.5 16 8 16 8 10.5"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  refresh:
    '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>' +
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>' +
    '<path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  "new-folder":
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
  delete:
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/>',
  rename:
    '<path d="M12 20h9"/>' +
    '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  clear:
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' +
    '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chat:
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  network:
    '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>' +
    '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  folder:
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  "folder-open":
    '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  file:
    '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>' +
    '<polyline points="13 2 13 9 20 9"/>',
  "file-image":
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
    '<polyline points="21 15 16 10 5 21"/>',
  "file-archive":
    '<path d="M16.5 9.4 7.55 4.24"/>' +
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' +
    '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  "file-audio":
    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  "file-video":
    '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  "chevron-right": '<polyline points="9 18 15 12 9 6" stroke-width="2.2"/>',
};

function svgIcon(name) {
  const span = document.createElement("span");
  span.className = "svg-icon " + name;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    (ICONS[name] || "") +
    "</svg>";
  return span;
}

function setIcon(el, name) {
  el.replaceChildren(svgIcon(name));
}

function injectIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    if (!name) return;
    el.removeAttribute("data-icon");
    el.prepend(svgIcon(name));
  });
}

function fileIconName(name) {
  const m = /.([a-z0-9]+)$/i.exec(name || "");
  const ext = m ? m[1].toLowerCase() : "";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"].includes(ext)) return "file-archive";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext)) return "file-image";
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"].includes(ext)) return "file-audio";
  if (["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v"].includes(ext)) return "file-video";
  return "file";
}

/* ---------- files ---------- */

function fmtSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return value.toFixed(value >= 100 ? 0 : 1) + " " + units[i];
}

function fmtSpeed(bytesPerSec) {
  if (!isFinite(bytesPerSec) || bytesPerSec <= 0) return "";
  return fmtSize(bytesPerSec) + "/s";
}

function fmtEta(seconds) {
  if (!isFinite(seconds) || seconds < 1) return "";
  if (seconds < 60) return "约 " + Math.ceil(seconds) + " 秒";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = Math.ceil(seconds % 60);
    return "约 " + minutes + " 分" + (rest > 0 ? " " + rest + " 秒" : "");
  }
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  return "约 " + hours + " 小时" + (restMin > 0 ? " " + restMin + " 分" : "");
}

function makeSpeedTracker() {
  let lastLoaded = 0;
  let lastTs = null;
  let speed = 0;
  return function (loaded) {
    const now = performance.now();
    if (lastTs != null && now > lastTs) {
      const dt = (now - lastTs) / 1000;
      const instant = (loaded - lastLoaded) / dt;
      speed = speed === 0 ? instant : speed * 0.7 + instant * 0.3;
    }
    lastLoaded = loaded;
    lastTs = now;
    return speed;
  };
}

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function fetchTree(path) {
  const url = "/api/tree" + (path ? "?path=" + encodeURIComponent(path) : "");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  return resp.json();
}

function buildNode(entry) {
  const li = document.createElement("li");
  li.className = entry.type === "dir" ? "folder" : "file";
  li.dataset.path = entry.path;

  const row = document.createElement("div");
  row.className = "tree-row";
  row.title = entry.path;

  const twisty = document.createElement("span");
  twisty.className = "twisty";
  if (entry.type === "dir") twisty.append(svgIcon("chevron-right"));

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.append(svgIcon(entry.type === "dir" ? "folder" : fileIconName(entry.name)));

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = entry.name;

  const size = document.createElement("span");
  size.className = "size";
  size.textContent = entry.type === "dir" ? "" : fmtSize(entry.size);

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "download-btn";
  downloadBtn.title = "下载 " + entry.name;
  downloadBtn.setAttribute("aria-label", "下载 " + entry.name);
  downloadBtn.append(svgIcon("download"));
  downloadBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const a = document.createElement("a");
    a.href = "/api/download?path=" + encodeURIComponent(entry.path);
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  row.append(twisty, icon, name, size, downloadBtn);
  addRowButtons(row, entry);
  li.appendChild(row);

  if (entry.type === "dir") {
    const wrap = document.createElement("div");
    wrap.className = "children";
    const ul = document.createElement("ul");
    const loading = document.createElement("li");
    loading.className = "empty";
    loading.textContent = "加载中…";
    ul.appendChild(loading);
    wrap.appendChild(ul);
    li.appendChild(wrap);

    row.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (ev.target.closest(".download-btn")) return;
      const isOpen = wrap.classList.toggle("open");
      twisty.classList.toggle("open", isOpen);
      setIcon(icon, isOpen ? "folder-open" : "folder");
      if (isOpen) expanded.add(entry.path);
      else expanded.delete(entry.path);
      if (isOpen && !ul.dataset.loaded) {
        await loadChildren(entry.path, ul);
      }
    });
  }
  return li;
}

async function loadChildren(path, ul) {
  try {
    const data = await fetchTree(path);
    ul.dataset.loaded = "1";
    ul.replaceChildren();
    if (!data.entries.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "（空目录）";
      ul.appendChild(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const entry of data.entries) frag.appendChild(buildNode(entry));
    ul.appendChild(frag);
  } catch {
    ul.dataset.loaded = "1";
    ul.replaceChildren();
    const err = document.createElement("li");
    err.className = "empty";
    err.textContent = "加载失败";
    ul.appendChild(err);
  }
}

function findNodeByPath(path) {
  return treeEl.querySelector('[data-path="' + CSS.escape(path) + '"]');
}

async function loadRoot() {
  treeEl.replaceChildren();
  refreshBtn.classList.add("spinning");
  try {
    const data = await fetchTree("");
    treeEmpty.classList.toggle("hidden", data.entries.length > 0);
    const frag = document.createDocumentFragment();
    for (const entry of data.entries) frag.appendChild(buildNode(entry));
    treeEl.appendChild(frag);
  } catch {
    treeEmpty.classList.remove("hidden");
    treeEmpty.textContent = "文件列表加载失败";
  } finally {
    refreshBtn.classList.remove("spinning");
  }
}

refreshBtn.addEventListener("click", loadRoot);

/* ---------- file operations ---------- */

function setUploadsTitle(done, total, failed) {
  const label = done >= total ? "上传完成" : "正在上传";
  let text = label + " " + done + "/" + total;
  if (failed > 0) text += "（" + failed + " 个失败）";
  uploadsTitleEl.textContent = text;
}

function createUploadItem(file) {
  const item = document.createElement("div");
  item.className = "upload-item";

  const meta = document.createElement("div");
  meta.className = "upload-meta";
  const name = document.createElement("span");
  name.className = "upload-name";
  name.textContent = file.name;
  name.title = file.name;
  const percent = document.createElement("span");
  percent.className = "upload-percent";
  percent.textContent = "0%";
  meta.append(name, percent);

  const barWrap = document.createElement("div");
  barWrap.className = "progress";
  const bar = document.createElement("div");
  bar.className = "progress-bar";
  barWrap.appendChild(bar);

  const sub = document.createElement("div");
  sub.className = "upload-sub";
  const size = document.createElement("span");
  size.className = "upload-size";
  size.textContent = "0 B / " + fmtSize(file.size);
  const speed = document.createElement("span");
  speed.className = "upload-speed";
  const eta = document.createElement("span");
  eta.className = "upload-eta";
  sub.append(size, speed, eta);

  item.append(meta, barWrap, sub);

  item.update = function (loaded, total, speedVal, pct) {
    const shownLoaded = Math.min(loaded, file.size);
    percent.textContent = Math.floor(pct) + "%";
    bar.style.width = pct + "%";
    size.textContent = fmtSize(shownLoaded) + " / " + fmtSize(file.size);
    speed.textContent = fmtSpeed(speedVal);
    const remain = Math.max(0, file.size - shownLoaded);
    eta.textContent = speedVal > 0 ? fmtEta(remain / speedVal) : "";
  };

  item.finish = function (ok, errMsg) {
    item.classList.add(ok ? "done" : "error");
    percent.textContent = ok ? "100%" : "失败";
    bar.style.width = ok ? "100%" : "100%";
    speed.textContent = ok ? "完成" : "";
    eta.textContent = ok ? "" : errMsg || "上传失败";
  };

  return item;
}

function uploadOne(dir, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("files", file);
    const url = "/api/upload" + (dir ? "?dir=" + encodeURIComponent(dir) : "");
    xhr.open("POST", url);
    const track = makeSpeedTracker();
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(100, (e.loaded / e.total) * 100);
      onProgress(e.loaded, e.total, track(e.loaded), pct);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let msg = "HTTP " + xhr.status;
      try {
        const data = JSON.parse(xhr.responseText);
        if (data && data.detail) msg = data.detail;
      } catch (_) {
        // keep generic message
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.send(fd);
  });
}

async function uploadFiles(dir, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (uploadBusy) {
    alert("已有上传正在进行，请等待完成");
    return;
  }
  uploadBusy = true;

  // 清理已结束的旧条目，保留进行中的
  const doneItems = uploadListEl.querySelectorAll(".upload-item.done, .upload-item.error");
  doneItems.forEach((el) => el.remove());

  uploadsEl.classList.remove("hidden");
  const items = files.map((f) => createUploadItem(f));
  const frag = document.createDocumentFragment();
  items.forEach((el) => frag.appendChild(el));
  uploadListEl.appendChild(frag);

  const total = files.length;
  let done = 0;
  let failed = 0;
  setUploadsTitle(done, total, failed);

  try {
    for (let i = 0; i < files.length; i++) {
      try {
        await uploadOne(dir, files[i], (loaded, totalBytes, speedVal, pct) => {
          items[i].update(loaded, totalBytes, speedVal, pct);
        });
        items[i].finish(true);
      } catch (err) {
        failed += 1;
        items[i].finish(false, err.message);
      } finally {
        done += 1;
        setUploadsTitle(done, total, failed);
      }
    }
  } finally {
    uploadBusy = false;
    await loadRoot();
  }
}

function pickAndUpload(dir) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.onchange = () => {
    uploadFiles(dir, input.files).catch((err) => alert(err.message));
  };
  input.click();
}

async function doCreateDir(parent, name) {
  const resp = await fetch("/api/dirs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent: parent || "" }),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    throw new Error(detail.detail || "创建失败");
  }
  if (parent) {
    const node = findNodeByPath(parent);
    if (node) await loadChildren(parent, node.querySelector("ul"));
    else await loadRoot();
  } else {
    await loadRoot();
  }
}

function createDir(parent) {
  const title = parent ? "在「" + parent + "」下新建文件夹" : "新建文件夹";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";

  const heading = document.createElement("h2");
  heading.className = "modal-title";
  heading.textContent = title;

  const input = document.createElement("input");
  input.className = "modal-input";
  input.type = "text";
  input.placeholder = "文件夹名称";
  input.maxLength = 100;
  input.autocomplete = "off";
  input.spellcheck = false;

  const hint = document.createElement("p");
  hint.className = "modal-hint";
  hint.textContent = "输入文件夹名称，不支持 / 和开头为 . 的名称";

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ghost-btn";
  cancelBtn.textContent = "取消";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "primary-btn";
  okBtn.textContent = "创建";

  actions.append(cancelBtn, okBtn);
  modal.append(heading, input, hint, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };

  const submit = async () => {
    const name = input.value.trim();
    if (!name) {
      hint.textContent = "请输入文件夹名称";
      hint.classList.add("modal-error");
      input.focus();
      return;
    }
    okBtn.disabled = true;
    okBtn.textContent = "创建中…";
    try {
      await doCreateDir(parent, name);
      close();
    } catch (err) {
      okBtn.disabled = false;
      okBtn.textContent = "创建";
      hint.textContent = err.message || "创建失败";
      hint.classList.add("modal-error");
      input.select();
      input.focus();
    }
  };

  const onKey = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      submit();
    }
  };

  cancelBtn.addEventListener("click", close);
  okBtn.addEventListener("click", submit);
  document.addEventListener("keydown", onKey);
  input.focus();
}

async function removeEntry(path, type) {
  if (!confirm("确定删除" + type + "「" + path + "」？")) return;
  const resp = await fetch("/api/files?path=" + encodeURIComponent(path), { method: "DELETE" });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    alert(detail.detail || "删除失败");
    return;
  }
  await loadRoot();
}

function addRowButtons(row, entry) {
  if (entry.type === "dir") {
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "download-btn row-btn";
    upBtn.title = "上传到此目录";
    upBtn.setAttribute("aria-label", "上传到 " + entry.path);
    upBtn.append(svgIcon("upload"));
    upBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      pickAndUpload(entry.path);
    });
    row.appendChild(upBtn);

    const mkdirBtn = document.createElement("button");
    mkdirBtn.type = "button";
    mkdirBtn.className = "download-btn row-btn";
    mkdirBtn.title = "新建子文件夹";
    mkdirBtn.setAttribute("aria-label", "在 " + entry.path + " 下新建文件夹");
    mkdirBtn.append(svgIcon("new-folder"));
    mkdirBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      createDir(entry.path);
    });
    row.appendChild(mkdirBtn);
  }
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "download-btn row-btn danger";
  delBtn.title = "删除";
  delBtn.setAttribute("aria-label", "删除 " + entry.path);
  delBtn.append(svgIcon("delete"));
  delBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    removeEntry(entry.path, entry.type === "dir" ? "目录" : "文件");
  });
  row.appendChild(delBtn);
}

uploadsClearBtn.addEventListener("click", () => {
  uploadListEl
    .querySelectorAll(".upload-item.done, .upload-item.error")
    .forEach((el) => el.remove());
  if (!uploadListEl.children.length) uploadsEl.classList.add("hidden");
});

uploadRootBtn.addEventListener("click", () => pickAndUpload(""));
newDirBtn.addEventListener("click", () => createDir(""));

/* ---------- chat ---------- */

function addSystem(text) {
  const shouldFollow = isNearBottom();
  const div = document.createElement("div");
  div.className = "sys";
  div.textContent = text;
  messagesEl.appendChild(div);
  if (shouldFollow) scrollToBottom("auto");
}

function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight <= SCROLL_FOLLOW_EPS;
}

function scrollToBottom(behavior) {
  if (behavior) messagesEl.style.scrollBehavior = behavior;
  messagesEl.scrollTop = messagesEl.scrollHeight;
  if (behavior) messagesEl.style.scrollBehavior = "";
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function buildMessage(user, text, time) {
  const div = document.createElement("div");
  div.className = "msg" + (user === myName ? " self" : "");
  const meta = document.createElement("div");
  meta.className = "msg-meta";
  const who = document.createElement("span");
  who.className = "msg-user";
  who.textContent = user;
  const when = document.createElement("span");
  when.className = "msg-time";
  when.textContent = time || "";
  const body = document.createElement("p");
  body.className = "msg-text";
  body.textContent = text;
  meta.append(who, when);
  div.append(meta, body);
  return div;
}

function addMessage(user, text, time) {
  const shouldFollow = isNearBottom();
  messagesEl.appendChild(buildMessage(user, text, time));
  if (shouldFollow) scrollToBottom("auto");
}

function renderHistory(history) {
  if (!history || !history.length) {
    hasMoreHistory = false;
    return;
  }
  const frag = document.createDocumentFragment();
  let count = 0;
  for (const m of history) {
    if (m.id != null && m.id <= lastId) continue;
    frag.appendChild(buildMessage(m.user, m.text, m.time || fmtTime(m.ts)));
    count += 1;
  }
  if (count) {
    messagesEl.appendChild(frag);
    addSystem("已加载最近 " + count + " 条消息");
  }
  const ids = history.map((m) => m.id).filter((id) => id != null);
  if (ids.length) {
    lastId = Math.max(lastId, ...ids);
    oldestId = Math.min(oldestId, ...ids);
  }
  hasMoreHistory = history.length >= 100;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadOlder() {
  if (loadingOlder || !hasMoreHistory) return;
  loadingOlder = true;
  try {
    const params = new URLSearchParams({ limit: "50" });
    if (oldestId > 0) params.set("before_id", String(oldestId));
    const resp = await fetch("/api/messages?" + params.toString());
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    if (!data.messages.length) {
      hasMoreHistory = false;
      return;
    }
    const oldHeight = messagesEl.scrollHeight;
    const firstMsg = messagesEl.querySelector(".msg");
    const frag = document.createDocumentFragment();
    for (const m of data.messages) {
      frag.appendChild(buildMessage(m.user, m.text, m.time || fmtTime(m.ts)));
    }
    if (firstMsg) messagesEl.insertBefore(frag, firstMsg);
    else messagesEl.appendChild(frag);

    const prevBehavior = messagesEl.style.scrollBehavior;
    messagesEl.style.scrollBehavior = "auto";
    messagesEl.scrollTop += messagesEl.scrollHeight - oldHeight;
    messagesEl.style.scrollBehavior = prevBehavior;

    const ids = data.messages.map((m) => m.id).filter((id) => id != null);
    if (ids.length) {
      lastId = Math.max(lastId, ...ids);
      oldestId = Math.min(oldestId, ...ids);
    }
    hasMoreHistory = data.has_more;
  } catch {
    // Keep has_more true so scrolling again retries.
  } finally {
    loadingOlder = false;
    if (hasMoreHistory && messagesEl.scrollHeight <= messagesEl.clientHeight) {
      loadOlder();
    }
  }
}

messagesEl.addEventListener("scroll", () => {
  if (messagesEl.scrollTop <= 10) loadOlder();
});

function setPresence(online, users) {
  onlineEl.textContent = online;
  const label = online === 1 ? "1 人在线" : online + " 人在线";
  document.title = "LAN Transfer · " + label;
  if (users && !users.includes(myUser)) {
    myName = "";
  }
}

function initName(name) {
  myUser = name;
  myName = name;
  meInput.value = name;
  addSystem("你已连接，默认用户名：" + name + "。可在右上角改名。");
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(proto + "://" + location.host + "/ws/chat");

  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === "init") {
      initName(data.user);
      setPresence(data.online, data.users);
      renderHistory(data.history);
    } else if (data.type === "presence") {
      setPresence(data.online, data.users);
    } else if (data.type === "message") {
      if (data.id != null && data.id <= lastId) return;
      if (data.id != null) lastId = data.id;
      addMessage(data.user, data.text, data.time || fmtTime(data.ts));
    }
  };

  ws.onclose = () => {
    addSystem("连接断开，正在重连…");
    setTimeout(connect, 1500);
  };

  ws.onerror = () => ws.close();
}

composer.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  ws.send(JSON.stringify({ type: "chat", text }));
  input.value = "";
  input.focus();
});

renameBtn.addEventListener("click", () => {
  const name = meInput.value.trim().slice(0, 32);
  if (!name || name === myName) return;
  myName = name;
  ws.send(JSON.stringify({ type: "set_name", name }));
  addSystem("你已改名为 " + name);
});

meInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") renameBtn.click();
});

/* ---------- boot ---------- */

injectIcons();
loadRoot();
connect();
