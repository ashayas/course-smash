// Makes the marketing images: the store screenshots for both apps, the Google Play feature graphic and the
// press kit. Every picture is a real app screen from a walkthrough run, under a headline, on the brand's dark
// page, with art drawn by public/city.js. Nothing here is drawn by hand.
//
//   node scripts/marketing/build.mjs --ios ios/build/walkthrough --android android/build/walkthrough
//
// The walkthroughs save the screens this needs as NN-store-<name>.png. Take them from a demo run with the
// answer-key helper (scripts/demo.mjs, scripts/demo-keys.mjs), so the scores are believable and no screen
// shows a real username. With only one of --ios or --android, only that app's set is made.
// Needs Google Chrome and, for the press kit's zip, the `zip` command.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SHOTS } from "./shots.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const { citySvg, markSvg } = await import(join(ROOT, "public/city.js"));
const ICONS = JSON.parse(readFileSync(join(ROOT, "catalog/icons.json"), "utf8"));
const FONTS = join(ROOT, "ios/CourseSmash/Resources/Fonts");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const flag = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? resolve(process.argv[at + 1]) : null;
};
const captures = { ios: flag("--ios"), android: flag("--android") };

/** Each store's sizes. Apple reads the device from the pixel size; Play wants 9:16 for a phone. */
const SIZES = {
  ios: [
    { id: "iphone69", width: 1320, height: 2868, out: "ios/fastlane/screenshots/en-US" },
    { id: "iphone65", width: 1284, height: 2778, out: "ios/fastlane/screenshots/en-US" },
  ],
  android: [{ id: "", width: 1080, height: 1920, out: "android/fastlane/metadata/android/en-US/images/phoneScreenshots" }],
};

const C = { ink: "#141414", surface: "#1f1f1d", paper: "#fbfbfb", muted: "#a3a3a0", yellow: "#f5d556", unlit: "#27303f" };
const FACES = [["400", "Regular"], ["500", "Medium"], ["600", "SemiBold"], ["800", "ExtraBold"]]
  .map(([weight, file]) => `@font-face { font-family: "Inter Tight"; font-weight: ${weight}; src: url("file://${join(FONTS, `InterTight-${file}.ttf`)}"); }`).join("\n");
const BASE = `${FACES}
  * { box-sizing: border-box; }
  html, body { margin: 0; overflow: hidden; background: ${C.ink}; color: ${C.paper}; font-family: "Inter Tight", sans-serif; }
  h1, p { margin: 0; }`;

const work = mkdtempSync(join(tmpdir(), "cs-marketing-"));
let pages = 0;

/** Render a page to a PNG of exactly width x height. */
function render(html, width, height, out) {
  const page = join(work, `page-${pages++}.html`);
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}</style></head><body>${html}</body></html>`);
  execFileSync(CHROME, [`--user-data-dir=${join(work, "chrome")}`, "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${width},${height}`, "--virtual-time-budget=4000", `--screenshot=${out}`, `file://${page}`], { stdio: ["ignore", "ignore", "ignore"] });
}

/** The walkthrough's capture called NN-<name>.png, or null. */
function capture(dir, name) {
  const file = dir && existsSync(dir) ? readdirSync(dir).find((f) => f.replace(/^\d+-/, "") === `${name}.png`) : null;
  return file ? join(dir, file) : null;
}

/**
 * One store screenshot, laid out on a page 1320 units wide whatever the output size: a row of windows that
 * light up one more per picture, the headline, a line under it, and the app screen in a plain frame that runs
 * off the bottom of the page.
 */
function shotHtml(shot, index, image, width, height) {
  const scale = width / 1320;
  // A 9:16 page is much shorter than a phone screen, so its words take less room and more of the screen shows.
  const short = height / width < 2;
  const type = short ? { top: 104, h1: 112, p: 46, words: 500 } : { top: 150, h1: 128, p: 50, words: 590 };
  const windows = SHOTS.map((_, i) => `<i class="${i <= index ? "lit" : ""}"></i>`).join("");
  // The phone normally shows from its top and runs off the bottom of the page. A `lower` picture is the other way
  // round: the phone's bottom is on the page, with a margin under it, and its top is cut off under the words.
  const room = Math.floor(height / scale - type.top - type.words - 40 - 72);
  const frame = shot.lower
    ? `.phone { margin: 40px auto 0; width: 1128px; height: ${room}px; flex: none; padding: 0 24px 24px; background: ${C.surface}; border-radius: 0 0 124px 124px; overflow: hidden; display: flex; align-items: flex-end; }
    .phone img { display: block; width: 100%; flex: none; border-radius: 0 0 100px 100px; }`
    : `.phone { margin: 0 auto; width: 1044px; flex: none; padding: 24px 24px 0; background: ${C.surface}; border-radius: 132px 132px 0 0; }
    .phone img { display: block; width: 100%; border-radius: 108px 108px 0 0; }`;
  return `<style>
    .page { width: 1320px; height: ${Math.ceil(height / scale)}px; zoom: ${scale}; padding: ${type.top}px 96px 0; display: flex; flex-direction: column; overflow: hidden; }
    /* The words get the same room in every picture, so the phone starts at the same height in all of them. */
    .words { height: ${type.words}px; flex: none; }
    .windows { display: flex; gap: 14px; margin-bottom: 52px; }
    .windows i { width: 34px; height: 34px; border-radius: 9px; background: ${C.unlit}; }
    .windows .lit { background: ${C.yellow}; }
    h1 { font-size: ${type.h1}px; font-weight: 800; letter-spacing: -.055em; line-height: .96; text-wrap: balance; }
    p { margin-top: 36px; font-size: ${type.p}px; font-weight: 500; letter-spacing: -.02em; line-height: 1.15; color: ${C.muted}; text-wrap: balance; }
    ${frame}
  </style>
  <div class="page"><div class="words"><div class="windows">${windows}</div><h1>${shot.headline}</h1><p>${shot.line}</p></div>
    <div class="phone"><img src="file://${image}"></div></div>`;
}

