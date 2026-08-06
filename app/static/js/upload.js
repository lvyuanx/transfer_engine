import { $, fmtSize } from "./utils.js";
import { loadRoot, getVaultToken } from "./tree.js";
import { alertModal, openModal } from "./modal.js";

const uploads = $("uploads");
const uploadList = $("upload-list");
const title = $("uploads-title");
const clear = $("uploads-clear");
const rootButton = $("upload-root");
const rootFolderButton = $("upload-folder-root");
const tree = $("tree");
let uploading = false;

function buildItem(file, label) {
  const item = document.createElement("div");
  item.className = "upload-item";
  const meta = document.createElement("div");
  meta.className = "upload-meta";
  const name = document.createElement("span");
  name.className = "upload-name";
  name.textContent = label || file.name;
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

function uploadOne(directory, file, view, rel = "") {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    // 文件夹上传时用相对路径（含子目录）作为 filename，后端据此创建目录
    form.append("files", file, rel || file.name);
    const params = new URLSearchParams();
    if (directory) params.set("dir", directory);
    const token = getVaultToken(directory);
    if (token) params.set("token", token);
    const qs = params.toString();
    xhr.open("POST", "/api/upload" + (qs ? "?" + qs : ""));
    xhr.upload.onprogress = (event) => event.lengthComputable && view.update(event.loaded);
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("上传失败"));
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.send(form);
  });
}

async function uploadFiles(directory, selected, folder = false) {
  const files = Array.from(selected || []);
  if (!files.length) return;
  if (uploading) return alertModal("提示", "已有上传正在进行，请等待完成");
  uploading = true;
  uploads.classList.remove("hidden");
  let complete = 0;
  let failed = 0;
  try {
    for (const file of files) {
      const rel = folder ? file.webkitRelativePath : "";
      const view = buildItem(file, rel);
      uploadList.appendChild(view.item);
      try {
        await uploadOne(directory, file, view, rel);
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

function chooseFolder(directory) {
  const input = document.createElement("input");
  input.type = "file";
  input.webkitdirectory = true;
  input.addEventListener("change", () => uploadFiles(directory, input.files, true));
  input.click();
}

/** 目录行上传按钮：先选择上传类型（文件 / 文件夹），再打开对应选择器。 */
function chooseUploadType(directory) {
  const where = directory ? "「" + directory + "」" : "根目录";
  return openModal({
    title: "上传到 " + where,
    message: "选择要上传的内容类型",
    radiosLabel: "上传类型",
    radios: [
      { value: "files", label: "上传文件", default: true },
      { value: "folder", label: "上传文件夹" },
    ],
    confirmText: "选择",
    // 在用户手势的同步路径中打开文件/文件夹选择器，避免丢失 user activation
    onSubmit: (state) => {
      if (state.radiosValue === "folder") chooseFolder(directory);
      else chooseFiles(directory);
    },
  });
}

clear.addEventListener("click", () => {
  uploadList.querySelectorAll(".done, .error").forEach((item) => item.remove());
  if (!uploadList.children.length) uploads.classList.add("hidden");
});
rootButton.addEventListener("click", () => chooseFiles(""));
rootFolderButton.addEventListener("click", () => chooseFolder(""));
tree.addEventListener("upload-request", (event) => chooseUploadType(event.detail));
