// Minimal XML parser / writer. No dependencies; works in browsers and Node.
// Parser: elements, attributes, text, CDATA, entities. Namespace prefixes are dropped from names.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e] ?? m;
  });
}

export function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const local = (n) => n.slice(n.indexOf(":") + 1);

/** @returns {{name:string, attrs:Record<string,string>, children:any[], text:string}} root element */
export function parseXml(src) {
  let i = 0;
  const n = src.length;
  const root = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { stack[stack.length - 1].text += decodeEntities(src.slice(i)); break; }
    if (lt > i) stack[stack.length - 1].text += decodeEntities(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) { i = src.indexOf("-->", lt) + 3; continue; }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt);
      stack[stack.length - 1].text += src.slice(lt + 9, end);
      i = end + 3; continue;
    }
    if (src[lt + 1] === "?" || src[lt + 1] === "!") { i = src.indexOf(">", lt) + 1; continue; }
    if (src[lt + 1] === "/") {
      stack.pop();
      i = src.indexOf(">", lt) + 1;
      if (stack.length === 0) throw new Error("Unbalanced XML");
      continue;
    }
    // start tag
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const name = local(src.slice(lt + 1, j));
    const attrs = {};
    while (j < n) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === ">" || src[j] === "/") break;
      let k = j;
      while (k < n && src[k] !== "=" && !/\s/.test(src[k])) k++;
      const an = local(src.slice(j, k));
      while (src[k] !== "=") k++;
      k++;
      while (/\s/.test(src[k])) k++;
      const q = src[k];
      const e = src.indexOf(q, k + 1);
      attrs[an] = decodeEntities(src.slice(k + 1, e));
      j = e + 1;
    }
    const el = { name, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(el);
    if (src[j] === "/") { i = src.indexOf(">", j) + 1; }
    else { stack.push(el); i = j + 1; }
  }
  if (stack.length !== 1) throw new Error("Unclosed XML element: " + stack[stack.length - 1].name);
  return root.children[0];
}

export const kids = (el, name) => (el ? el.children.filter((c) => c.name === name) : []);
export const kid = (el, name) => (el ? el.children.find((c) => c.name === name) : undefined);

// ---------- writer ----------

/** Element builder: x("a", {k:"v"}, child1, "text", ...) */
export function x(name, attrs = {}, ...children) {
  return { name, attrs, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) };
}

export function serialize(node, indent = 0) {
  const pad = "  ".repeat(indent);
  if (typeof node === "string") return pad + escapeXml(node);
  const a = Object.entries(node.attrs ?? {}).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join("");
  if (!node.children.length) return `${pad}<${node.name}${a}/>`;
  if (node.children.length === 1 && typeof node.children[0] === "string")
    return `${pad}<${node.name}${a}>${escapeXml(node.children[0])}</${node.name}>`;
  return `${pad}<${node.name}${a}>\n${node.children.map((c) => serialize(c, indent + 1)).join("\n")}\n${pad}</${node.name}>`;
}

export const xmlDocument = (root) => `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root)}\n`;
