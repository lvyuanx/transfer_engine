export const $ = (id) => document.getElementById(id);

export function fmtSize(bytes) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value.toFixed(unit && value < 100 ? 1 : 0) + " " + units[unit];
}

export function fmtTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

export function getErrorMessage(response, fallback) {
  return response.json().then((body) => body.detail || fallback).catch(() => fallback);
}
