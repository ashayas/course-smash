// Isometric city art for Course Smash. Every course is a building: one floor per module,
// and a floor's windows light up when its module is passed.
// Output is SVG markup built only from numbers and the colours below, never from model text.

export const ARCHETYPES = ["tower", "setback", "rotunda", "capitol", "factory", "datacenter", "port", "greenhouse", "townhall"];
export const MATERIALS = ["sandstone", "brick", "glass", "teal", "concrete", "white"];
export const ROOFS = ["none", "garden", "helipad", "antenna", "dish", "tank", "solar"];

// Three tones per surface: top, left (lit) face, right (shade) face.
const M = {
  sandstone: ["#ead3a6", "#d4b27c", "#a9865a"],
  brick: ["#d9826a", "#b9533e", "#86392d"],
  glass: ["#9cc0f2", "#5b8bd6", "#3b62a6"],
  teal: ["#9ad9d2", "#4fa39d", "#2f736f"],
  concrete: ["#c9ccd1", "#9ea3ab", "#70757e"],
  white: ["#ffffff", "#e2e4e8", "#b5bac3"],
};
const C = {
  ink: "#141414", white: "#ffffff", paper: "#fbfbfb", night: "#27303f", nightDeep: "#1c2330", lit: "#f5d556", litWarm: "#f0b44a",
  grass: ["#7cbf6a", "#559a4e", "#3d7a3c"], pave: ["#c8c3b8", "#a19c92", "#7d786f"],
  road: ["#3a3d44", "#2c2f35", "#23262b"], tree: ["#5fae5b", "#3f8a44", "#2c6633"], trunk: "#6b4a2f",
  water: "#1f4f8f", waterHi: "#2f68b0", steel: ["#e8e8e8", "#b9bcc2", "#868a92"],
  orange: "#e65f2b", red: "#c8402f", yellow: "#f5d556", green: "#469b5b", blue: "#5889f7", pink: "#e7a0ea", purple: "#904cf6",
};

