let lastFocus = null;

function closeOverlay(overlay) {
  overlay.remove();
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

/**
 * 打开一个统一样式弹窗。
 * options:
 *   title       弹窗标题
 *   message     正文文本（可选）
 *   input       是否显示输入框（可选，此时返回 Promise<输入值|null>）
 *   inputType   输入框类型（默认 “text”）
 *   placeholder 输入框占位符
 *   maxLength   输入框最大长度
 *   hint        输入框下方提示
 *   initial     输入框初始值
 *   confirmText 确认按钮文案（默认”确定”）
 *   cancelText  取消按钮文案（默认”取消”）
 *   danger      确认按钮是否为危险样式
 *   switch      是否显示加密开关（与 input 配合使用）
 *   switchLabel 开关标签文案（默认”加密”）
 *   onSubmit    点击确认时回调；返回 Promise 时按钮会进入 loading，抛出错误则显示在提示区
 */
export function openModal(options = {}) {
  const {
    title = “”,
    message = “”,
    input = false,
    inputType = “text”,
    placeholder = “”,
    maxLength = 200,
    hint = “”,
    initial = “”,
    confirmText = “确定”,
    cancelText = “取消”,
    danger = false,
    switch: showSwitch = false,
    switchLabel = “加密”,
    onSubmit = null,
  } = options;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const heading = document.createElement("h2");
  heading.className = "modal-title";
  heading.textContent = title;

  const body = document.createElement("div");
  body.className = "modal-body";

  if (message) {
    const text = document.createElement("p");
    text.className = "modal-text";
    text.textContent = message;
    body.appendChild(text);
  }

  let inputEl = null;
  let hintEl = null;
  if (input) {
    inputEl = document.createElement("input");
    inputEl.className = "modal-input";
    inputEl.type = inputType;
    inputEl.placeholder = placeholder;
    inputEl.maxLength = maxLength;
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputEl.value = initial;
    body.appendChild(inputEl);

    if (hint) {
      hintEl = document.createElement("p");
      hintEl.className = "modal-hint";
      hintEl.textContent = hint;
      body.appendChild(hintEl);
    }
  }

  let switchEl = null;
  let switchTrack = null;
  let pwWrap = null;
  let pwEl = null;
  let pwHint = null;
  if (showSwitch && input) {
    // 加密开关行
    const switchRow = document.createElement("label");
    switchRow.className = "modal-switch-row";
    const switchLabelEl = document.createElement("span");
    switchLabelEl.className = "modal-switch-label";
    switchLabelEl.textContent = switchLabel;
    switchTrack = document.createElement("span");
    switchTrack.className = "modal-switch";
    switchEl = document.createElement("input");
    switchEl.type = "checkbox";
    switchEl.className = "modal-switch-input";
    switchTrack.appendChild(switchEl);
    const knob = document.createElement("span");
    knob.className = "modal-switch-knob";
    switchTrack.appendChild(knob);
    switchRow.append(switchLabelEl, switchTrack);
    body.appendChild(switchRow);

    // 密码输入（默认隐藏）
    pwWrap = document.createElement("div");
    pwWrap.className = "modal-pw-wrap hidden";
    pwEl = document.createElement("input");
    pwEl.className = "modal-input";
    pwEl.type = "password";
    pwEl.placeholder = "输入访问密码";
    pwEl.maxLength = 128;
    pwEl.autocomplete = "off";
    pwWrap.appendChild(pwEl);
    pwHint = document.createElement("p");
    pwHint.className = "modal-hint";
    pwHint.textContent = "设置密码后只有输入密码才能访问该文件夹";
    pwWrap.appendChild(pwHint);
    body.appendChild(pwWrap);

    switchEl.addEventListener("change", () => {
      pwWrap.classList.toggle("hidden", !switchEl.checked);
      pwHint.classList.remove("modal-error");
      if (switchEl.checked) setTimeout(() => pwEl.focus(), 80);
    });
  }

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ghost-btn";
  cancelBtn.textContent = cancelText;

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = danger ? "primary-btn danger-btn" : "primary-btn";
  okBtn.textContent = confirmText;

  actions.append(cancelBtn, okBtn);
  modal.append(heading, body, actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  if (!lastFocus) lastFocus = document.activeElement;
  (inputEl || cancelBtn).focus();

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    closeOverlay(overlay);
    document.removeEventListener("keydown", onKey);
    resolve(result);
  };

  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(null);
    }
  };
  document.addEventListener("keydown", onKey);

  async function submit() {
    if (inputEl) {
      const value = inputEl.value.trim();
      if (!value) {
        if (hintEl) {
          hintEl.textContent = "请输入内容";
          hintEl.classList.add("modal-error");
        }
        inputEl.focus();
        return;
      }
      if (showSwitch && switchEl && switchEl.checked) {
        if (!pwEl.value) {
          pwHint.textContent = "请输入密码";
          pwHint.classList.add("modal-error");
          pwEl.focus();
          return;
        }
        close({ name: value, encrypted: true, password: pwEl.value });
        return;
      }
      if (showSwitch) {
        close({ name: value, encrypted: false });
        return;
      }
      close(value);
      return;
    }
    if (!onSubmit) {
      close(true);
      return;
    }
    okBtn.disabled = true;
    const original = okBtn.textContent;
    okBtn.textContent = "处理中…";
    try {
      await onSubmit();
      close(true);
    } catch (error) {
      okBtn.disabled = false;
      okBtn.textContent = original;
      if (hintEl) {
        hintEl.textContent = error.message || "操作失败";
        hintEl.classList.add("modal-error");
      }
    }
  }

  cancelBtn.addEventListener("click", () => close(null));
  okBtn.addEventListener("click", submit);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close(null);
  });
  if (inputEl) {
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      }
    });
  }

  return promise;
}

/** 纯提示弹窗，返回 Promise，点击确定后 resolve。 */
export function alertModal(title, message) {
  return openModal({ title, message, confirmText: "确定" });
}

/** 确认弹窗，返回 Promise<boolean>。 */
export function confirmModal(title, message, options = {}) {
  return openModal({ title, message, confirmText: options.confirmText || "确定", danger: options.danger });
}

/** 输入弹窗，返回 Promise<string|null>，取消返回 null。 */
export function promptModal(title, options = {}) {
  return openModal({
    title,
    input: true,
    inputType: options.inputType || "text",
    placeholder: options.placeholder || "",
    maxLength: options.maxLength || 200,
    hint: options.hint || "",
    initial: options.initial || "",
    confirmText: options.confirmText || "确定",
  });
}
