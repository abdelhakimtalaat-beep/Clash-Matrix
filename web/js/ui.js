// Tiny DOM helpers + bilingual text. t(ar, en) returns the string for the current language.
export const lang = { current: (() => { try { return localStorage.getItem("lang") || "ar"; } catch { return "ar"; } })() };
export const t = (ar, en) => (lang.current === "ar" ? ar : en);
export function setLang(l) {
  lang.current = l;
  try { localStorage.setItem("lang", l); } catch {}
  document.documentElement.lang = l; document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
}
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
let timer;
export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(timer); timer = setTimeout(() => el.classList.remove("show"), 3500);
}
export function download(name, data, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h("a", { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const badge = (text, kind = "") => h("span", { class: `badge ${kind}` }, text);
export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const i = h("input", { type: "file", accept, multiple, onchange: () => resolve(multiple ? [...i.files] : (i.files[0] ?? null)) });
    i.click();
  });
}