/* Projection: 2:1 pixel-art isometric. x runs down-right, y runs down-left, z is up. */
let S = 10;
// Every projected point widens the drawing's bounds, so each SVG can crop tightly to what it drew.
let bounds = null;
const P = (x, y, z = 0) => {
  const p = [(x - y) * S, ((x + y) / 2 - z) * S];
  if (bounds) {
    bounds[0] = Math.min(bounds[0], p[0]); bounds[1] = Math.min(bounds[1], p[1]);
    bounds[2] = Math.max(bounds[2], p[0]); bounds[3] = Math.max(bounds[3], p[1]);
  }
  return p;
};
function track(draw, pad) {
  bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const body = draw();
  const [x0, y0, x1, y1] = bounds;
  bounds = null;
  return { body, viewBox: [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2].map((v) => v.toFixed(1)).join(" ") };
}
const pt = ([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`;
const poly = (pts, fill, extra = "") => `<path d="M${pts.map(pt).join("L")}Z" fill="${fill}"${extra}/>`;

/** A box with its back corner at (x, y, z). Returns the three visible faces. */
function box(x, y, z, w, d, h, [top, left, right]) {
  return (
    poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left) +
    poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right) +
    poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top)
  );
}

/** Windows on the two visible faces of a box. `lit(floor, col)` says which are on. */
function windows(x, y, z, w, d, h, { floors, cols = Math.max(2, Math.round(w * 1.5)), colsD = Math.max(2, Math.round(d * 1.5)), lit, dark = C.night, band = false }) {
  let out = "";
  const fh = h / floors;
  const face = (o, along, n, len, side) => {
    for (let f = 0; f < floors; f++) {
      const z0 = z + f * fh + fh * 0.28, z1 = z + f * fh + fh * 0.8;
      if (band) {
        const a = 0.12, b = len - 0.12;
        out += poly([o(a, z0), o(b, z0), o(b, z1), o(a, z1)], lit(f, -1, side) ? C.lit : dark);
        continue;
      }
      const cw = len / n;
      for (let i = 0; i < n; i++) {
        const a = i * cw + cw * 0.22, b = (i + 1) * cw - cw * 0.22;
        out += poly([o(a, z0), o(b, z0), o(b, z1), o(a, z1)], lit(f, i, side) ? C.lit : dark);
      }
    }
  };
  face((u, zz) => P(x + u, y + d, zz), 0, cols, w, 0);
  face((u, zz) => P(x + w, y + u, zz), 1, colsD, d, 1);
  return out;
}

/** Upright cylinder centred on (cx, cy). */
function cylinder(cx, cy, z, r, h, [top, left, right]) {
  const [sx, syb] = P(cx, cy, z);
  const [, syt] = P(cx, cy, z + h);
  const rx = r * Math.SQRT2 * S, ry = (r / Math.SQRT2) * S;
  const f = (n) => n.toFixed(1);
  return (
    `<path d="M${f(sx - rx)},${f(syt)}V${f(syb)}A${f(rx)} ${f(ry)} 0 0 0 ${f(sx)},${f(syb + ry)}V${f(syt + ry)}Z" fill="${left}"/>` +
    `<path d="M${f(sx)},${f(syt + ry)}V${f(syb + ry)}A${f(rx)} ${f(ry)} 0 0 0 ${f(sx + rx)},${f(syb)}V${f(syt)}Z" fill="${right}"/>` +
    `<ellipse cx="${f(sx)}" cy="${f(syt)}" rx="${f(rx)}" ry="${f(ry)}" fill="${top}"/>`
  );
}
function cylinderWindows(cx, cy, z, r, h, floors, lit) {
  const [sx] = P(cx, cy, 0);
  const rx = r * Math.SQRT2 * S, ry = (r / Math.SQRT2) * S;
  const fh = h / floors;
  let out = "";
  for (let f = 0; f < floors; f++) {
    const [, y0] = P(cx, cy, z + f * fh + fh * 0.55);
    const dash = (rx * 0.32).toFixed(1);
    out += `<path d="M${(sx - rx * 0.92).toFixed(1)},${y0.toFixed(1)}A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 0 ${(sx + rx * 0.92).toFixed(1)},${y0.toFixed(1)}" fill="none" stroke="${lit(f) ? C.lit : C.night}" stroke-width="${(fh * S * 0.5).toFixed(1)}" stroke-dasharray="${dash} ${(rx * 0.16).toFixed(1)}"/>`;
  }
  return out;
}
function dome(cx, cy, z, r, [top, left, right]) {
  const [sx, sy] = P(cx, cy, z);
  const rx = r * Math.SQRT2 * S, ry = (r / Math.SQRT2) * S, rh = r * 1.25 * S;
  const f = (n) => n.toFixed(1);
  return (
    `<path d="M${f(sx - rx)},${f(sy)}A${f(rx)} ${f(rh)} 0 0 1 ${f(sx + rx)},${f(sy)}A${f(rx)} ${f(ry)} 0 0 1 ${f(sx - rx)},${f(sy)}Z" fill="${left}"/>` +
    `<path d="M${f(sx)},${f(sy - rh)}A${f(rx)} ${f(rh)} 0 0 1 ${f(sx + rx)},${f(sy)}A${f(rx)} ${f(ry)} 0 0 1 ${f(sx)},${f(sy + ry)}Q${f(sx + rx * 0.35)},${f(sy - rh * 0.4)} ${f(sx)},${f(sy - rh)}Z" fill="${right}"/>` +
    `<ellipse cx="${f(sx - rx * 0.35)}" cy="${f(sy - rh * 0.6)}" rx="${f(rx * 0.16)}" ry="${f(rh * 0.12)}" fill="${top}"/>`
  );
}
/** A square pyramid roof over a box footprint. */
function pyramid(x, y, z, w, d, h, [, left, right]) {
  const apex = P(x + w / 2, y + d / 2, z + h);
  return poly([P(x, y + d, z), P(x + w, y + d, z), apex], left) + poly([P(x + w, y, z), P(x + w, y + d, z), apex], right);
}
/** A gable roof with its ridge along x. */
function gable(x, y, z, w, d, h, [top, left, right]) {
  const ridgeA = P(x, y + d / 2, z + h), ridgeB = P(x + w, y + d / 2, z + h);
  return (
    poly([P(x, y + d, z), P(x + w, y + d, z), ridgeB, ridgeA], left) +
    poly([P(x + w, y, z), P(x + w, y + d, z), ridgeB], right) +
    poly([P(x, y, z), P(x + w, y, z), ridgeB, ridgeA], top)
  );
}
function tree(x, y, z = 0, s = 1) {
  const [sx, sy] = P(x, y, z);
  const r = 0.55 * s * S;
  return `<rect x="${(sx - 1.2).toFixed(1)}" y="${(sy - r * 0.9).toFixed(1)}" width="2.4" height="${(r * 0.9).toFixed(1)}" fill="${C.trunk}"/>` +
    `<circle cx="${sx.toFixed(1)}" cy="${(sy - r * 1.5).toFixed(1)}" r="${r.toFixed(1)}" fill="${C.tree[1]}"/>` +
    `<circle cx="${(sx - r * 0.3).toFixed(1)}" cy="${(sy - r * 1.75).toFixed(1)}" r="${(r * 0.55).toFixed(1)}" fill="${C.tree[0]}"/>`;
}

/* Roof props, placed on a roof whose back corner is (x, y, z) and size w × d. */
function roofProp(kind, x, y, z, w, d, accent) {
  const cx = x + w / 2, cy = y + d / 2;
  switch (kind) {
    case "garden": return box(x + 0.15, y + 0.15, z, w - 0.3, d - 0.3, 0.08, C.grass) + tree(cx - w * 0.15, cy, z + 0.08, 0.7) + tree(cx + w * 0.2, cy + d * 0.15, z + 0.08, 0.55);
    case "helipad": {
      const [sx, sy] = P(cx, cy, z + 0.02);
      const rx = Math.min(w, d) * 0.62 * S;
      return `<ellipse cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${(rx / 2).toFixed(1)}" fill="${C.road[0]}"/>` +
        `<ellipse cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="${(rx * 0.72).toFixed(1)}" ry="${(rx * 0.36).toFixed(1)}" fill="none" stroke="${C.yellow}" stroke-width="1.5"/>` +
        `<path d="M${(sx - rx * 0.25).toFixed(1)},${(sy - rx * 0.12).toFixed(1)}v${(rx * 0.24).toFixed(1)}M${(sx + rx * 0.25).toFixed(1)},${(sy - rx * 0.12).toFixed(1)}v${(rx * 0.24).toFixed(1)}M${(sx - rx * 0.25).toFixed(1)},${sy.toFixed(1)}h${(rx * 0.5).toFixed(1)}" stroke="${C.paper}" stroke-width="1.6" fill="none"/>`;
    }
    case "antenna": {
      const [sx, sy] = P(cx, cy, z);
      const [, ty] = P(cx, cy, z + 2.6);
      return box(cx - 0.3, cy - 0.3, z, 0.6, 0.6, 0.4, C.steel) +
        `<path d="M${sx.toFixed(1)},${(sy - 0.4 * S).toFixed(1)}V${ty.toFixed(1)}" stroke="${C.steel[1]}" stroke-width="2"/>` +
        `<circle cx="${sx.toFixed(1)}" cy="${ty.toFixed(1)}" r="2.6" fill="${C.red}" class="blink"/>`;
    }
    case "dish": {
      const [sx, sy] = P(cx, cy, z + 0.5);
      const r = Math.min(w, d) * 0.42 * S;
      return box(cx - 0.2, cy - 0.2, z, 0.4, 0.4, 0.5, C.steel) +
        `<g transform="rotate(-28 ${sx.toFixed(1)} ${sy.toFixed(1)})"><ellipse cx="${sx.toFixed(1)}" cy="${(sy - r * 0.35).toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.55).toFixed(1)}" fill="${C.steel[0]}"/>` +
        `<ellipse cx="${sx.toFixed(1)}" cy="${(sy - r * 0.42).toFixed(1)}" rx="${(r * 0.72).toFixed(1)}" ry="${(r * 0.36).toFixed(1)}" fill="${C.steel[2]}"/>` +
        `<circle cx="${sx.toFixed(1)}" cy="${(sy - r * 0.42).toFixed(1)}" r="2" fill="${accent}"/></g>`;
    }
    case "tank": return box(cx - 0.6, cy - 0.6, z, 0.12, 0.12, 0.7, C.road) + box(cx + 0.38, cy + 0.38, z, 0.12, 0.12, 0.7, C.road) +
      cylinder(cx, cy, z + 0.7, 0.5, 0.8, M.brick) + pyramid(cx - 0.5, cy - 0.5, z + 1.5, 1, 1, 0.4, M.brick);
    case "solar": {
      let out = "";
      const rows = Math.max(2, Math.floor(d / 0.6));
      for (let i = 0; i < rows; i++) out += box(x + 0.2, y + 0.2 + i * (d - 0.4) / rows, z, w - 0.4, (d - 0.4) / rows - 0.12, 0.12, ["#3b4f8a", "#2c3c6c", "#22305a"]);
      return out;
    }
    default: return "";
  }
}

