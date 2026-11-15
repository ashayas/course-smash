// Puts every marketing picture and line of listing copy on one page, to look over before a release.
//
//   node scripts/marketing/gallery.mjs data/marketing-gallery.html
//
// The page links to the files where they are in this checkout, so open it from this machine.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SHOTS } from "./shots.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const out = resolve(process.argv[2] ?? join(ROOT, "data/marketing-gallery.html"));
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const read = (path) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8").trim() : "(missing)");
const files = (dir, test = () => true) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".png") && test(f)).sort().map((f) => join(dir, f)) : []);
const picture = (path, caption) => `<figure><a href="file://${join(ROOT, path)}"><img src="file://${join(ROOT, path)}" loading="lazy" alt=""></a><figcaption>${escape(caption ?? path.split("/").pop())}</figcaption></figure>`;
const row = (kind, paths, note) => `<div class="row ${kind}">${paths.length ? paths.map((p) => picture(p)).join("") : `<p class="muted">Not made yet. ${note ?? ""}</p>`}</div>`;
const copy = (label, path, limit) => {
  const text = read(path);
  return `<div class="copy"><h3>${label} <span class="muted">${text.length}${limit ? ` of ${limit}` : ""} characters · ${path}</span></h3><pre>${escape(text)}</pre></div>`;
};

const ios = "ios/fastlane/screenshots/en-US";
const play = "android/fastlane/metadata/android/en-US";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Course Smash marketing gallery</title>
<style>
  @font-face { font-family: "Inter Tight"; font-weight: 400; src: url("file://${join(ROOT, "ios/CourseSmash/Resources/Fonts/InterTight-Regular.ttf")}"); }
  @font-face { font-family: "Inter Tight"; font-weight: 600; src: url("file://${join(ROOT, "ios/CourseSmash/Resources/Fonts/InterTight-SemiBold.ttf")}"); }
  @font-face { font-family: "Inter Tight"; font-weight: 800; src: url("file://${join(ROOT, "ios/CourseSmash/Resources/Fonts/InterTight-ExtraBold.ttf")}"); }
  body { margin: 0; padding: 48px 40px 120px; background: #141414; color: #fbfbfb; font: 400 17px/1.4 "Inter Tight", sans-serif; letter-spacing: -.01em; }
  h1 { font-size: 64px; font-weight: 800; letter-spacing: -.055em; line-height: 1; margin: 0 0 12px; }
  h2 { font-size: 40px; font-weight: 600; letter-spacing: -.04em; margin: 88px 0 8px; }
  h3 { font-size: 19px; font-weight: 600; margin: 0 0 8px; }
  p { margin: 0 0 12px; max-width: 80ch; }
  .muted { color: #a3a3a0; font-weight: 400; }
  .row { display: flex; gap: 16px; overflow-x: auto; padding: 12px 0 16px; align-items: flex-start; }
  figure { margin: 0; flex: none; }
  figure img { display: block; border-radius: 20px; background: #1f1f1d; }
  figcaption { margin-top: 8px; font-size: 14px; color: #a3a3a0; }
  .phone img { height: 620px; width: auto; }
  .wide img { height: 300px; width: auto; }
  .small img { height: 200px; width: auto; }
  .copy { background: #1f1f1d; border-radius: 28px; padding: 22px 26px; margin: 12px 0; max-width: 1100px; }
  pre { margin: 0; font: inherit; white-space: pre-wrap; }
  table { border-collapse: separate; border-spacing: 0 4px; margin-top: 8px; }
  td { background: #1f1f1d; padding: 10px 16px; } td:first-child { border-radius: 14px 0 0 14px; font-weight: 600; } td:last-child { border-radius: 0 14px 14px 0; color: #a3a3a0; }
</style></head><body>
<h1>Marketing gallery</h1>
<p class="muted">Everything a store listing or a launch post would use, in the current brand. Every phone picture is a real screen from a walkthrough run on demo data, and the art is drawn by public/city.js. Click a picture to open it at full size.</p>

<h2>The eight headlines</h2>
<table>${SHOTS.map((s, i) => `<tr><td>${i + 1}. ${escape(s.headline)}</td><td>${escape(s.line)}</td></tr>`).join("")}</table>

<h2>App Store, iPhone 6.9-inch <span class="muted">1320 × 2868</span></h2>
${row("phone", files(ios, (f) => f.startsWith("iphone69-")), "Needs an iOS walkthrough run on demo data.")}
<h2>App Store, iPhone 6.5-inch <span class="muted">1284 × 2778</span></h2>
${row("phone", files(ios, (f) => f.startsWith("iphone65-")), "Needs an iOS walkthrough run on demo data.")}
<p class="muted">No iPad set: the app is iPhone-only.</p>

<h2>Google Play, phone <span class="muted">1080 × 1920</span></h2>
${row("phone", files(`${play}/images/phoneScreenshots`), "Needs an Android walkthrough run on demo data.")}
<p class="muted">No tablet sets: the app declares no tablet support.</p>

<h2>Google Play feature graphic <span class="muted">1024 × 500</span>, and the store icons</h2>
${row("wide", [`${play}/images/featureGraphic.png`, `${play}/images/icon.png`, "ios/CourseSmash/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png"].filter((p) => existsSync(join(ROOT, p))))}

<h2>Link preview <span class="muted">1200 × 630, on every public page</span></h2>
${row("wide", ["public/og.png"])}

<h2>Press kit <span class="muted">public/press-kit, offered at /press</span></h2>
${row("small", files("public/press-kit", (f) => !/-(today|recall|city|library)\.png$/.test(f)))}
${row("phone", files("public/press-kit", (f) => /-(today|recall|city|library)\.png$/.test(f)), "Made with the iOS set.")}

<h2>App Store listing copy</h2>
${copy("Name", `ios/fastlane/metadata/en-US/name.txt`, 30)}
${copy("Subtitle", `ios/fastlane/metadata/en-US/subtitle.txt`, 30)}
${copy("Promotional text", `ios/fastlane/metadata/en-US/promotional_text.txt`, 170)}
${copy("Keywords", `ios/fastlane/metadata/en-US/keywords.txt`, 100)}
${copy("What's new", `ios/fastlane/metadata/en-US/release_notes.txt`, 4000)}
${copy("Description", `ios/fastlane/metadata/en-US/description.txt`, 4000)}

<h2>Google Play listing copy</h2>
${copy("Title", `${play}/title.txt`, 30)}
${copy("Short description", `${play}/short_description.txt`, 80)}
${copy("What's new", `${play}/changelogs/4.txt`, 500)}
${copy("Full description", `${play}/full_description.txt`, 4000)}
</body></html>`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out);