const made = [];
const cleared = new Set();
for (const [app, dir] of Object.entries(captures)) {
  if (!dir) continue;
  for (const size of SIZES[app]) {
    const out = join(ROOT, size.out);
    mkdirSync(out, { recursive: true });
    // Pictures from an earlier run go, so a renamed or dropped shot doesn't linger in the store set.
    if (!cleared.has(out)) for (const old of readdirSync(out).filter((f) => f.endsWith(".png"))) rmSync(join(out, old));
    cleared.add(out);
    SHOTS.forEach((shot, index) => {
      const image = capture(dir, shot.capture);
      if (!image) return console.log(`No ${shot.capture} capture in ${dir}, so ${app} has no "${shot.name}" picture.`);
      const file = join(out, `${size.id ? `${size.id}-` : ""}${String(index + 1).padStart(2, "0")}-${shot.name}.png`);
      render(shotHtml(shot, index, image, size.width, size.height), size.width, size.height, file);
      made.push(file);
    });
  }
}

/* The city, as on the link preview: a mix of library buildings at different stages. */
const PICKS = [
  ["k8s-observability", 6, 6], ["applied-cryptography", 5, 3], ["power-and-batteries", 5, 2], ["gpu-fundamentals", 6, 4],
  ["etcd-control-plane", 7, 7], ["rag-fundamentals", 5, 2], ["inference-benchmarking", 6, 6], ["robot-mechanics", 4, 1],
];
const city = citySvg(PICKS.map(([slug, modules, passed]) => ({
  id: `og-${slug}`, title: slug, icon: ICONS[slug], status: passed === modules ? "complete" : "active", modules, passed,
})));

/* Google Play's feature graphic, 1024 x 500. */
const play = join(ROOT, "android/fastlane/metadata/android/en-US/images");
render(`<style>
    .wrap { position: relative; width: 1024px; height: 500px; overflow: hidden; }
    .copy { position: absolute; left: 60px; top: 0; bottom: 0; width: 430px; display: flex; flex-direction: column; justify-content: center; gap: 20px; z-index: 1; }
    .mark svg { display: block; width: 76px; height: auto; }
    h1 { font-size: 86px; font-weight: 800; letter-spacing: -.055em; line-height: .9; }
    p { font-size: 25px; font-weight: 500; letter-spacing: -.02em; line-height: 1.15; color: ${C.muted}; }
    p b { color: ${C.paper}; font-weight: 500; }
    .city { position: absolute; right: -50px; top: -4px; width: 640px; }
    .city svg { display: block; width: 100%; height: auto; }
  </style>
  <div class="wrap"><div class="copy"><div class="mark">${markSvg(76)}</div><h1>Course<br>Smash</h1>
    <p>A few questions a day. <b>Every course is a building in your city.</b></p></div><div class="city">${city}</div></div>`,
  1024, 500, join(play, "featureGraphic.png"));
made.push(join(play, "featureGraphic.png"));

/* The press kit: the logo, the icon, the link preview and four of the store pictures at half size. */
const press = join(ROOT, "public/press-kit");
mkdirSync(press, { recursive: true });
const mark = markSvg(512).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true"', "");
writeFileSync(join(press, "course-smash-mark.svg"), `${mark}\n`);
render(`<style>html, body { background: transparent; } .mark { width: 1024px; height: 1024px; display: grid; place-items: center; } .mark svg { width: 860px; height: auto; }</style><div class="mark">${markSvg(860)}</div>`,
  1024, 1024, join(press, "course-smash-mark.png"));
render(`<style>
    .logo { width: 1600px; height: 600px; display: flex; align-items: center; justify-content: center; gap: 48px; }
    .logo svg { display: block; width: 300px; height: auto; }
    h1 { font-size: 176px; font-weight: 800; letter-spacing: -.055em; line-height: 1; }
  </style><div class="logo">${markSvg(300)}<h1>Course Smash</h1></div>`, 1600, 600, join(press, "course-smash-logo.png"));
copyFileSync(join(ROOT, "ios/CourseSmash/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png"), join(press, "course-smash-icon.png"));
copyFileSync(join(ROOT, "public/og.png"), join(press, "course-smash-preview.png"));
if (captures.ios) {
  for (const name of ["today", "recall", "city", "library"]) {
    const index = SHOTS.findIndex((s) => s.name === name);
    const image = capture(captures.ios, SHOTS[index].capture);
    if (image) render(shotHtml(SHOTS[index], index, image, 660, 1434), 660, 1434, join(press, `course-smash-${name}.png`));
  }
}
const kit = readdirSync(press).filter((f) => !f.endsWith(".zip")).sort();
rmSync(join(press, "course-smash-press-kit.zip"), { force: true });
execFileSync("zip", ["-q", "-X", "course-smash-press-kit.zip", ...kit], { cwd: press });
made.push(...kit.map((f) => join(press, f)), join(press, "course-smash-press-kit.zip"));

rmSync(work, { recursive: true, force: true });
console.log(`Made ${made.length} files:\n${made.map((f) => `  ${f.replace(ROOT, "")}`).join("\n")}`);