/* Deterministic randomness from a string, so a course always draws the same way. */
export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)), (s >>> 0) / 4294967296);
}

/* Topic keywords to a building, for courses planned before icons existed and for the library. */
const KEYWORDS = [
  [/\b(gpu|inference|serving|throughput|vllm|kv cache|power|energy|electric|engine|manufactur)/i, { archetype: "factory", material: "brick", roof: "solar", accent: "yellow" }],
  [/\b(kubernetes|k8s|containers?|docker|pods?|helm|logistics|supply chain|shipping)\b/i, { archetype: "port", material: "concrete", roof: "none", accent: "orange" }],
  [/\b(network|tcp|http|dns|cloud|servers?|database|sql|distributed|apis?|linux|security)/i, { archetype: "datacenter", material: "concrete", roof: "dish", accent: "blue" }],
  [/\b(ai|llms?|models?|agents?|prompting|machine learning|neural|rag|embeddings?|transformers?)\b/i, { archetype: "tower", material: "glass", roof: "antenna", accent: "purple" }],
  [/bio|crispr|gene|cell|plant|garden|ecolog|climate|nature|chemistr/i, { archetype: "greenhouse", material: "teal", roof: "none", accent: "green" }],
  [/space|astro|physic|planet|star|quantum|telescope/i, { archetype: "rotunda", material: "white", roof: "dish", accent: "blue" }],
  [/history|law|politic|government|civic|philosoph|art|museum|literature|interview|public service/i, { archetype: "capitol", material: "white", roof: "none", accent: "yellow" }],
  [/language|spanish|french|japanese|school|teach|writing|grammar|music/i, { archetype: "townhall", material: "brick", roof: "none", accent: "green" }],
  [/finance|stat|econom|money|invest|market|a\/b|probabilit|account/i, { archetype: "setback", material: "sandstone", roof: "helipad", accent: "orange" }],
];

