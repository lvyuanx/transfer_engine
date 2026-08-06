import { openModal } from "./modal.js";
import { getErrorMessage } from "./utils.js";

async function copyText(text) {
  // 局域网 http 通常不是安全上下文，navigator.clipboard 不可用，需 execCommand 兜底
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * 打开分享配置弹窗；点击「复制链接」创建分享并复制完整 URL 后关闭。
 * @param {string} path 相对共享目录的路径
 * @param {string} name 显示名（仅用于提示文案）
 * @param {string|null} token 位于加密文件夹内时的 vault token
 */
export function shareEntry(path, name, token) {
  return openModal({
    title: "分享「" + path + "」",
    message: "对方打开链接即可直接下载；加密分享会要求输入访问密码。",
    switch: true,
    switchLabel: "是否加密",
    radiosLabel: "有效期",
    radios: [
      { value: "1d", label: "1天" },
      { value: "7d", label: "7天" },
      { value: "forever", label: "永久", default: true },
    ],
    confirmText: "复制链接",
    onSubmit: async (state) => {
      const resp = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          encrypted: state.encrypted,
          password: state.encrypted ? state.password : "",
          expires: state.radiosValue,
          token: token || undefined,
        }),
      });
      if (!resp.ok) throw new Error(await getErrorMessage(resp, "创建分享失败"));
      const data = await resp.json();
      const url = window.location.origin + "/s/" + data.id;
      if (!(await copyText(url))) {
        throw new Error("链接已生成，但复制失败，请手动复制: " + url);
      }
    },
  });
}
