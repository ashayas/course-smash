// Draws the app icon and the launch mark from the logo mark in public/city.js, so they match the web app.
//   node ios/scripts/make-icons.mjs
// Needs ImageMagick (`brew install imagemagick`). Writes into ios/CourseSmash/Resources/Assets.xcassets.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const ASSETS = join(ROOT, "ios/CourseSmash/Resources/Assets.xcassets");
const { markSvg } = await import(join(ROOT, "public/city.js"));
const INK = "#141414";

const mark = markSvg();
const [vx, vy, vw, vh] = mark.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
const body = mark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

/** The mark centred in a square. `fill` is how much of the square's width it takes; `background` is optional. */
function square(size, fill, background) {
  const scale = (size * fill) / vw;
  const tx = (size - vw * scale) / 2 - vx * scale, ty = (size - vh * scale) / 2 - vy * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    (background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "") +
    `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${body}</g></svg>`;
}

const work = mkdtempSync(join(tmpdir(), "cs-icons-"));
function png(svg, out, opaque) {
  const source = join(work, "in.svg");
  writeFileSync(source, svg);
  execFileSync("magick", ["-background", opaque ? INK : "none", source, ...(opaque ? ["-alpha", "off", `PNG24:${out}`] : [`PNG32:${out}`])]);
}
const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

/* App icon: the App Store's 1024 px image and every iPhone size, each drawn at its own size. */
const iconDir = join(ASSETS, "AppIcon.appiconset");
mkdirSync(iconDir, { recursive: true });
const sizes = [[20, 2], [20, 3], [29, 2], [29, 3], [40, 2], [40, 3], [60, 2], [60, 3]];
const images = sizes.map(([points, scale]) => {
  const filename = `icon-${points}@${scale}x.png`;
  png(square(points * scale, 0.76, INK), join(iconDir, filename), true);
  return { idiom: "iphone", size: `${points}x${points}`, scale: `${scale}x`, filename };
});
png(square(1024, 0.76, INK), join(iconDir, "icon-1024.png"), true);
images.push({ idiom: "ios-marketing", size: "1024x1024", scale: "1x", filename: "icon-1024.png" });
json(join(iconDir, "Contents.json"), { images, info: { author: "xcode", version: 1 } });

/* Launch screen: the mark on ink. */
const launchDir = join(ASSETS, "LaunchMark.imageset");
mkdirSync(launchDir, { recursive: true });
const launch = [1, 2, 3].map((scale) => {
  const filename = `launch-mark@${scale}x.png`;
  png(square(120 * scale, 1), join(launchDir, filename), false);
  return { idiom: "universal", scale: `${scale}x`, filename };
});
json(join(launchDir, "Contents.json"), { images: launch, info: { author: "xcode", version: 1 } });

const colour = (hex) => ({
  colors: [{ idiom: "universal", color: { "color-space": "srgb", components: { red: `0x${hex.slice(1, 3)}`, green: `0x${hex.slice(3, 5)}`, blue: `0x${hex.slice(5, 7)}`, alpha: "1.000" } } }],
  info: { author: "xcode", version: 1 },
});
for (const [name, hex] of [["LaunchBackground", INK], ["AccentColor", "#F5D556"]]) {
  mkdirSync(join(ASSETS, `${name}.colorset`), { recursive: true });
  json(join(ASSETS, `${name}.colorset`, "Contents.json"), colour(hex));
}
json(join(ASSETS, "Contents.json"), { info: { author: "xcode", version: 1 } });
console.log(`Wrote ${images.length} icons and the launch mark to ${ASSETS}`);
