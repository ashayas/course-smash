// Draws the launcher icons, the splash mark and the Google Play graphics from the logo mark in public/city.js,
// so they match the web app and the iOS app.
//   node android/scripts/make-icons.mjs
// Needs ImageMagick (`brew install imagemagick`).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const RES = join(ROOT, "android/app/src/main/res");
const PLAY = join(ROOT, "android/fastlane/metadata/android/en-US/images");
const FONT = join(RES, "font/inter_tight_extrabold.ttf");
const { markSvg } = await import(join(ROOT, "public/city.js"));
const INK = "#141414";

const mark = markSvg();
const [vx, vy, vw, vh] = mark.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
const body = mark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

/** The mark centred at (cx, cy), `width` wide, as SVG markup. */
function placed(cx, cy, width) {
  const scale = width / vw;
  return `<g transform="translate(${(cx - (vx + vw / 2) * scale).toFixed(2)} ${(cy - (vy + vh / 2) * scale).toFixed(2)}) scale(${scale.toFixed(4)})">${body}</g>`;
}
const svg = (w, h, inner, background) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (background ? `<rect width="${w}" height="${h}" fill="${background}"/>` : "") + inner + "</svg>";

const work = mkdtempSync(join(tmpdir(), "cs-icons-"));
function png(markup, out, opaque, extra = []) {
  const source = join(work, "in.svg");
  writeFileSync(source, markup);
  execFileSync("magick", ["-background", opaque ? INK : "none", source, ...extra, ...(opaque ? ["-alpha", "off", `PNG24:${out}`] : [`PNG32:${out}`])]);
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(densities)) {
  const dir = join(RES, `mipmap-${name}`);
  mkdirSync(dir, { recursive: true });
  // Adaptive icon foreground: a 108dp canvas whose middle 66dp is always visible.
  const full = Math.round(108 * scale);
  png(svg(full, full, placed(full / 2, full / 2, full * 0.5)), join(dir, "ic_launcher_foreground.png"), false);
  // Launchers older than Android 8 use these whole images.
  const legacy = Math.round(48 * scale);
  png(svg(legacy, legacy, `<rect width="${legacy}" height="${legacy}" rx="${legacy * 0.2}" fill="${INK}"/>` + placed(legacy / 2, legacy / 2, legacy * 0.74)), join(dir, "ic_launcher.png"), false);
  png(svg(legacy, legacy, `<circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="${INK}"/>` + placed(legacy / 2, legacy / 2, legacy * 0.66)), join(dir, "ic_launcher_round.png"), false);
  // The splash mark. Android 12 shows it inside a circle two thirds of its size, so it has wide margins.
  const drawable = join(RES, `drawable-${name}`);
  mkdirSync(drawable, { recursive: true });
  const splash = Math.round(240 * scale);
  png(svg(splash, splash, placed(splash / 2, splash / 2, splash * 0.42)), join(drawable, "splash_mark.png"), false);
}

// Google Play: the 512 px icon and the 1024 x 500 feature graphic.
mkdirSync(PLAY, { recursive: true });
png(svg(512, 512, placed(256, 256, 512 * 0.76), INK), join(PLAY, "icon.png"), true);
png(svg(1024, 500, placed(240, 250, 300), INK), join(PLAY, "featureGraphic.png"), true,
  ["-font", FONT, "-fill", "#fbfbfb", "-pointsize", "80", "-kerning", "-4", "-gravity", "West", "-annotate", "+440+0", "Course Smash"]);
console.log(`Wrote launcher icons and the splash mark to ${RES}, and the Play graphics to ${PLAY}`);
