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
const composer = $("composer");
const input = $("input");

let ws = null;
let myUser = "";
let myName = "";
let lastId = 0;
let oldestId = 0;
let hasMoreHistory = false;
let loadingOlder = false;
const expanded = new Set();

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

function entryIcon(type) {
  return type === "dir" ? "▸" : "·";
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
  twisty.textContent = entry.type === "dir" ? "▸" : "";

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = entry.type === "dir" ? "🗀" : "🗎";

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
  downloadBtn.textContent = "↓";
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

/* ---------- chat ---------- */

function addSystem(text) {
  const div = document.createElement("div");
  div.className = "sys";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
  messagesEl.appendChild(buildMessage(user, text, time));
  messagesEl.scrollTop = messagesEl.scrollHeight;
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

loadRoot();
connect();
