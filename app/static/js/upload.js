import { $, fmtSize } from "./utils.js";
import { loadRoot } from "./tree.js";

const uploads = $("uploads");
const uploadList = $("upload-list");
const title = $("uploads-title");
const clear = $("uploads-clear");
const rootButton = $("upload-root");
const tree = $("tree");
let uploading = false;

function buildItem(file) {
  const item = document.createElement("div");
  item.className = "upload-item";
  const meta = document.createElement("div");
  meta.className = "upload-meta";
  const name = document.createElement("span");
  name.className = "upload-name";
  name.textContent = file.name;
  const percent = document.createElement("span");
  percent.className = "upload-percent";
  percent.textContent = "0%";
  meta.append(name, percent);
  const progress = document.createElement("div");
  progress.className = "progress";
  const bar = document.createElement("div");
  bar.className = "progress-bar";
  progress.appendChild(bar);
  const sub = document.createElement("div");
  sub.className = "upload-sub";
  sub.textContent = "0 B / " + fmtSize(file.size);
  item.append(meta, progress, sub);
  return {
    item,
    update(loaded) {
      const ratio = file.size ? Math.min(100, loaded / file.size * 100) : 100;
      percent.textContent = Math.floor(ratio) + "%";
      bar.style.width = ratio + "%";
      sub.textContent = fmtSize(loaded) + " / " + fmtSize(file.size);
    },
    finish(error) {
      item.classList.add(error ? "error" : "done");
      percent.textContent = error ? "失败" : "100%";
      bar.style.width = "100%";
      sub.textContent = error || "完成";
    },
  };
}

function uploadOne(directory, file, view) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("files", file);
    xhr.open("POST", "/api/upload" + (directory ? "?dir=" + encodeURIComponent(directory) : ""));
    xhr.upload.onprogress = (event) => event.lengthComputable && view.update(event.loaded);
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("上传失败"));
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.send(form);
  });
}

async function uploadFiles(directory, selected) {
  const files = Array.from(selected || []);
  if (!files.length) return;
  if (uploading) return alert("已有上传正在进行，请等待完成");
  uploading = true;
  uploads.classList.remove("hidden");
  let complete = 0;
  let failed = 0;
  try {
    for (const file of files) {
      const view = buildItem(file);
      uploadList.appendChild(view.item);
      try {
        await uploadOne(directory, file, view);
        view.finish();
      } catch (error) {
        failed += 1;
        view.finish(error.message);
      }
      complete += 1;
      title.textContent = "上传完成 " + complete + "/" + files.length + (failed ? "（" + failed + " 个失败）" : "");
    }
  } finally {
    uploading = false;
    await loadRoot();
  }
}

function chooseFiles(directory) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.addEventListener("change", () => uploadFiles(directory, input.files));
  input.click();
}

clear.addEventListener("click", () => {
  uploadList.querySelectorAll(".done, .error").forEach((item) => item.remove());
  if (!uploadList.children.length) uploads.classList.add("hidden");
});
rootButton.addEventListener("click", () => chooseFiles(""));
tree.addEventListener("upload-request", (event) => chooseFiles(event.detail));
