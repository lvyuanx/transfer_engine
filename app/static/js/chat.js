import { $, fmtTime } from "./utils.js";

const messages = $("messages");
const online = $("online");
const nameInput = $("me");
const rename = $("rename");
const composer = $("composer");
const input = $("input");
let socket;
let username = "";
let ownName = "";
let lastId = 0;
let oldestId = 0;
let moreHistory = false;
let loading = false;

const STORAGE_KEY = "lan_chat_name";

function cachedName() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveName(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // localStorage 不可用（隐私模式等）时静默失败
  }
}

function nearBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight <= 40;
}

function appendSystem(text) {
  const follow = nearBottom();
  const item = document.createElement("div");
  item.className = "sys";
  item.textContent = text;
  messages.appendChild(item);
  if (follow) messages.scrollTop = messages.scrollHeight;
}

function buildMessage(message) {
  const item = document.createElement("div");
  item.className = "msg" + (message.user === ownName ? " self" : "");
  const meta = document.createElement("div");
  meta.className = "msg-meta";
  const user = document.createElement("span");
  user.className = "msg-user";
  user.textContent = message.user;
  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = message.time || fmtTime(message.ts);
  const text = document.createElement("p");
  text.className = "msg-text";
  text.textContent = message.text;
  meta.append(user, time);
  item.append(meta, text);
  return item;
}

function appendMessage(message) {
  if (message.id && message.id <= lastId) return;
  if (message.id) lastId = Math.max(lastId, message.id);
  const follow = nearBottom();
  messages.appendChild(buildMessage(message));
  if (follow) messages.scrollTop = messages.scrollHeight;
}

function updateIds(history) {
  const ids = history.map((message) => message.id).filter(Boolean);
  if (ids.length) {
    lastId = Math.max(lastId, ...ids);
    oldestId = oldestId ? Math.min(oldestId, ...ids) : Math.min(...ids);
  }
}

function initialize(data) {
  username = data.user;
  ownName = data.user;
  nameInput.value = data.user;
  // 先按服务端默认名通过 presence 检查，避免缓存名尚未被服务器认同时误清 ownName
  updatePresence(data.online, data.users);
  const saved = cachedName();
  if (saved && saved !== data.user) {
    username = saved;
    ownName = saved;
    nameInput.value = saved;
    socket.send(JSON.stringify({ type: "set_name", name: saved }));
    appendSystem("你已连接，已恢复上次的用户名：" + saved + "。可在右上角改名。");
  } else {
    appendSystem("你已连接，默认用户名：" + data.user + "。可在右上角改名。");
  }
  data.history.forEach(appendMessage);
  updateIds(data.history);
  moreHistory = data.history.length >= 100;
  messages.scrollTop = messages.scrollHeight;
}

function updatePresence(count, users) {
  online.textContent = count;
  document.title = "LAN Transfer · " + count + " 人在线";
  if (users && !users.includes(username)) ownName = "";
}

async function loadOlder() {
  if (loading || !moreHistory) return;
  loading = true;
  try {
    const response = await fetch("/api/messages?limit=50&before_id=" + oldestId);
    const data = await response.json();
    const height = messages.scrollHeight;
    const first = messages.querySelector(".msg");
    const fragment = document.createDocumentFragment();
    data.messages.forEach((message) => fragment.appendChild(buildMessage(message)));
    if (first) messages.insertBefore(fragment, first);
    else messages.appendChild(fragment);
    messages.scrollTop += messages.scrollHeight - height;
    updateIds(data.messages);
    moreHistory = data.has_more;
  } finally {
    loading = false;
  }
}

export function connectChat() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(protocol + "://" + location.host + "/ws/chat");
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "init") initialize(data);
    else if (data.type === "presence") updatePresence(data.online, data.users);
    else if (data.type === "message") appendMessage(data);
  };
  socket.onclose = () => {
    appendSystem("连接断开，正在重连…");
    setTimeout(connectChat, 1500);
  };
  socket.onerror = () => socket.close();
}

messages.addEventListener("scroll", () => messages.scrollTop <= 10 && loadOlder());
composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "chat", text }));
  input.value = "";
});
rename.addEventListener("click", () => {
  const name = nameInput.value.trim().slice(0, 32);
  if (!name || name === ownName || socket.readyState !== WebSocket.OPEN) return;
  ownName = name;
  saveName(name);
  socket.send(JSON.stringify({ type: "set_name", name }));
  appendSystem("你已改名为 " + name);
});
nameInput.addEventListener("keydown", (event) => event.key === "Enter" && rename.click());
