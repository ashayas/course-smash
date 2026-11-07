// Diagrams in questions are SVG written by a model, so they are untrusted.
// The browser shows them through <img>, where scripts never run and nothing external loads.
// This allowlist is the second layer: it keeps only plain drawing elements, and returns null
// for anything it can't parse, so a bad figure is dropped rather than shown half-broken.

const MAX_LENGTH = 40_000;
const SVG_NS = "http://www.w3.org/2000/svg";

const ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", "marker",
]);
const ATTRIBUTES = new Set([
  "id", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "d", "points", "viewbox",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity",
  "stroke-opacity", "transform", "font-size", "font-weight", "font-family", "text-anchor", "dominant-baseline", "dx", "dy",
  "marker-end", "marker-start", "marker-mid", "markerwidth", "markerheight", "refx", "refy", "orient", "markerunits",
  "preserveaspectratio", "letter-spacing", "role", "aria-label", "xmlns",
]);
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9a-f]{1,6});/gi;

const escapeText = (text: string) => text.replace(ENTITY, (m) => `\u0000${m.slice(1)}`).replace(/&/g, "&amp;").replace(/\u0000/g, "&").replace(/>/g, "&gt;");
const escapeAttr = (value: string) => escapeText(value).replace(/"/g, "&quot;");

function safeValue(name: string, value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("javascript:") || lower.includes("data:") || /[<]/.test(value)) return false;
  // url() is only allowed for references inside the same SVG, such as arrowhead markers.
  const urls = lower.match(/url\([^)]*\)/g) ?? [];
  if (urls.some((u) => !/^url\(#[\w-]+\)$/.test(u))) return false;
  if (lower.includes("url(") && !name.startsWith("marker") && name !== "fill" && name !== "stroke") return false;
  if (name === "xmlns" && value !== SVG_NS) return false;
  return true;
}

/** Returns clean SVG markup, or null if `input` isn't a simple, well-formed drawing. */
export function sanitizeSvg(input: string | null | undefined): string | null {
  if (!input) return null;
  const source = input.trim().replace(/^<\?xml[^>]*\?>\s*/i, "");
  if (!source || source.length > MAX_LENGTH) return null;

  const token = /<!--[\s\S]*?-->|<\/([A-Za-z][\w:.-]*)\s*>|<([A-Za-z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/y;
  const attribute = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  const stack: string[] = [];
  let out = "";
  let index = 0;
  let sawRoot = false;

  while (index < source.length) {
    token.lastIndex = index;
    const match = token.exec(source);
    if (!match) return null;
    index = token.lastIndex;
    const [whole, closing, opening, attrs = "", selfClosing, text] = match;

    if (whole.startsWith("<!--")) continue;
    if (text !== undefined) {
      if (!stack.length) {
        if (text.trim()) return null;
        continue;
      }
      out += escapeText(text);
      continue;
    }
    if (closing) {
      const name = closing.toLowerCase();
      if (stack.pop() !== name) return null;
      out += `</${name === "svg" ? "svg" : closing}>`;
      continue;
    }

    const name = opening!;
    const lower = name.toLowerCase();
    if (!ELEMENTS.has(lower)) return null;
    if (!stack.length) {
      if (lower !== "svg" || sawRoot) return null;
      sawRoot = true;
    }

    const kept: string[] = [];
    let hasViewBox = false;
    for (const a of attrs.matchAll(attribute)) {
      const attrName = a[1]!;
      const value = a[2] ?? a[3] ?? "";
      const attrLower = attrName.toLowerCase();
      if (attrLower.startsWith("on") || !ATTRIBUTES.has(attrLower) || !safeValue(attrLower, value)) continue;
      if (lower === "svg" && !stack.length && (attrLower === "width" || attrLower === "height" || attrLower === "xmlns")) continue;
      if (attrLower === "viewbox") hasViewBox = true;
      kept.push(`${attrName}="${escapeAttr(value)}"`);
    }
    if (lower === "svg" && !stack.length) {
      if (!hasViewBox) return null;
      kept.unshift(`xmlns="${SVG_NS}"`);
    }
    const tag = `<${name}${kept.length ? " " + kept.join(" ") : ""}`;
    if (selfClosing) out += `${tag}/>`;
    else {
      out += `${tag}>`;
      stack.push(lower);
    }
  }
  if (stack.length || !sawRoot) return null;
  return out;
}