/** The icon spec for a course: the planner's choice when it made one, otherwise one from the topic. */
export function specFor(course) {
  const seed = hash(String(course.id ?? course.title ?? "x"));
  const pick = (list, n) => list[(seed >>> n) % list.length];
  const icon = course.icon && typeof course.icon === "object" ? course.icon : null;
  const text = `${course.title ?? ""} ${course.prompt ?? ""} ${(course.tags ?? []).join(" ")} ${course.track ?? ""}`;
  const title = String(course.title ?? "");
  const guess = (KEYWORDS.find(([re]) => re.test(title)) ?? KEYWORDS.find(([re]) => re.test(text)))?.[1];
  const base = guess ?? { archetype: pick(ARCHETYPES, 3), material: pick(MATERIALS, 7), roof: pick(ROOFS, 11), accent: pick(["orange", "yellow", "green", "blue", "pink", "purple"], 13) };
  const spec = { ...base, ...(icon ?? {}) };
  if (!ARCHETYPES.includes(spec.archetype)) spec.archetype = base.archetype;
  if (!MATERIALS.includes(spec.material)) spec.material = base.material;
  if (!ROOFS.includes(spec.roof)) spec.roof = base.roof;
  if (!C[spec.accent]) spec.accent = base.accent;
  spec.seed = seed;
  return spec;
}

/**
 * One building on its own plaza tile, drawn at the origin in a 6 × 6 lot.
 * progress: { floors, lit, building } where lit floors count from the ground up.
 */
