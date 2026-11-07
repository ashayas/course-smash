// Renders public/og.png, the 1200 × 630 link preview: the wordmark beside a city of library buildings.
//   node scripts/og.mjs
// Needs Google Chrome installed. The art comes from public/city.js, so the preview matches the app.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const { citySvg, markSvg } = await import(join(ROOT, "public/city.js"));
const ICONS = JSON.parse(readFileSync(join(ROOT, "catalog/icons.json"), "utf8"));

// A mix of tracks, so the preview shows off the range of buildings. Floors and lights vary like real progress.
const PICKS = [
  ["k8s-observability", 6, 6], ["applied-cryptography", 5, 3], ["power-and-batteries", 5, 2], ["gpu-fundamentals", 6, 4],
  ["etcd-control-plane", 7, 7], ["rag-fundamentals", 5, 2], ["inference-benchmarking", 6, 6], ["robot-mechanics", 4, 1],
];

const courses = PICKS.map(([slug, modules, passed]) => ({
  id: `og-${slug}`, title: slug, icon: ICONS[slug], status: passed === modules ? "complete" : "active",
  modules, passed,
}));

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;800&display=block">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #141414; font-family: "Inter Tight", sans-serif; color: #fbfbfb; }
  .wrap { position: relative; width: 1200px; height: 630px; }
  .copy { position: absolute; left: 72px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; gap: 26px; z-index: 1; }
  .mark svg { width: 92px; height: auto; display: block; }
  h1 { margin: 0; font-size: 104px; font-weight: 800; letter-spacing: -.055em; line-height: .9; }
  p { margin: 0; font-size: 30px; font-weight: 500; letter-spacing: -.02em; line-height: 1.15; color: #a3a3a0; }
  p b { color: #fbfbfb; font-weight: 500; }
  .pills { display: flex; gap: 10px; }
  .pill { height: 14px; width: 44px; border-radius: 4px; background: #1f1f1d; }
  .pill.on { background: #f5d556; }
  .city { position: absolute; right: -40px; top: 10px; width: 760px; }
  .city svg { display: block; width: 100%; height: auto; }
  .url { position: absolute; left: 72px; bottom: 44px; font-size: 22px; font-weight: 500; color: #a3a3a0; letter-spacing: 0; }
</style></head><body><div class="wrap">
  <div class="copy">
    <div class="mark">${markSvg(92)}</div>
    <h1>Course<br>Smash</h1>
    <p>Say what you want to learn. <b>Every course goes up as a building in your city.</b></p>
    <div class="pills"><span class="pill on"></span><span class="pill on"></span><span class="pill on"></span><span class="pill"></span><span class="pill"></span></div>
  </div>
  <div class="city">${citySvg(courses)}</div>
  <div class="url">coursesmash.app</div>
</div></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "og-"));
const page = join(dir, "og.html");
writeFileSync(page, html);
const out = join(ROOT, "public/og.png");
execFileSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [`--user-data-dir=${join(dir, "chrome")}`, 
  "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,630",
  "--virtual-time-budget=6000", `--screenshot=${out}`, `file://${page}`,
], { stdio: "inherit" });
console.log(`Wrote ${out}`);
