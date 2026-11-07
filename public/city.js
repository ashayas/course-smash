// Isometric city art for Course Smash. Every course is a building: one floor per module,
// and a floor's windows light up when its module is passed.
// Output is SVG markup built only from numbers and the colours below, never from model text.

export const ARCHETYPES = [
  "tower", "setback", "rotunda", "capitol", "factory", "datacenter", "port", "greenhouse", "townhall",
  "lighthouse", "observatory", "fortress", "vault", "powerplant", "warehouse", "station", "controltower",
  "workshop", "library", "stadium", "windfarm", "lab", "pagoda", "apartments",
];
export const MATERIALS = [
  "sandstone", "brick", "glass", "teal", "concrete", "white",
  "slate", "terracotta", "sage", "lilac", "charcoal",
];
export const ROOFS = [
  "none", "garden", "helipad", "antenna", "dish", "tank", "solar",
  "spire", "flag", "beacon", "billboard", "crown", "turbine",
];
export const ACCENTS = ["orange", "yellow", "green", "blue", "pink", "purple", "red", "teal"];

// Three tones per surface: top, left (lit) face, right (shade) face.
const M = {
  sandstone: ["#ead3a6", "#d4b27c", "#a9865a"],
  brick: ["#d9826a", "#b9533e", "#86392d"],
  glass: ["#9cc0f2", "#5b8bd6", "#3b62a6"],
  teal: ["#9ad9d2", "#4fa39d", "#2f736f"],
  concrete: ["#c9ccd1", "#9ea3ab", "#70757e"],
  white: ["#ffffff", "#e2e4e8", "#b5bac3"],
  slate: ["#8e97a6", "#6b7484", "#4b5260"],
  terracotta: ["#efa57f", "#d0744c", "#9c5232"],
  sage: ["#b9d3a5", "#86ab70", "#5d7f4d"],
  lilac: ["#d9c6f5", "#a98be0", "#7a5fb3"],
  charcoal: ["#5a5f69", "#40444c", "#2b2e34"],
};
const C = {
  ink: "#141414", white: "#ffffff", paper: "#fbfbfb", night: "#27303f", nightDeep: "#1c2330", lit: "#f5d556", litWarm: "#f0b44a",
  grass: ["#7cbf6a", "#559a4e", "#3d7a3c"], pave: ["#c8c3b8", "#a19c92", "#7d786f"],
  road: ["#3a3d44", "#2c2f35", "#23262b"], tree: ["#5fae5b", "#3f8a44", "#2c6633"], trunk: "#6b4a2f",
  water: "#1f4f8f", waterHi: "#2f68b0", steel: ["#e8e8e8", "#b9bcc2", "#868a92"],
  orange: "#e65f2b", red: "#c8402f", yellow: "#f5d556", green: "#469b5b", blue: "#5889f7", pink: "#e7a0ea", purple: "#904cf6", teal: "#4fa39d",
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
/** A gable roof with its ridge along y (pediment facing front-left). */
function gableY(x, y, z, w, d, h, [top, left, right]) {
  const ridgeA = P(x + w / 2, y, z + h), ridgeB = P(x + w / 2, y + d, z + h);
  return (
    poly([P(x, y, z), P(x, y + d, z), ridgeB, ridgeA], top) +
    poly([P(x + w, y, z), P(x + w, y + d, z), ridgeB, ridgeA], right) +
    poly([P(x, y + d, z), P(x + w, y + d, z), ridgeB], left)
  );
}
/** A tapered or flared box centred on (cx, cy). */
function frustum(cx, cy, z, w0, d0, w1, d1, h, [top, left, right]) {
  const x0 = cx - w0 / 2, y0 = cy - d0 / 2, x1 = cx - w1 / 2, y1 = cy - d1 / 2;
  return (
    poly([P(x0, y0 + d0, z), P(x0 + w0, y0 + d0, z), P(x1 + w1, y1 + d1, z + h), P(x1, y1 + d1, z + h)], left) +
    poly([P(x0 + w0, y0, z), P(x0 + w0, y0 + d0, z), P(x1 + w1, y1 + d1, z + h), P(x1 + w1, y1, z + h)], right) +
    poly([P(x1, y1, z + h), P(x1 + w1, y1, z + h), P(x1 + w1, y1 + d1, z + h), P(x1, y1 + d1, z + h)], top)
  );
}
/** Hyperboloid cooling tower centred on (cx, cy). */
function coolingTower(cx, cy, z, r0, rw, rt, h, [top, left, right], accent) {
  const [sx, syb] = P(cx, cy, z);
  const [, syw] = P(cx, cy, z + h * 0.62);
  const [, syt] = P(cx, cy, z + h);
  const rx0 = r0 * Math.SQRT2 * S, ry0 = (r0 / Math.SQRT2) * S;
  const rxw = rw * Math.SQRT2 * S;
  const rxt = rt * Math.SQRT2 * S, ryt = (rt / Math.SQRT2) * S;
  const f = (n) => n.toFixed(1);
  return (
    `<path d="M${f(sx - rxt)},${f(syt)}Q${f(sx - rxw)},${f(syw)} ${f(sx - rx0)},${f(syb)}A${f(rx0)} ${f(ry0)} 0 0 0 ${f(sx)},${f(syb + ry0)}V${f(syt + ryt)}Z" fill="${left}"/>` +
    `<path d="M${f(sx)},${f(syt + ryt)}V${f(syb + ry0)}A${f(rx0)} ${f(ry0)} 0 0 0 ${f(sx + rx0)},${f(syb)}Q${f(sx + rxw)},${f(syw)} ${f(sx + rxt)},${f(syt)}Z" fill="${right}"/>` +
    `<path d="M${f(sx - rxt * 0.96)},${f(syt + 3)}A${f(rxt)} ${f(ryt)} 0 0 0 ${f(sx + rxt * 0.96)},${f(syt + 3)}" fill="none" stroke="${accent}" stroke-width="2.4"/>` +
    `<ellipse cx="${f(sx)}" cy="${f(syt)}" rx="${f(rxt)}" ry="${f(ryt)}" fill="${top}"/>` +
    `<ellipse cx="${f(sx)}" cy="${f(syt)}" rx="${f(rxt * 0.76)}" ry="${f(ryt * 0.76)}" fill="${C.nightDeep}"/>`
  );
}
/** A wind turbine with spinning 3-blade rotor centred on its hub point. */
function windTurbine(tx, ty, z, poleH, bladeR, accent, litHub = false) {
  let out = box(tx - 0.22, ty - 0.22, z, 0.44, 0.44, 0.16, C.steel);
  out += cylinder(tx, ty, z + 0.16, 0.12, poleH - 0.16, C.steel);
  out += box(tx - 0.2, ty - 0.16, z + poleH - 0.14, 0.44, 0.34, 0.26, [C.white, C.steel[0], C.steel[2]]);
  const [hx, hy] = P(tx + 0.08, ty + 0.2, z + poleH);
  P(tx, ty, z + poleH + bladeR * 1.15);
  const br = bladeR * S;
  let blades = "";
  for (const ang of [0, 120, 240]) {
    blades += `<g transform="rotate(${ang} ${hx.toFixed(1)} ${hy.toFixed(1)})">` +
      `<path d="M${hx.toFixed(1)},${hy.toFixed(1)}l-1.8,${(-br * 0.28).toFixed(1)}l1.8,${(-br * 0.72).toFixed(1)}l1.8,${(br * 0.72).toFixed(1)}Z" fill="${C.white}"/>` +
      `<path d="M${(hx - 1.1).toFixed(1)},${(hy - br * 0.72).toFixed(1)}L${hx.toFixed(1)},${(hy - br).toFixed(1)}L${(hx + 1.1).toFixed(1)},${(hy - br * 0.72).toFixed(1)}Z" fill="${accent}"/>` +
      `</g>`;
  }
  out += `<g class="spin" transform-origin="${hx.toFixed(1)} ${hy.toFixed(1)}">${blades}<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="2.6" fill="${litHub ? C.lit : accent}"/></g>`;
  return out;
}
function tones(hex) {
  return [mix(hex, "#ffffff", 0.25), hex, mix(hex, "#000000", 0.32)];
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
    case "spire": {
      const [sx, sy] = P(cx, cy, z + 2.5);
      const [, ty] = P(cx, cy, z + 3.3);
      return box(cx - 0.36, cy - 0.36, z, 0.72, 0.72, 0.3, C.steel) +
        box(cx - 0.24, cy - 0.24, z + 0.3, 0.48, 0.48, 0.25, tones(accent)) +
        pyramid(cx - 0.2, cy - 0.2, z + 0.55, 0.4, 0.4, 2.0, C.steel) +
        `<path d="M${sx.toFixed(1)},${sy.toFixed(1)}V${ty.toFixed(1)}" stroke="${C.steel[0]}" stroke-width="1.8"/>` +
        `<circle cx="${sx.toFixed(1)}" cy="${ty.toFixed(1)}" r="2.2" fill="${accent}"/>`;
    }
    case "flag": {
      const [sx, sy] = P(cx, cy, z + 0.25);
      const [, ty] = P(cx, cy, z + 2.4);
      P(cx + 1.3, cy, z + 2.5);
      return box(cx - 0.22, cy - 0.22, z, 0.44, 0.44, 0.25, C.steel) +
        `<path d="M${sx.toFixed(1)},${sy.toFixed(1)}V${ty.toFixed(1)}" stroke="${C.steel[0]}" stroke-width="1.8"/>` +
        `<g class="flag" transform-origin="${sx.toFixed(1)} ${(ty + 4).toFixed(1)}">` +
        `<path d="M${sx.toFixed(1)},${(ty + 1).toFixed(1)}l9,1.8l5,-1.2v7.6l-5,1.2l-9,-1.8Z" fill="${accent}"/>` +
        `<path d="M${(sx + 9).toFixed(1)},${(ty + 2.8).toFixed(1)}l5,-1.2v7.6l-5,1.2Z" fill="${mix(accent, "#000000", 0.25)}"/>` +
        `</g>` +
        `<circle cx="${sx.toFixed(1)}" cy="${ty.toFixed(1)}" r="1.8" fill="${C.yellow}"/>`;
    }
    case "beacon": {
      const [sx, sy] = P(cx, cy, z + 0.9);
      P(cx, cy, z + 1.5);
      return box(cx - 0.35, cy - 0.35, z, 0.7, 0.7, 0.35, C.steel) +
        cylinder(cx, cy, z + 0.35, 0.26, 0.45, tones(accent)) +
        `<g class="beacon" transform-origin="${sx.toFixed(1)} ${sy.toFixed(1)}">` +
        `<path d="M${sx.toFixed(1)},${sy.toFixed(1)}l-14,-4.5l2.2,-4.5Z" fill="${C.lit}" opacity=".75"/>` +
        `<path d="M${sx.toFixed(1)},${sy.toFixed(1)}l14,4.5l-2.2,4.5Z" fill="${accent}" opacity=".75"/>` +
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.6" fill="${C.lit}"/>` +
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2" fill="${accent}"/>` +
        `</g>`;
    }
    case "billboard": {
      const bw = Math.min(w * 0.82, 2.1), bx = cx - bw / 2, by = cy + 0.05;
      return box(bx + 0.14, by, z, 0.14, 0.14, 0.42, C.steel) +
        box(bx + bw - 0.28, by, z, 0.14, 0.14, 0.42, C.steel) +
        box(bx, by, z + 0.38, bw, 0.2, 1.05, C.steel) +
        poly([P(bx + 0.1, by + 0.21, z + 0.48), P(bx + bw - 0.1, by + 0.21, z + 0.48), P(bx + bw - 0.1, by + 0.21, z + 1.32), P(bx + 0.1, by + 0.21, z + 1.32)], accent) +
        poly([P(bx + bw * 0.58, by + 0.22, z + 0.48), P(bx + bw - 0.1, by + 0.22, z + 0.48), P(bx + bw - 0.1, by + 0.22, z + 1.32), P(bx + bw * 0.38, by + 0.22, z + 1.32)], C.lit);
    }
    case "crown": {
      const m1 = Math.min(w, d) * 0.1, m2 = Math.min(w, d) * 0.24, m3 = Math.min(w, d) * 0.36;
      return box(x + m1, y + m1, z, w - m1 * 2, d - m1 * 2, 0.32, tones(accent)) +
        box(x + m2, y + m2, z + 0.32, w - m2 * 2, d - m2 * 2, 0.32, tones(accent)) +
        box(x + m3, y + m3, z + 0.64, w - m3 * 2, d - m3 * 2, 0.26, [C.lit, accent, mix(accent, "#000000", 0.35)]);
    }
    case "turbine":
      return windTurbine(cx, cy, z, 1.85, 1.05, accent, true);
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
  [/\b(observabilit|monitor|prometheus|grafana|alert|logging|trace|tracing|telemetry|sentry)\b/i, { archetype: "lighthouse", material: "white", roof: "beacon", accent: "red" }],
  [/\b(astro|telescope|cosmolog|planet|star|orbit|analytics|forecast)/i, { archetype: "observatory", material: "white", roof: "dish", accent: "blue" }],
  [/\b(cyber|security|firewall|pentest|hardening|threat|defense|exploit|owasp)\b/i, { archetype: "fortress", material: "slate", roof: "flag", accent: "red" }],
  [/\b(crypto|encryption|tls|auth|oauth|zero.?trust|secret|vault|key|ledger|bank)\b/i, { archetype: "vault", material: "charcoal", roof: "crown", accent: "yellow" }],
  [/\b(gpu|inference|serving|throughput|vllm|cuda|tensor|power|nuclear|reactor|grid)\b/i, { archetype: "powerplant", material: "concrete", roof: "turbine", accent: "orange" }],
  [/\b(cache|caching|redis|s3|storage|bucket|warehouse|lakehouse|parquet|inventory)\b/i, { archetype: "warehouse", material: "terracotta", roof: "solar", accent: "yellow" }],
  [/\b(queue|kafka|stream|rabbit|routing|router|load.?balanc|bgp|transit|rail|proxy)\b/i, { archetype: "station", material: "brick", roof: "flag", accent: "teal" }],
  [/\b(orchestrat|schedul|control.?plane|kubernetes|k8s|helm|aviation|devops|sre)\b/i, { archetype: "controltower", material: "slate", roof: "antenna", accent: "blue" }],
  [/\b(robot|embedded|arduino|firmware|iot|hardware|pcb|circuit|mechatron|cad)\b/i, { archetype: "workshop", material: "terracotta", roof: "billboard", accent: "orange" }],
  [/\b(literature|reading|doc|rfc|standard|archive|grammar|library|humanit|history of)\b/i, { archetype: "library", material: "sandstone", roof: "crown", accent: "green" }],
  [/\b(sport|game|chess|benchmark|compet|tournament|olymp|athlet|elo)\b/i, { archetype: "stadium", material: "white", roof: "billboard", accent: "green" }],
  [/\b(wind|renewable|sustainab|climate|clean.?energy|carbon|grid|solar)\b/i, { archetype: "windfarm", material: "sage", roof: "solar", accent: "teal" }],
  [/\b(chemistr|lab|experiment|pharma|molecule|synth|material|biotech|reaction)\b/i, { archetype: "lab", material: "teal", roof: "tank", accent: "pink" }],
  [/\b(japan|chines|korean|asian|zen|mindful|buddh|martial|tea|kanji|mandarin)\b/i, { archetype: "pagoda", material: "terracotta", roof: "spire", accent: "red" }],
  [/\b(ux|ui|product|design|everyday|habit|home|housing|psycholog|lifestyle)\b/i, { archetype: "apartments", material: "lilac", roof: "garden", accent: "pink" }],
  [/\b(containers?|docker|pods?|logistics|supply chain|shipping)\b/i, { archetype: "port", material: "concrete", roof: "beacon", accent: "orange" }],
  [/\b(engine|manufactur|compiler|assembly|industrial)/i, { archetype: "factory", material: "brick", roof: "solar", accent: "yellow" }],
  [/\b(network|tcp|http|dns|cloud|servers?|database|sql|distributed|apis?|linux)/i, { archetype: "datacenter", material: "concrete", roof: "dish", accent: "blue" }],
  [/\b(ai|llms?|models?|agents?|prompting|machine learning|neural|rag|embeddings?|transformers?)\b/i, { archetype: "tower", material: "glass", roof: "antenna", accent: "purple" }],
  [/bio|crispr|gene|cell|plant|garden|ecolog|nature/i, { archetype: "greenhouse", material: "teal", roof: "none", accent: "green" }],
  [/space|physic|quantum|math/i, { archetype: "rotunda", material: "white", roof: "dish", accent: "blue" }],
  [/history|law|politic|government|civic|philosoph|art|museum|interview|public service/i, { archetype: "capitol", material: "white", roof: "none", accent: "yellow" }],
  [/language|spanish|french|school|teach|writing|music/i, { archetype: "townhall", material: "brick", roof: "none", accent: "green" }],
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
  const base = guess ?? { archetype: pick(ARCHETYPES, 3), material: pick(MATERIALS, 7), roof: pick(ROOFS, 11), accent: pick(ACCENTS, 13) };
  const spec = { ...base, ...(icon ?? {}) };
  if (!ARCHETYPES.includes(spec.archetype)) spec.archetype = base.archetype;
  if (!MATERIALS.includes(spec.material)) spec.material = base.material;
  if (!ROOFS.includes(spec.roof)) spec.roof = base.roof;
  if (!ACCENTS.includes(spec.accent)) spec.accent = base.accent;
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
  const accTones = tones(accent);
  const n = Math.max(3, Math.min(8, floors));
  const isLit = (f, i = 0, side = 0) => f < lit || (ambient && r() < ambient) || (f === lit && building === false && lit < n && r() < 0.35 && i % 2 === side);
  let out = "";
  const X = (v) => ox + v, Y = (v) => oy + v;
  let roof = null;

  switch (spec.archetype) {
    case "tower": {
      const h = 1.6 + n * 1.05 + (r() - 0.5) * 0.3;
      out += box(X(1.6), Y(1.6), 0, 2.8, 2.8, h, mat) + windows(X(1.6), Y(1.6), 0, 2.8, 2.8, h, { floors: n * 2, cols: 5, colsD: 5, lit: (f, i, s) => isLit(Math.floor(f / 2), i, s) });
      out += box(X(1.55), Y(1.55), h, 2.9, 2.9, 0.25, [mat[0], accent, mix(accent, "#000000", 0.32)]);
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
      const h = 1.4 + n * 0.32 + (r() - 0.5) * 0.2;
      out += box(X(0.8), Y(0.8), 0, 4.4, 4.4, 0.35, M.concrete);
      out += box(X(1.1), Y(1.1), 0.35, 3.8, 3.8, h, mat) + windows(X(1.1), Y(1.1), 0.35, 3.8, 3.8, h, { floors: n, cols: 6, colsD: 6, lit: isLit });
      out += box(X(1.05), Y(1.05), 0.35 + h, 3.9, 3.9, 0.3, accTones);
      out += cylinder(X(3), Y(3), 0.65 + h, 1.25, 0.9, mat) + cylinderWindows(X(3), Y(3), 0.65 + h, 1.25, 0.9, 1, () => lit >= n);
      out += dome(X(3), Y(3), 1.55 + h, 1.3, ["#cdeee6", "#7fc2b3", "#4f9686"]);
      const [sx, sy] = P(X(3), Y(3), 1.55 + h + 1.6);
      out += `<rect x="${(sx - 1.5).toFixed(1)}" y="${(sy - 8).toFixed(1)}" width="3" height="10" fill="${accent}"/>`;
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
      const h = 1.3 + n * 0.22 + (r() - 0.5) * 0.18;
      out += box(X(0.8), Y(1.2), 0, 4.4, 3.6, h, mat);
      out += windows(X(0.8), Y(1.2), 0, 4.4, 3.6, h, { floors: n, band: true, lit: isLit, dark: C.nightDeep });
      out += box(X(0.76), Y(1.16), h, 4.48, 3.68, 0.16, accTones);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out += box(X(1.1 + i * 1.35), Y(1.5 + j * 1.6), h + 0.16, 1, 1.1, 0.35, C.steel) +
        cylinder(X(1.6 + i * 1.35), Y(2.05 + j * 1.6), h + 0.51, 0.32, 0.05, [C.nightDeep, C.steel[2], C.steel[2]]);
      roof = [X(3.7), Y(1.5), h + 0.16, 1.3, 3.0];
      break;
    }
    case "port": {
      out += box(X(0.2), Y(0.2), 0, 5.6, 5.6, 0.15, C.pave);
      // Quay office/shed in spec.material with flat roof for spec.roof
      const hShed = 1.0 + n * 0.18 + (r() - 0.5) * 0.15;
      out += box(X(3.5), Y(0.5), 0.15, 2.0, 1.5, hShed, mat) +
        windows(X(3.5), Y(0.5), 0.15, 2.0, 1.5, hShed, { floors: Math.max(2, Math.ceil(n / 2)), cols: 3, colsD: 2, lit: isLit }) +
        box(X(3.45), Y(0.45), 0.15 + hShed, 2.1, 1.6, 0.16, accTones);
      roof = [X(3.5), Y(0.5), 0.31 + hShed, 2.0, 1.5];
      // Container yard stacks
      const colors = [accent, C.blue, C.red, C.green, C.yellow, "#e2e4e8"];
      let k = 0;
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        const stack = Math.min(3, Math.ceil(n / 3)) - ((row + col) % 2 ? 1 : 0) + 1;
        for (let s = 0; s < stack; s++) {
          const c = colors[(k++ + (spec.seed % 6)) % 6];
          const on = isLit(Math.min(n - 1, k - 1), col, row);
          out += box(X(0.6 + col * 1.9), Y(2.2 + row * 1.6), 0.15 + s * 0.55, 1.6, 1.2, 0.55, [mix(c, "#ffffff", 0.25), c, mix(c, "#000000", 0.35)]);
          if (on) out += poly([P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.3, 0.3 + s * 0.55), P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.9, 0.3 + s * 0.55), P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.9, 0.5 + s * 0.55), P(X(0.6 + col * 1.9) + 1.6, Y(2.2 + row * 1.6) + 0.3, 0.5 + s * 0.55)], C.lit);
        }
      }
      // Gantry crane in accent colour
      const legs = [[0.5, 0.6], [3.2, 0.6]];
      for (const [lx, ly] of legs) out += box(X(lx), Y(ly), 0.15, 0.25, 0.25, 4.6, accTones);
      out += box(X(0.3), Y(0.5), 4.75, 3.4, 0.5, 0.4, accTones);
      out += box(X(1.6), Y(0.45), 4.25, 0.7, 0.6, 0.5, [C.yellow, "#d8b53a", "#a68a25"]);
      out += `<path d="M${pt(P(X(1.95), Y(1.05), 4.25))}L${pt(P(X(1.95), Y(1.05), 2.6))}" stroke="${C.steel[2]}" stroke-width="1.4"/>`;
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
    case "lighthouse": {
      const hj = (r() - 0.5) * 0.25;
      // Stepped rock plinth
      out += box(X(0.7), Y(0.7), 0, 4.6, 4.6, 0.35, M.charcoal);
      out += box(X(1.1), Y(1.1), 0.35, 3.8, 3.8, 0.3, M.slate);
      // Keeper's cottage at back-left with flat roof for spec.roof
      const hKeep = 0.95 + n * 0.12;
      out += box(X(1.3), Y(1.3), 0.65, 2.1, 1.8, hKeep, mat) +
        windows(X(1.3), Y(1.3), 0.65, 2.1, 1.8, hKeep, { floors: Math.max(2, Math.floor(n / 2)), cols: 3, colsD: 2, lit: isLit }) +
        box(X(1.25), Y(1.25), 0.65 + hKeep, 2.2, 1.9, 0.14, accTones);
      roof = [X(1.3), Y(1.3), 0.79 + hKeep, 2.1, 1.8];
      // Tall striped lighthouse tower
      const tx = X(3.4), ty = Y(3.4), fh = 0.48 + hj * 0.08;
      let zt = 0.65;
      for (let f = 0; f < n; f++) {
        const rad = 0.98 - (f / n) * 0.24;
        const bandMat = f % 2 === 0 ? mat : accTones;
        out += cylinder(tx, ty, zt, rad, fh, bandMat) +
          cylinderWindows(tx, ty, zt, rad, fh, 1, () => isLit(f, 0, 0));
        zt += fh;
      }
      // Gallery deck and lantern room
      out += cylinder(tx, ty, zt, 0.92, 0.2, accTones);
      const lampOn = lit > 0 || isLit(n - 1, 0, 0);
      out += cylinder(tx, ty, zt + 0.2, 0.68, 0.72, lampOn ? [C.lit, C.lit, C.litWarm] : M.glass);
      const [lx, ly] = P(tx, ty, zt + 0.55);
      if (lampOn) {
        out += `<g class="beacon" transform-origin="${lx.toFixed(1)} ${ly.toFixed(1)}">` +
          `<path d="M${lx.toFixed(1)},${ly.toFixed(1)}l-22,-7l3,-6Z" fill="${C.lit}" opacity=".65"/>` +
          `<path d="M${lx.toFixed(1)},${ly.toFixed(1)}l22,7l-3,6Z" fill="${C.lit}" opacity=".65"/>` +
          `</g>`;
      }
      out += dome(tx, ty, zt + 0.92, 0.72, accTones);
      P(tx, ty, zt + 1.9);
      break;
    }
    case "observatory": {
      const hj = (r() - 0.5) * 0.25;
      out += box(X(0.7), Y(0.7), 0, 4.6, 4.6, 0.3, M.concrete);
      // Research wing with flat roof for spec.roof
      const hWing = 1.0 + n * 0.16;
      out += box(X(1.0), Y(1.0), 0.3, 2.2, 2.2, hWing, mat) +
        windows(X(1.0), Y(1.0), 0.3, 2.2, 2.2, hWing, { floors: Math.max(2, Math.ceil(n / 2)), cols: 3, colsD: 3, lit: isLit }) +
        box(X(0.95), Y(0.95), 0.3 + hWing, 2.3, 2.3, 0.16, accTones);
      roof = [X(1.0), Y(1.0), 0.46 + hWing, 2.2, 2.2];
      // Cylindrical drum building
      const cx = X(3.25), cy = Y(3.25), hDrum = 1.1 + n * 0.34 + hj;
      out += cylinder(cx, cy, 0.3, 1.55, hDrum, mat) +
        cylinderWindows(cx, cy, 0.3, 1.55, hDrum, n, (f) => isLit(f, 0, 0));
      out += cylinder(cx, cy, 0.3 + hDrum, 1.65, 0.24, accTones);
      // Rotating-slit dome
      const zDome = 0.54 + hDrum, rDome = 1.58;
      out += dome(cx, cy, zDome, rDome, [C.white, C.steel[0], C.steel[2]]);
      const [dx, dy] = P(cx, cy, zDome);
      const rx = rDome * Math.SQRT2 * S, rh = rDome * 1.25 * S;
      // Slit shutter in accent and dark aperture with telescope tube
      out += `<path d="M${(dx - rx * 0.15).toFixed(1)},${(dy - rh * 0.96).toFixed(1)}Q${(dx - rx * 0.55).toFixed(1)},${(dy - rh * 0.42).toFixed(1)} ${(dx - rx * 0.35).toFixed(1)},${(dy + 3).toFixed(1)}l5,1Q${(dx - rx * 0.32).toFixed(1)},${(dy - rh * 0.42).toFixed(1)} ${(dx + rx * 0.05).toFixed(1)},${(dy - rh * 0.94).toFixed(1)}Z" fill="${C.nightDeep}" stroke="${accent}" stroke-width="1.4"/>`;
      out += `<circle cx="${(dx - rx * 0.32).toFixed(1)}" cy="${(dy - rh * 0.45).toFixed(1)}" r="3.2" fill="${lit >= n ? C.lit : accent}"/>`;
      break;
    }
    case "fortress": {
      const hj = (r() - 0.5) * 0.3;
      const roundBastions = r() < 0.5;
      const hWall = 1.15 + n * 0.15, hKeep = 1.8 + n * 0.42 + hj, hTow = hWall + 0.55;
      const bastion = (bx, by) => roundBastions
        ? cylinder(X(bx + 0.55), Y(by + 0.55), 0, 0.62, hTow, mat) + cylinder(X(bx + 0.55), Y(by + 0.55), hTow, 0.68, 0.2, accTones) + dome(X(bx + 0.55), Y(by + 0.55), hTow + 0.2, 0.58, accTones)
        : box(X(bx), Y(by), 0, 1.1, 1.1, hTow, mat) + box(X(bx - 0.05), Y(by - 0.05), hTow, 1.2, 1.2, 0.2, accTones) + pyramid(X(bx), Y(by), hTow + 0.2, 1.1, 1.1, 0.65, accTones);
      // Back bastion & back walls
      out += bastion(0.7, 0.7);
      out += box(X(1.6), Y(0.85), 0, 2.8, 0.5, hWall, mat) + box(X(0.85), Y(1.6), 0, 0.5, 2.8, hWall, mat);
      // Central keep
      out += box(X(1.75), Y(1.75), 0, 2.3, 2.3, hKeep, mat) +
        windows(X(1.75), Y(1.75), 0, 2.3, 2.3, hKeep, { floors: n, cols: 3, colsD: 3, lit: isLit }) +
        box(X(1.7), Y(1.7), hKeep, 2.4, 2.4, 0.22, accTones);
      for (let i = 0; i < 4; i++) {
        out += box(X(1.72 + i * 0.64), Y(3.85), hKeep + 0.22, 0.36, 0.24, 0.24, mat);
        out += box(X(3.85), Y(1.72 + i * 0.64), hKeep + 0.22, 0.24, 0.36, 0.24, mat);
      }
      roof = [X(1.95), Y(1.95), hKeep + 0.22, 1.9, 1.9];
      // Side bastions
      out += bastion(4.2, 0.7) + bastion(0.7, 4.2);
      // Front walls with crenellations and gatehouse
      out += box(X(1.6), Y(4.4), 0, 2.8, 0.55, hWall, mat) +
        box(X(4.4), Y(1.6), 0, 0.55, 2.8, hWall, mat) +
        windows(X(4.4), Y(1.6), 0, 0.55, 2.8, hWall, { floors: Math.min(3, n), cols: 0, colsD: 3, lit: isLit });
      for (let i = 0; i < 4; i++) {
        out += box(X(1.75 + i * 0.68), Y(4.65), hWall, 0.38, 0.3, 0.22, mat);
        out += box(X(4.65), Y(1.75 + i * 0.68), hWall, 0.3, 0.38, 0.22, mat);
      }
      // Portcullis gate on front-left wall
      out += box(X(2.55), Y(4.45), 0, 0.9, 0.58, hWall * 0.78, [accTones[0], C.nightDeep, accTones[2]]);
      out += bastion(4.2, 4.2);
      break;
    }
    case "vault": {
      const hj = (r() - 0.5) * 0.2;
      const colsCount = r() < 0.5 ? 3 : 4;
      const h = 1.55 + n * 0.26 + hj;
      // Heavy stepped granite plinth
      out += box(X(0.6), Y(0.6), 0, 4.8, 4.8, 0.28, M.charcoal);
      out += box(X(0.85), Y(0.85), 0.28, 4.3, 4.3, 0.24, M.concrete);
      // Squat armored vault body
      out += box(X(1.05), Y(1.05), 0.52, 3.8, 3.8, h, mat) +
        windows(X(1.05), Y(1.05), 0.52, 3.8, 3.8, h, { floors: n, cols: 0, colsD: 4, lit: isLit });
      // Classical pilasters along the right face
      for (let i = 0; i < colsCount; i++) {
        const py = 1.25 + i * (3.2 / (colsCount - 1));
        out += box(X(4.78), Y(py), 0.52, 0.2, 0.22, h, [C.white, mat[0], mat[2]]);
      }
      // Columns framing the front-left vault face
      out += box(X(1.15), Y(4.75), 0.52, 0.28, 0.24, h, [C.white, mat[0], mat[2]]) +
        box(X(4.45), Y(4.75), 0.52, 0.28, 0.24, h, [C.white, mat[0], mat[2]]);
      // Big round vault door projected onto the front-left face (y = Y(4.88))
      const vcx = X(2.95), vcy = Y(4.88), vcz = 0.52 + h * 0.48, vr = Math.min(1.05, h * 0.4);
      const disc = (rad, yOff) => Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        return P(vcx + rad * Math.cos(a), vcy + yOff, vcz + rad * Math.sin(a));
      });
      out += poly(disc(vr, 0), C.steel[2]) + poly(disc(vr * 0.84, 0.02), accent) + poly(disc(vr * 0.72, 0.04), C.steel[0]);
      // Spoke wheel & indicator lights on vault face
      const [vx, vy] = P(vcx, vcy + 0.05, vcz);
      out += `<circle cx="${vx.toFixed(1)}" cy="${vy.toFixed(1)}" r="2.8" fill="${lit >= n ? C.lit : C.nightDeep}"/>` +
        `<path d="M${(vx - 5).toFixed(1)},${vy.toFixed(1)}h10M${vx.toFixed(1)},${(vy - 5).toFixed(1)}v10" stroke="${C.nightDeep}" stroke-width="1.5"/>`;
      // Status lights for floors on front-left wall
      for (let f = 0; f < n; f++) {
        const zf = 0.72 + (f / n) * (h - 0.4);
        out += poly([P(X(1.6), vcy, zf), P(X(1.85), vcy, zf), P(X(1.85), vcy, zf + 0.16), P(X(1.6), vcy, zf + 0.16)], isLit(f, 0, 0) ? C.lit : C.night);
      }
      // Heavy cornice and flat roof
      out += box(X(0.95), Y(0.95), 0.52 + h, 4.0, 4.0, 0.24, accTones) +
        box(X(1.1), Y(1.1), 0.76 + h, 3.7, 3.7, 0.2, mat);
      roof = [X(1.25), Y(1.25), 0.96 + h, 3.4, 3.4];
      break;
    }
    case "powerplant": {
      const hj = (r() - 0.5) * 0.3;
      const hTow1 = 2.4 + n * 0.32 + hj, hTow2 = 2.1 + n * 0.28 - hj * 0.5;
      // Two hyperboloid cooling towers at the back
      out += coolingTower(X(1.75), Y(1.7), 0, 1.05, 0.72, 0.82, hTow1, M.concrete, accent);
      out += coolingTower(X(3.95), Y(1.65), 0, 0.98, 0.68, 0.76, hTow2, M.concrete, accent);
      // Steam rising from both cooling towers
      for (const [tx, ty, th] of [[X(1.75), Y(1.7), hTow1], [X(3.95), Y(1.65), hTow2]]) {
        const [sx, sy] = P(tx, ty, th);
        P(tx - 1.2, ty - 1.2, th + 1.8);
        out += `<g class="smoke"><circle cx="${(sx + 2).toFixed(1)}" cy="${(sy - 7).toFixed(1)}" r="5.5" fill="#d9dce1"/><circle cx="${(sx + 9).toFixed(1)}" cy="${(sy - 14).toFixed(1)}" r="7" fill="#c9ccd1"/></g>`;
      }
      // Turbine hall in front with flat roof for spec.roof
      const hHall = 1.25 + n * 0.24;
      out += box(X(0.8), Y(3.05), 0, 4.4, 2.2, hHall, mat) +
        windows(X(0.8), Y(3.05), 0, 4.4, 2.2, hHall, { floors: n, cols: 6, colsD: 3, lit: isLit }) +
        box(X(0.75), Y(3.0), hHall, 4.5, 2.3, 0.2, accTones);
      roof = [X(0.9), Y(3.15), hHall + 0.2, 4.2, 2.0];
      break;
    }
    case "warehouse": {
      const doors = r() < 0.5 ? 2 : 3;
      const h = 1.2 + n * 0.22;
      out += box(X(0.4), Y(0.5), 0, 5.2, 5.0, 0.16, M.concrete);
      // Long low warehouse shed
      out += box(X(0.6), Y(0.7), 0.16, 4.7, 3.0, h, mat) +
        windows(X(0.6), Y(0.7), 0.16 + h * 0.45, 4.7, 3.0, h * 0.5, { floors: Math.max(2, Math.ceil(n / 2)), cols: 7, colsD: 4, lit: (f, i, s) => isLit(f * 2, i, s) }) +
        box(X(0.55), Y(0.65), 0.16 + h, 4.8, 3.1, 0.2, accTones);
      roof = [X(0.8), Y(0.85), 0.36 + h, 4.3, 2.7];
      // Loading dock & roller doors along front-left (y = Y(3.7))
      out += box(X(0.75), Y(3.7), 0.16, 4.4, 0.65, 0.26, M.charcoal);
      const bayW = 3.9 / doors;
      for (let d = 0; d < doors; d++) {
        const dx = 1.0 + d * bayW;
        out += poly([P(X(dx), Y(3.72), 0.42), P(X(dx + bayW * 0.72), Y(3.72), 0.42), P(X(dx + bayW * 0.72), Y(3.72), 0.42 + h * 0.45), P(X(dx), Y(3.72), 0.42 + h * 0.45)], C.steel[1]);
        out += poly([P(X(dx), Y(3.73), 0.42 + h * 0.45), P(X(dx + bayW * 0.72), Y(3.73), 0.42 + h * 0.45), P(X(dx + bayW * 0.72), Y(3.73), 0.52 + h * 0.45), P(X(dx), Y(3.73), 0.52 + h * 0.45)], isLit(d, d, 0) ? C.lit : accent);
      }
      // Stacked crates and pallets in forecourt
      const crateCount = 2 + Math.floor(r() * 2);
      for (let c = 0; c < crateCount; c++) {
        const cx = 1.0 + c * 1.45, cy = 4.55;
        out += box(X(cx), Y(cy), 0.16, 0.9, 0.75, 0.1, ["#c89d66", "#a67b46", "#7d592e"]);
        out += box(X(cx + 0.05), Y(cy + 0.05), 0.26, 0.8, 0.65, 0.48, c % 2 === 0 ? accTones : M.sandstone);
        if (c === 0 && n >= 5) out += box(X(cx + 0.12), Y(cy + 0.1), 0.74, 0.62, 0.5, 0.42, M.sandstone);
      }
      break;
    }
    case "station": {
      const cars = r() < 0.5 ? 2 : 3;
      const hHall = 1.3 + n * 0.24, hShed = 1.15 + n * 0.16;
      // Station headhouse at back with flat roof for spec.roof
      out += box(X(0.6), Y(0.6), 0, 4.8, 1.85, hHall, mat) +
        windows(X(0.6), Y(0.6), 0, 4.8, 1.85, hHall, { floors: n, cols: 7, colsD: 3, lit: isLit }) +
        box(X(0.55), Y(0.55), hHall, 4.9, 1.95, 0.18, accTones);
      roof = [X(0.8), Y(0.75), hHall + 0.18, 4.4, 1.55];
      // Platform and arched shed over tracks
      out += box(X(0.5), Y(2.45), 0, 5.0, 1.45, 0.28, M.concrete);
      for (const px of [0.9, 2.3, 3.7, 5.1]) out += box(X(px), Y(3.55), 0.28, 0.18, 0.18, hShed, C.steel);
      // Arched barrel roof over platform
      out += box(X(0.6), Y(2.35), 0.28 + hShed, 4.8, 1.55, 0.22, accTones) +
        gable(X(0.6), Y(2.35), 0.5 + hShed, 4.8, 1.55, 0.55, [M.glass[0], accTones[1], M.glass[2]]);
      // Tracks along front-left (Y(4.2..5.2))
      out += box(X(0.3), Y(4.25), 0, 5.4, 0.95, 0.1, M.charcoal);
      out += `<path d="M${pt(P(X(0.3), Y(4.5), 0.12))}L${pt(P(X(5.7), Y(4.5), 0.12))}M${pt(P(X(0.3), Y(4.95), 0.12))}L${pt(P(X(5.7), Y(4.95), 0.12))}" stroke="${C.steel[1]}" stroke-width="1.5"/>`;
      // Short sleek train on the tracks
      const cw = 1.45;
      for (let c = 0; c < cars; c++) {
        const tx = 0.75 + c * (cw + 0.18);
        out += box(X(tx), Y(4.35), 0.14, cw, 0.72, 0.62, [C.white, mat[0], mat[2]]) +
          box(X(tx), Y(4.34), 0.34, cw + 0.02, 0.74, 0.14, accTones) +
          windows(X(tx), Y(4.35), 0.42, cw, 0.72, 0.3, { floors: 1, cols: 3, colsD: 1, lit: (f, i) => isLit(Math.min(n - 1, c * 2 + (i % 2)), i, 0) });
      }
      break;
    }
    case "controltower": {
      const hj = (r() - 0.5) * 0.35;
      const hangarLeft = r() < 0.5;
      const hx = hangarLeft ? 0.6 : 2.5, tx = hangarLeft ? 3.8 : 1.1;
      const hHangar = 1.15 + n * 0.15, hShaft = 2.0 + n * 0.52 + hj;
      const drawHangar = () => {
        let hOut = box(X(hx), Y(1.4), 0, 2.8, 3.2, hHangar, mat) +
          windows(X(hx), Y(1.4), 0, 2.8, 3.2, hHangar, { floors: Math.max(2, Math.floor(n / 2)), cols: 0, colsD: 4, lit: isLit }) +
          box(X(hx - 0.05), Y(1.35), hHangar, 2.9, 3.3, 0.18, accTones);
        // Wide hangar bay door on front-left
        hOut += poly([P(X(hx + 0.35), Y(4.62), 0), P(X(hx + 2.45), Y(4.62), 0), P(X(hx + 2.45), Y(4.62), hHangar * 0.8), P(X(hx + 0.35), Y(4.62), hHangar * 0.8)], C.nightDeep);
        roof = [X(hx + 0.2), Y(1.55), hHangar + 0.18, 2.4, 2.8];
        return hOut;
      };
      const drawTower = () => {
        let tOut = box(X(tx), Y(2.0), 0, 1.35, 1.35, hShaft, mat) +
          windows(X(tx), Y(2.0), 0, 1.35, 1.35, hShaft, { floors: n, cols: 2, colsD: 2, lit: isLit }) +
          box(X(tx - 0.2), Y(1.8), hShaft, 1.75, 1.75, 0.26, accTones);
        // Flared glass control cab
        const cabLit = lit >= n || isLit(n - 1, 0, 0);
        tOut += frustum(X(tx + 0.675), Y(2.675), hShaft + 0.26, 1.65, 1.65, 2.25, 2.25, 0.8, cabLit ? [C.lit, C.lit, C.litWarm] : M.glass);
        tOut += box(X(tx - 0.48), Y(1.52), hShaft + 1.06, 2.3, 2.3, 0.2, [mat[0], accent, C.nightDeep]);
        const [rx0, ry0] = P(X(tx + 0.675), Y(2.675), hShaft + 1.26);
        const [, ry1] = P(X(tx + 0.675), Y(2.675), hShaft + 2.35);
        tOut += `<path d="M${rx0.toFixed(1)},${ry0.toFixed(1)}V${ry1.toFixed(1)}" stroke="${C.steel[0]}" stroke-width="1.8"/>` +
          `<circle cx="${rx0.toFixed(1)}" cy="${ry1.toFixed(1)}" r="2.4" fill="${C.red}" class="blink"/>`;
        return tOut;
      };
      out += hangarLeft ? drawHangar() + drawTower() : drawTower() + drawHangar();
      break;
    }
    case "workshop": {
      const bays = r() < 0.5 ? 3 : 4;
      const h = 1.3 + n * 0.24;
      out += box(X(0.4), Y(0.6), 0, 5.2, 4.8, 0.14, M.concrete);
      // Workshop garage body
      out += box(X(0.7), Y(0.8), 0.14, 4.2, 3.0, h, mat) +
        windows(X(0.7), Y(0.8), 0.14, 4.2, 3.0, h, { floors: n, cols: 0, colsD: 5, lit: isLit });
      // Sawtooth roof bays + flat service pad for spec.roof
      const bw = 2.8 / bays;
      for (let i = 0; i < bays; i++) {
        out += gable(X(0.7 + i * bw), Y(0.8), 0.14 + h, bw, 3.0, 0.62, [mat[0], M.glass[0], accTones[2]]);
      }
      out += box(X(3.5), Y(0.8), 0.14 + h, 1.4, 3.0, 0.2, accTones);
      roof = [X(3.5), Y(0.8), 0.34 + h, 1.4, 3.0];
      // Big open garage door on front-left with warm lit interior
      out += poly([P(X(1.15), Y(3.82), 0.14), P(X(3.45), Y(3.82), 0.14), P(X(3.45), Y(3.82), 0.14 + h * 0.72), P(X(1.15), Y(3.82), 0.14 + h * 0.72)], lit > 0 ? C.litWarm : C.nightDeep);
      out += box(X(1.1), Y(3.78), 0.14 + h * 0.65, 2.4, 0.16, 0.22, accTones);
      // Articulated robot arm outside on the apron
      const ax = X(4.1), ay = Y(4.65);
      out += cylinder(ax, ay, 0.14, 0.45, 0.25, M.charcoal) +
        cylinder(ax, ay, 0.39, 0.28, 0.4, accTones);
      const [j0x, j0y] = P(ax, ay, 0.75);
      const [j1x, j1y] = P(ax - 0.45, ay - 0.2, 1.65);
      const [j2x, j2y] = P(ax + 0.35, ay + 0.25, 1.95);
      out += `<path d="M${j0x.toFixed(1)},${j0y.toFixed(1)}L${j1x.toFixed(1)},${j1y.toFixed(1)}L${j2x.toFixed(1)},${j2y.toFixed(1)}" stroke="${accent}" stroke-width="4" stroke-linecap="round" fill="none"/>` +
        `<circle cx="${j1x.toFixed(1)}" cy="${j1y.toFixed(1)}" r="3" fill="${C.steel[0]}"/>` +
        `<circle cx="${j2x.toFixed(1)}" cy="${j2y.toFixed(1)}" r="2.8" fill="${lit > 0 ? C.lit : C.steel[0]}"/>`;
      break;
    }
    case "library": {
      const cols = r() < 0.5 ? 4 : 5;
      const h = 1.45 + n * 0.28;
      // Classical reading room block with tall book-stack windows
      out += box(X(0.8), Y(0.8), 0.42, 4.4, 3.3, h, mat) +
        windows(X(0.8), Y(0.8), 0.42, 4.4, 3.3, h, { floors: n, cols: 6, colsD: 6, lit: isLit }) +
        box(X(0.75), Y(0.75), 0.42 + h, 4.5, 3.4, 0.22, accTones);
      roof = [X(1.1), Y(1.0), 0.64 + h, 3.8, 2.4];
      // Grand steps in front-left
      out += box(X(0.7), Y(0.7), 0, 4.6, 3.8, 0.42, M.concrete) +
        box(X(1.1), Y(4.4), 0, 3.8, 0.35, 0.3, M.concrete) +
        box(X(1.25), Y(4.75), 0, 3.5, 0.35, 0.16, M.sandstone);
      // Classical colonnade + triangular pediment on front-left
      for (let i = 0; i < cols; i++) {
        const cx = 1.35 + i * (3.1 / (cols - 1));
        out += box(X(cx), Y(4.12), 0.42, 0.22, 0.22, h * 0.86, [C.white, C.white, M.concrete[1]]);
      }
      out += box(X(1.2), Y(3.95), 0.42 + h * 0.86, 3.6, 0.5, 0.22, mat) +
        gableY(X(1.2), Y(3.95), 0.64 + h * 0.86, 3.6, 0.5, 0.85, [mat[0], accent, mat[2]]);
      const [ox0, oy0] = P(X(3.0), Y(4.46), 0.96 + h * 0.86);
      out += `<circle cx="${ox0.toFixed(1)}" cy="${oy0.toFixed(1)}" r="3.2" fill="${lit >= n ? C.lit : C.white}"/>`;
      break;
    }
    case "stadium": {
      const h = 1.0 + n * 0.2;
      const mast = (mx, my) => {
        const [sx, sy] = P(X(mx), Y(my), 0);
        const [tx, ty] = P(X(mx), Y(my), h + 1.65);
        return `<path d="M${sx.toFixed(1)},${sy.toFixed(1)}L${tx.toFixed(1)},${ty.toFixed(1)}" stroke="${C.steel[1]}" stroke-width="2"/>` +
          `<rect x="${(tx - 4.5).toFixed(1)}" y="${(ty - 3).toFixed(1)}" width="9" height="4.5" rx="1" fill="${lit > 0 ? C.lit : C.steel[0]}" stroke="${accent}" stroke-width="1"/>`;
      };
      // Back floodlight masts
      out += mast(0.75, 0.75) + mast(5.25, 0.75);
      // Press box at back rim for spec.roof
      out += box(X(2.1), Y(0.55), 0, 1.8, 0.9, h + 0.25, mat);
      roof = [X(2.1), Y(0.55), h + 0.25, 1.8, 0.9];
      // Oval bowl wall & concourse windows
      const cx = X(3.0), cy = Y(3.1);
      out += cylinder(cx, cy, 0, 2.3, h, mat) +
        cylinderWindows(cx, cy, 0, 2.3, h, n, (f) => isLit(f, 0, 0)) +
        cylinder(cx, cy, h, 2.4, 0.2, accTones);
      // Tiered stands & sunken green pitch inside the bowl
      const [px, py] = P(cx, cy, h + 0.2);
      const rx = 2.25 * Math.SQRT2 * S, ry = (2.25 / Math.SQRT2) * S;
      out += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(rx * 0.92).toFixed(1)}" ry="${(ry * 0.92).toFixed(1)}" fill="${M.concrete[2]}"/>` +
        `<ellipse cx="${px.toFixed(1)}" cy="${(py + 2).toFixed(1)}" rx="${(rx * 0.76).toFixed(1)}" ry="${(ry * 0.76).toFixed(1)}" fill="${accent}"/>` +
        `<ellipse cx="${px.toFixed(1)}" cy="${(py + 3.5).toFixed(1)}" rx="${(rx * 0.58).toFixed(1)}" ry="${(ry * 0.58).toFixed(1)}" fill="${C.grass[0]}" stroke="${C.white}" stroke-width="1.2"/>` +
        `<ellipse cx="${px.toFixed(1)}" cy="${(py + 3.5).toFixed(1)}" rx="${(rx * 0.18).toFixed(1)}" ry="${(ry * 0.18).toFixed(1)}" fill="none" stroke="${C.white}" stroke-width="1.1"/>`;
      // Front floodlight masts
      out += mast(0.75, 5.25) + mast(5.25, 5.25);
      break;
    }
    case "windfarm": {
      const hj = (r() - 0.5) * 0.3;
      out += box(X(0.35), Y(0.35), 0, 5.3, 5.3, 0.14, C.grass);
      // 3 wind turbines with spinning blades in back-to-front painter's order
      out += windTurbine(X(2.0), Y(1.2), 0.14, 2.9 + n * 0.22 + hj, 1.25, accent, isLit(0, 0, 0));
      out += windTurbine(X(4.45), Y(1.55), 0.14, 2.55 + n * 0.2 - hj * 0.5, 1.15, accent, isLit(1, 0, 0));
      out += windTurbine(X(1.35), Y(3.85), 0.14, 2.35 + n * 0.18, 1.1, accent, isLit(2, 0, 0));
      // Small control building & substation at front-right with flat roof for spec.roof
      const hCtrl = 0.95 + n * 0.16;
      out += box(X(2.9), Y(3.1), 0.14, 2.2, 1.85, hCtrl, mat) +
        windows(X(2.9), Y(3.1), 0.14, 2.2, 1.85, hCtrl, { floors: Math.min(3, n), cols: 3, colsD: 2, lit: isLit }) +
        box(X(2.85), Y(3.05), 0.14 + hCtrl, 2.3, 1.95, 0.16, accTones);
      roof = [X(2.9), Y(3.1), 0.3 + hCtrl, 2.2, 1.85];
      break;
    }
    case "lab": {
      const hj = (r() - 0.5) * 0.25;
      const h = 1.25 + n * 0.24 + hj;
      // Tall chimney with louvered vent at back
      out += cylinder(X(1.25), Y(0.95), 0, 0.36, h + 1.85, C.steel) +
        box(X(0.9), Y(0.6), h + 1.65, 0.7, 0.7, 0.42, accTones);
      const [sx, sy] = P(X(1.25), Y(0.95), h + 2.1);
      P(X(1.25) - 1.0, Y(0.95) - 1.0, h + 3.5);
      out += `<g class="smoke"><circle cx="${(sx + 3).toFixed(1)}" cy="${(sy - 6).toFixed(1)}" r="4.5" fill="#d9dce1"/><circle cx="${(sx + 8).toFixed(1)}" cy="${(sy - 12).toFixed(1)}" r="6" fill="#c9ccd1"/></g>`;
      // Main research lab block with flat roof for spec.roof
      out += box(X(0.8), Y(1.45), 0, 3.3, 3.2, h, mat) +
        windows(X(0.8), Y(1.45), 0, 3.3, 3.2, h, { floors: n, cols: 5, colsD: 4, lit: isLit }) +
        box(X(0.75), Y(1.4), h, 3.4, 3.3, 0.2, accTones);
      roof = [X(1.0), Y(1.65), h + 0.2, 2.8, 2.7];
      // Pressurized tanks and overhead pipes on right side
      out += box(X(3.9), Y(2.25), 0.75, 0.7, 0.22, 0.22, accTones) +
        box(X(3.9), Y(3.75), 0.65, 0.7, 0.22, 0.22, C.steel);
      for (const [ty, th, fIdx] of [[2.35, 1.55, 0], [3.85, 1.35, 1]]) {
        out += cylinder(X(4.85), Y(ty), 0, 0.56, th, C.steel) +
          cylinderWindows(X(4.85), Y(ty), 0, 0.56, th, 2, (f) => isLit(fIdx + f, 0, 0)) +
          dome(X(4.85), Y(ty), th, 0.56, accTones);
      }
      break;
    }
    case "pagoda": {
      const tiers = Math.min(5, Math.max(3, Math.floor(n / 2) + 2));
      out += box(X(1.0), Y(1.0), 0, 4.0, 4.0, 0.35, M.concrete) +
        box(X(1.3), Y(1.3), 0.35, 3.4, 3.4, 0.24, M.sandstone);
      let zt = 0.59;
      for (let t = 0; t < tiers; t++) {
        const w = 2.65 - t * 0.36, th = 0.58;
        const wx = 3.0 - w / 2, wy = 3.0 - w / 2;
        const fl = Math.min(n - 1, Math.floor((t * n) / tiers));
        out += box(X(wx), Y(wy), zt, w, w, th, mat) +
          windows(X(wx), Y(wy), zt, w, w, th, { floors: 1, cols: Math.max(2, 4 - t), colsD: Math.max(2, 4 - t), lit: (f, i, s) => isLit(fl, i, s) });
        // Tiered roof with flared upturned eaves
        const ew = w + 0.95;
        out += frustum(X(3.0), Y(3.0), zt + th, ew, ew, w + 0.15, w + 0.15, 0.32, accTones);
        // Upturned corner eave tips on the three visible corners
        const ez = zt + th;
        out += poly([P(X(3.0 - ew / 2), Y(3.0 + ew / 2), ez), P(X(3.0 - ew / 2 + 0.35), Y(3.0 + ew / 2), ez), P(X(3.0 - ew / 2 - 0.18), Y(3.0 + ew / 2 + 0.12), ez + 0.26)], accTones[0]) +
          poly([P(X(3.0 + ew / 2), Y(3.0 + ew / 2), ez), P(X(3.0 + ew / 2 - 0.32), Y(3.0 + ew / 2), ez), P(X(3.0 + ew / 2 + 0.15), Y(3.0 + ew / 2 + 0.15), ez + 0.28)], accTones[0]) +
          poly([P(X(3.0 + ew / 2), Y(3.0 - ew / 2), ez), P(X(3.0 + ew / 2), Y(3.0 - ew / 2 + 0.35), ez), P(X(3.0 + ew / 2 + 0.18), Y(3.0 - ew / 2 - 0.12), ez + 0.26)], accTones[2]);
        zt += th + 0.32;
      }
      // Top pyramid cap & sorin finial spire
      const tw = 2.65 - (tiers - 1) * 0.36;
      out += pyramid(X(3.0 - tw / 2), Y(3.0 - tw / 2), zt, tw, tw, 0.65, accTones);
      const [sx, sy] = P(X(3.0), Y(3.0), zt + 0.65);
      const [, ty] = P(X(3.0), Y(3.0), zt + 1.85);
      out += `<path d="M${sx.toFixed(1)},${sy.toFixed(1)}V${ty.toFixed(1)}" stroke="${C.yellow}" stroke-width="2"/>` +
        `<circle cx="${sx.toFixed(1)}" cy="${ty.toFixed(1)}" r="2.4" fill="${lit >= n ? C.lit : accent}"/>`;
      out += tree(X(0.95), Y(5.05), 0, 0.95);
      break;
    }
    case "apartments": {
      const dh = (r() - 0.5) * 0.55;
      const hA = 1.6 + n * 0.46, hB = Math.max(1.5, hA + dh);
      // Back-right block (Tower A) with balconies and flat roof for spec.roof
      out += box(X(3.0), Y(0.85), 0, 2.15, 2.15, hA, mat) +
        windows(X(3.0), Y(0.85), 0, 2.15, 2.15, hA, { floors: n, cols: 3, colsD: 3, lit: isLit }) +
        box(X(2.95), Y(0.8), hA, 2.25, 2.25, 0.2, accTones);
      for (let f = 1; f < n; f += 2) {
        const zb = (f / n) * hA;
        out += box(X(3.2), Y(3.0), zb, 1.7, 0.3, 0.16, accTones);
      }
      roof = [X(3.0), Y(0.85), hA + 0.2, 2.15, 2.15];
      // Sky bridge joining the two mid-rise blocks
      const zBridge = Math.min(hA, hB) * 0.56;
      const bridgeFl = Math.min(n - 1, Math.floor(n / 2));
      out += box(X(2.15), Y(2.15), zBridge, 1.25, 1.15, 0.62, M.glass) +
        box(X(2.1), Y(2.1), zBridge + 0.62, 1.35, 1.25, 0.14, accTones) +
        windows(X(2.15), Y(2.15), zBridge, 1.25, 1.15, 0.62, { floors: 1, band: true, lit: () => isLit(bridgeFl, 0, 0) });
      // Front-left block (Tower B) with balconies
      out += box(X(0.8), Y(2.55), 0, 2.2, 2.2, hB, mat) +
        windows(X(0.8), Y(2.55), 0, 2.2, 2.2, hB, { floors: n, cols: 3, colsD: 3, lit: (f, i, s) => isLit(f, i + 1, s) }) +
        box(X(0.75), Y(2.5), hB, 2.3, 2.3, 0.2, accTones);
      for (let f = 0; f < n; f += 2) {
        const zb = ((f + 0.5) / n) * hB;
        out += box(X(1.0), Y(4.75), zb, 1.75, 0.32, 0.16, accTones) +
          box(X(3.0), Y(2.8), zb, 0.3, 1.65, 0.16, accTones);
      }
      out += tree(X(4.85), Y(4.85), 0, 0.9);
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
  const colours = ACCENTS.map((a) => C[a]);
  for (let i = 0; i < 22; i++) {
    const x = vx + r() * vw, y = top + r() * height * 0.45;
    confetti += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="5" height="${r() < 0.5 ? 5 : 9}" rx="1" fill="${colours[i % colours.length]}" transform="rotate(${(r() * 90).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" class="confetti d${Math.floor(r() * 5)}"/>`;
  }
  return `<svg viewBox="${vx} ${top} ${vw} ${height}" aria-hidden="true" class="building">${body}${confetti}</svg>`;
}