function buildingAt(ox, oy, spec, { floors = 4, lit = 0, building = false, ambient = 0 } = {}) {
  const r = rng(spec.seed);
  const mat = M[spec.material];
  const accent = C[spec.accent];
  const n = Math.max(3, Math.min(8, floors));
  const isLit = (f, i, side) => f < lit || (ambient && r() < ambient) || (f === lit && building === false && lit < n && r() < 0.35 && i % 2 === side);
  let out = "";
  const X = (v) => ox + v, Y = (v) => oy + v;
  const shell = (body) => (building ? `<g opacity=".55">${body}</g>` : body);
  let roof = null;

  switch (spec.archetype) {
    case "tower": {
      const h = 1.6 + n * 1.05;
      out += box(X(1.6), Y(1.6), 0, 2.8, 2.8, h, mat) + windows(X(1.6), Y(1.6), 0, 2.8, 2.8, h, { floors: n * 2, cols: 5, colsD: 5, lit: (f, i, s) => isLit(Math.floor(f / 2), i, s) });
      out += box(X(1.6), Y(1.6), h, 2.8, 2.8, 0.25, [mat[0], C.night, C.nightDeep]);
      roof = [X(1.6), Y(1.6), h + 0.25, 2.8, 2.8];
      break;
    }
    case "setback": {
      const h1 = 1.2 + n * 0.55, h2 = n * 0.5, h3 = n * 0.35;
      const parts = [[1.2, 1.2, 0, 3.6, 3.6, h1], [1.6, 1.6, h1, 2.8, 2.8, h2], [2.0, 2.0, h1 + h2, 2.0, 2.0, h3]];
      let floorBase = 0;
      parts.forEach(([x, y, z, w, d, h], k) => {
        const fl = k === 0 ? Math.ceil(n / 2) : k === 1 ? Math.ceil(n / 3) : Math.max(1, n - Math.ceil(n / 2) - Math.ceil(n / 3));
        const base = floorBase;
        out += box(X(x), Y(y), z, w, d, h, mat) + windows(X(x), Y(y), z, w, d, h, { floors: fl * 2, cols: Math.round(w * 1.6), colsD: Math.round(d * 1.6), lit: (f, i, s) => isLit(base + Math.floor(f / 2), i, s) });
        floorBase += fl;
      });
      out += pyramid(X(2.0), Y(2.0), h1 + h2 + h3, 2.0, 2.0, 1.2, [mat[0], accent, C.nightDeep]);
      out += `<path d="M${pt(P(X(3), Y(3), h1 + h2 + h3 + 1.2))}V${(P(X(3), Y(3), h1 + h2 + h3 + 2.6)[1]).toFixed(1)}" stroke="${C.steel[1]}" stroke-width="1.6"/>`;

      break;
    }
    case "rotunda": {
      const h = 1.4 + n * 0.95;
      out += box(X(1.3), Y(1.3), 0, 3.4, 3.4, 0.6, M.concrete);
      out += cylinder(X(3), Y(3), 0.6, 1.25, h, mat) + cylinderWindows(X(3), Y(3), 0.6, 1.25, h, n * 2, (f) => isLit(Math.floor(f / 2), f, 0));
      out += cylinder(X(3), Y(3), h + 0.6, 1.9, 0.55, [mat[0], accent, C.nightDeep]);
      out += cylinder(X(3), Y(3), h + 1.15, 1.7, 0.35, [C.lit, mat[1], mat[2]]);
      out += cylinder(X(3), Y(3), h + 1.5, 1.2, 0.3, mat);
      roof = [X(2.3), Y(2.3), h + 1.8, 1.4, 1.4];
      break;
    }
    case "capitol": {
      const h = 1.4 + n * 0.32;
      out += box(X(0.8), Y(0.8), 0, 4.4, 4.4, 0.35, M.concrete);
      out += box(X(1.1), Y(1.1), 0.35, 3.8, 3.8, h, mat) + windows(X(1.1), Y(1.1), 0.35, 3.8, 3.8, h, { floors: n, cols: 6, colsD: 6, lit: isLit });
      out += box(X(1.1), Y(1.1), 0.35 + h, 3.8, 3.8, 0.3, [mat[0], mat[2], mat[2]]);
      out += cylinder(X(3), Y(3), 0.65 + h, 1.25, 0.9, mat) + cylinderWindows(X(3), Y(3), 0.65 + h, 1.25, 0.9, 1, () => lit >= n);
      out += dome(X(3), Y(3), 1.55 + h, 1.3, ["#cdeee6", "#7fc2b3", "#4f9686"]);
      const [sx, sy] = P(X(3), Y(3), 1.55 + h + 1.6);
      out += `<rect x="${(sx - 1.5).toFixed(1)}" y="${(sy - 8).toFixed(1)}" width="3" height="10" fill="${mat[0]}"/>`;
      break;
    }
    case "factory": {
      const h = 1.6 + n * 0.25;
      out += box(X(0.6), Y(1.6), 0, 4.8, 3, h, mat) + windows(X(0.6), Y(1.6), 0, 4.8, 3, h, { floors: n, cols: 8, colsD: 4, band: false, lit: isLit });
      for (let i = 0; i < 4; i++) out += gable(X(0.6 + i * 1.2), Y(1.6), h, 1.2, 3, 0.7, [mat[0], i % 2 ? C.night : accent, mat[2]]);
      out += cylinder(X(1.4), Y(0.8), 0, 0.42, h + 3.2, M.concrete) + cylinder(X(1.4), Y(0.8), h + 2.6, 0.44, 0.35, [C.white, C.red, "#8a2a20"]);
      out += cylinder(X(2.6), Y(0.8), 0, 0.42, h + 2.4, M.concrete) + cylinder(X(2.6), Y(0.8), h + 1.8, 0.44, 0.35, [C.white, C.red, "#8a2a20"]);
      const [sx, sy] = P(X(1.4), Y(0.8), h + 3.2);
      P(X(1.4) - 1.6, Y(0.8) - 1.6, h + 5.4); // room for the smoke
      out += `<g class="smoke"><circle cx="${(sx + 4).toFixed(1)}" cy="${(sy - 8).toFixed(1)}" r="5" fill="#d9dce1"/><circle cx="${(sx + 11).toFixed(1)}" cy="${(sy - 15).toFixed(1)}" r="7" fill="#c9ccd1"/></g>`;
      break;
    }
    case "datacenter": {
      const h = 1.3 + n * 0.22;
      out += box(X(0.8), Y(1.2), 0, 4.4, 3.6, h, mat);
      out += windows(X(0.8), Y(1.2), 0, 4.4, 3.6, h, { floors: n, band: true, lit: isLit, dark: C.nightDeep });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out += box(X(1.1 + i * 1.35), Y(1.5 + j * 1.6), h, 1, 1.1, 0.35, C.steel) +
        cylinder(X(1.6 + i * 1.35), Y(2.05 + j * 1.6), h + 0.35, 0.32, 0.05, [C.nightDeep, C.steel[2], C.steel[2]]);
      if (spec.roof === "dish" || spec.roof === "antenna") out += roofProp(spec.roof, X(4.0), Y(4.0), 0, 1.4, 1.4, accent);
      break;
    }
    case "port": {
      out += box(X(0.2), Y(0.2), 0, 5.6, 5.6, 0.15, C.pave);
      const colors = [C.orange, C.blue, C.red, C.green, C.yellow, "#e2e4e8"];
      const shade = (hex) => [hex, hex, "#00000000"];
      let k = 0;
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        const stack = Math.min(3, Math.ceil(n / 3)) - ((row + col) % 2 ? 1 : 0) + 1;
        for (let s = 0; s < stack; s++) {
          const c = colors[(k++ + (spec.seed % 6)) % 6];
          const on = k - 1 < lit * 1.5;
          out += box(X(0.6 + col * 1.9), Y(2.2 + row * 1.6), 0.15 + s * 0.55, 1.6, 1.2, 0.55, [mix(c, "#ffffff", 0.25), c, mix(c, "#000000", 0.35)]);
          if (on) out += poly([P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.3, 0.3 + s * 0.55), P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.9, 0.3 + s * 0.55), P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.9, 0.5 + s * 0.55), P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.3, 0.5 + s * 0.55)], C.lit);
        }
      }
      // Gantry crane
      const legs = [[0.5, 0.6], [4.9, 0.6]];
      for (const [lx, ly] of legs) out += box(X(lx), Y(ly), 0.15, 0.25, 0.25, 4.6, [C.orange, C.orange, "#a8411d"]);
      out += box(X(0.3), Y(0.5), 4.75, 5.4, 0.5, 0.4, [mix(C.orange, "#ffffff", 0.3), C.orange, "#a8411d"]);
      out += box(X(2.4), Y(0.45), 4.25, 0.7, 0.6, 0.5, [C.yellow, "#d8b53a", "#a68a25"]);
      out += `<path d="M${pt(P(X(2.75), Y(1.05), 4.25))}L${pt(P(X(2.75), Y(1.05), 2.6))}" stroke="${C.steel[2]}" stroke-width="1.4"/>`;
      break;
    }
    case "greenhouse": {
      const h = 0.9 + n * 0.12;
      out += box(X(0.6), Y(0.6), 0, 4.8, 4.8, 0.15, C.grass);
      out += box(X(1), Y(1.2), 0.15, 4, 3.4, h, ["#d7f0ec", mix(M[spec.material][1], "#ffffff", 0.2), M[spec.material][2]]);
      out += windows(X(1), Y(1.2), 0.15, 4, 3.4, h, { floors: 2, cols: 6, colsD: 5, lit: (f, i, s) => (i + f) / 12 < lit / n, dark: "#cfeee6" });
      out += gable(X(1), Y(1.2), 0.15 + h, 4, 3.4, 1.6, ["#e6f7f3", "#a7ddd3", "#6fb7ab"]);
      for (let i = 1; i < 6; i++) out += `<path d="M${pt(P(X(1 + i * 0.66), Y(4.6), 0.15 + h))}L${pt(P(X(1 + i * 0.66), Y(2.9), 1.75 + h))}" stroke="#ffffff" stroke-width="1.2"/>`;
      out += tree(X(0.9), Y(5.2), 0.15, 1.1) + tree(X(5.2), Y(4.8), 0.15, 0.9) + tree(X(5.3), Y(1.1), 0.15, 0.8);
      // Flower beds in the accent colour
      out += box(X(1.4), Y(4.9), 0.15, 1.8, 0.4, 0.12, [accent, mix(accent, "#000000", 0.2), mix(accent, "#000000", 0.4)]);
      break;
    }
    case "townhall": {
      const h = 1.1 + n * 0.32;
      out += box(X(0.8), Y(1.6), 0, 4.4, 3, h, mat) + windows(X(0.8), Y(1.6), 0, 4.4, 3, h, { floors: n, cols: 7, colsD: 4, lit: isLit });
      out += gable(X(0.8), Y(1.6), h, 4.4, 3, 1.3, ["#5b6474", "#4a5262", "#363c48"]);
      out += box(X(2.4), Y(2.4), h, 1.3, 1.3, 2.2, mat) + windows(X(2.4), Y(2.4), h, 1.3, 1.3, 2.2, { floors: 2, cols: 1, colsD: 1, lit: () => lit >= n });
      const [cx, cy] = P(X(3.05), Y(3.7), h + 1.4);
      out += `<ellipse cx="${(cx - 3).toFixed(1)}" cy="${(cy).toFixed(1)}" rx="3.6" ry="4.4" fill="${C.white}"/><path d="M${(cx - 3).toFixed(1)},${(cy - 3).toFixed(1)}v3h2.4" stroke="${C.ink}" stroke-width="1" fill="none"/>`;
      out += pyramid(X(2.4), Y(2.4), h + 2.2, 1.3, 1.3, 1.5, [accent, accent, mix(accent, "#000000", 0.35)]);
      out += tree(X(0.6), Y(5.3), 0, 0.9) + tree(X(5.4), Y(5.0), 0, 0.8);
      break;
    }
  }
  if (roof && spec.roof !== "none") out += roofProp(spec.roof, ...roof, accent);
  if (building) out = scaffold(ox, oy, 3 + n * 0.7, out);
  return out;
}

function mix(a, b, t) {
  const p = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** A building still being planned: a ghosted frame, scaffolding and a crane. */
function scaffold(ox, oy, h, inner) {
  let out = `<g opacity=".35">${inner}</g>`;
  const s = C.yellow;
  for (const [x, y] of [[1.2, 1.2], [4.8, 1.2], [1.2, 4.8], [4.8, 4.8]]) out += box(ox + x, oy + y, 0, 0.14, 0.14, h * 0.7, [s, s, "#b89a2c"]);
  for (let z = 1; z < h * 0.7; z += 1.2) out += box(ox + 1.2, oy + 4.8, z, 3.74, 0.14, 0.1, [s, s, "#b89a2c"]) + box(ox + 4.8, oy + 1.2, z, 0.14, 3.74, 0.1, [s, s, "#b89a2c"]);
  out += `<g class="crane">` + box(ox + 0.3, oy + 0.3, 0, 0.3, 0.3, h + 1.6, [C.yellow, "#d8b53a", "#a68a25"]) +
    box(ox + 0.3, oy - 0.6, h + 1.6, 0.3, 5.6, 0.3, [C.yellow, "#d8b53a", "#a68a25"]) +
    box(ox + 0.25, oy - 1.0, h + 1.3, 0.4, 0.6, 0.6, M.concrete) +
    `<path d="M${pt(P(ox + 0.45, oy + 4.4, h + 1.6))}L${pt(P(ox + 0.45, oy + 4.4, h * 0.8))}" stroke="${C.steel[2]}" stroke-width="1.3"/>` +
    box(ox + 0.25, oy + 4.2, h * 0.8 - 0.4, 0.4, 0.4, 0.4, [C.orange, C.orange, "#a8411d"]) + `</g>`;
  return out;
}

function plaza(ox, oy) {
  return box(ox, oy, -0.35, 6, 6, 0.35, C.pave) + box(ox + 0.35, oy + 0.35, 0, 5.3, 5.3, 0.02, ["#d8d3c8", "#d8d3c8", "#d8d3c8"]);
}

/** A single course icon: one building on its plaza. */
export function buildingSvg(course, progress = {}) {
  S = 10;
  const spec = specFor(course);
  const { body, viewBox } = track(() => plaza(0, 0) + buildingAt(0, 0, spec, progress), 12);
  return `<svg viewBox="${viewBox}" aria-hidden="true" class="building">${body}</svg>`;
}

/** Progress for a course row from /api/courses. */
export function progressOf(course) {
  if (course.status === "building" || (!course.modules && course.status !== "complete")) return { floors: 4, lit: 0, building: true };
  const floors = course.modules || 4;
  return { floors, lit: course.status === "complete" ? floors : course.passed || 0, building: false, complete: course.status === "complete" };
}

/**
 * The hero: a small island district floating on a slab of water. Your newest courses take the
 * front lots, the next free lot is a building site, and the back row is a skyline.
 * Course lots are <g data-lot="i">, and the building site is <g data-lot="new">, so the page can link them.
 */
export const CITY_LOTS = 8;
export function citySvg(courses = []) {
  S = 9;
  bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const lots = [];
  for (const x of [0, 6.5, 13]) for (const y of [0, 6.5, 13]) lots.push([x, y]);
  const frontFirst = [...lots.keys()].sort((a, b) => lots[b][0] + lots[b][1] - (lots[a][0] + lots[a][1]) || lots[a][0] - lots[b][0]);
  const skyline = [
    { archetype: "tower", material: "sandstone", roof: "tank", accent: "orange" },
    { archetype: "setback", material: "glass", roof: "none", accent: "blue" },
    { archetype: "rotunda", material: "white", roof: "antenna", accent: "orange" },
    { archetype: "tower", material: "teal", roof: "garden", accent: "green" },
  ];
  const mine = courses.slice(0, CITY_LOTS - 1);
  const role = new Map();
  frontFirst.forEach((lot, k) => {
    const back = lots[lot][0] + lots[lot][1] <= 6.5;
    if (k < mine.length) role.set(lot, { course: mine[k], index: k });
    else if (k === mine.length) role.set(lot, { site: true });
    else role.set(lot, back ? { skyline: skyline[lot % skyline.length] } : { park: true });
  });

  let out = "";
  // Water slab, with ripples and a ferry on the visible sides.
  out += box(-3.5, -3.5, -2.6, 27.5, 27.5, 1.1, [C.water, "#183f73", "#12325c"]);
  for (let i = 0; i < 22; i++) {
    const r = rng(i * 7 + 3);
    const edge = r() < 0.5;
    const gx = edge ? 21 + r() * 2.5 : -3 + r() * 23, gy = edge ? -3 + r() * 23 : 21 + r() * 2.5;
    const [sx, sy] = P(gx, gy, -1.5);
    out += `<rect x="${sx.toFixed(0)}" y="${sy.toFixed(0)}" width="${(8 + r() * 12).toFixed(0)}" height="2" fill="${C.waterHi}" class="ripple d${Math.floor(r() * 5)}"/>`;
  }
  // The island: a road deck with lane marks between the blocks.
  out += box(-1, -1, -1.5, 21.5, 21.5, 1.15, [C.road[0], "#4b4f57", "#33363c"]);
  for (const v of [6, 12.5]) for (let t = -0.6; t < 20.2; t += 1.4) {
    out += poly([P(v + 0.2, t, -0.35), P(v + 0.3, t, -0.35), P(v + 0.3, t + 0.7, -0.35), P(v + 0.2, t + 0.7, -0.35)], "#8d8a82");
    out += poly([P(t, v + 0.2, -0.35), P(t + 0.7, v + 0.2, -0.35), P(t + 0.7, v + 0.3, -0.35), P(t, v + 0.3, -0.35)], "#8d8a82");
  }
  // A pier and a ferry off the right-hand shore.
  out += box(20.5, 8, -1.65, 3, 1.2, 0.8, C.pave);
  out += `<g class="ferry">${box(21.6, 10.2, -1.55, 3.4, 1.3, 0.55, [C.white, "#e2e4e8", "#9aa0aa"])}${box(22.2, 10.4, -1.0, 1.8, 0.9, 0.5, [C.white, C.blue, "#3b62a6"])}${cylinder(23.4, 10.85, -0.5, 0.22, 0.5, [C.ink, C.orange, "#a8411d"])}</g>`;

  const drawOrder = [...lots.keys()].sort((a, b) => lots[a][0] + lots[a][1] - (lots[b][0] + lots[b][1]));
  for (const i of drawOrder) {
    const [ox, oy] = lots[i];
    const job = role.get(i);
    let lot = plaza(ox, oy);
    if (job.course) {
      lot += buildingAt(ox, oy, specFor(job.course), progressOf(job.course));
      out += `<g class="lot" data-lot="${job.index}">${lot}</g>`;
    } else if (job.site) {
      lot += buildingAt(ox, oy, { archetype: "tower", material: "glass", roof: "none", accent: "yellow", seed: 9 }, { floors: 4, building: true });
      out += `<g class="lot lot-site" data-lot="new">${lot}</g>`;
    } else if (job.park) {
      lot += box(ox + 0.4, oy + 0.4, 0, 5.2, 5.2, 0.05, C.grass);
      lot += box(ox + 2.3, oy + 0.4, 0.05, 1.4, 5.2, 0.02, C.pave);
      for (const [tx, ty, ts] of [[1.2, 1.4, 1.2], [1.1, 3.6, 1], [4.6, 1.6, 1.3], [4.8, 4.4, 1], [1.4, 5.1, 0.9], [4.4, 3, 0.9]]) lot += tree(ox + tx, oy + ty, 0.05, ts);
      out += `<g>${lot}</g>`;
    } else {
      out += `<g class="filler">${lot}${buildingAt(ox, oy, { ...job.skyline, seed: 31 + i }, { floors: 5 + (i % 3), lit: 0, ambient: 0.22 })}</g>`;
    }
  }
  const [left, top, right, bottom] = [bounds[0] - 6, bounds[1] - 14, bounds[2] + 6, bounds[3] + 6];
  bounds = null;
  return `<svg viewBox="${left.toFixed(0)} ${top.toFixed(0)} ${(right - left).toFixed(0)} ${(bottom - top).toFixed(0)}" role="img" aria-label="Your courses as buildings in a small isometric city" class="city">${out}</svg>`;
}

/** The logo mark: a two-tone block with a lit window, used in the header and favicon. */
export function markSvg(size = 36) {
  S = 6;
  const tower = box(1.5, 1.5, 0, 2, 2, 3.4, ["#f5d556", "#e65f2b", "#a8411d"]) +
    windows(1.5, 1.5, 0, 2, 2, 3.4, { floors: 3, cols: 2, colsD: 2, lit: (f, i, s) => (f + i + s) % 3 === 0, dark: "#141414" });
  const low = box(0, 2.4, 0, 1.6, 1.6, 1.6, ["#e7a0ea", "#904cf6", "#5f2fb0"]) + box(3.6, 0.2, 0, 1.4, 1.4, 2.2, ["#9ad9d2", "#469b5b", "#2f6b3e"]);
  const vb = [P(0, 4)[0] - 2, P(1.5, 1.5, 3.4)[1] - 2, P(5, 0.2)[0] - P(0, 4)[0] + 4, P(3.5, 3.5)[1] - P(1.5, 1.5, 3.4)[1] + 4];
  return `<svg viewBox="${vb.map((v) => v.toFixed(1)).join(" ")}" width="${size}" height="${size}" aria-hidden="true">${low}${tower}</svg>`;
}

/** The loader: floors dropping onto a growing tower. */
export function stackSvg() {
  S = 9;
  const mats = [M.glass, M.sandstone, M.teal, M.brick];
  let floors = "";
  mats.forEach((m, i) => {
    floors += `<g class="drop d${i}">${box(1, 1, i * 1.1, 3, 3, 1.1, m)}${windows(1, 1, i * 1.1, 3, 3, 1.1, { floors: 1, cols: 4, colsD: 4, lit: (f, j) => (i + j) % 2 === 0 })}</g>`;
  });
  return `<svg viewBox="-42 -30 84 78" aria-hidden="true" class="stack">${box(0, 0, -0.4, 5, 5, 0.4, C.pave)}${floors}</svg>`;
}

/** The finished-course scene: the lit building with confetti over it. */
export function finishedSvg(course) {
  S = 10;
  const spec = specFor(course);
  const { body, viewBox } = track(() => plaza(0, 0) + buildingAt(0, 0, spec, { floors: 6, lit: 6 }), 16);
  const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
  const top = vy - 40, height = vh + 40;
  let confetti = "";
  const r = rng(spec.seed + 3);
  const colours = [C.orange, C.yellow, C.green, C.blue, C.pink, C.purple];
  for (let i = 0; i < 22; i++) {
    const x = vx + r() * vw, y = top + r() * height * 0.45;
    confetti += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="5" height="${r() < 0.5 ? 5 : 9}" rx="1" fill="${colours[i % 6]}" transform="rotate(${(r() * 90).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" class="confetti d${Math.floor(r() * 5)}"/>`;
  }
  return `<svg viewBox="${vx} ${top} ${vw} ${height}" aria-hidden="true" class="building">${body}${confetti}</svg>`;
}
