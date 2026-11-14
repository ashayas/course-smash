// Proves the Worker build never picks up the iOS app in ios/.
//   npm run check:isolation
// It bundles the Worker with a dry-run deploy and fails if any bundled file, static asset or build setting
// reaches into ios/. Nothing is uploaded.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const ROOT = realpathSync(new URL("../", import.meta.url).pathname);
const IOS = join(ROOT, "ios") + sep;
const problems = [];

// wrangler.jsonc allows comments, so drop them before parsing.
const config = JSON.parse(readFileSync(join(ROOT, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
const assets = resolve(ROOT, config.assets?.directory ?? "public");
const inIos = (path) => (resolve(ROOT, path) + sep).startsWith(IOS);

if (inIos(config.main)) problems.push(`wrangler.jsonc: main points into ios/ (${config.main})`);
if (IOS.startsWith(assets + sep) || inIos(assets)) problems.push(`wrangler.jsonc: the assets directory (${assets}) contains or sits inside ios/`);
if (config.build?.command || config.build?.watch_dir) {
  const watched = [config.build.watch_dir ?? "."].flat();
  if (watched.some((dir) => IOS.startsWith(resolve(ROOT, dir) + sep))) problems.push("wrangler.jsonc: build.watch_dir covers ios/, so editing the app would rebuild the Worker");
}

// Static assets: every file under the assets directory must really live there, not be a link into ios/.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
for (const file of walk(assets)) {
  if ((realpathSync(file) + sep).startsWith(IOS)) problems.push(`asset ${file} links into ios/`);
}

// The bundle: esbuild's metafile lists every file that went in.
const out = mkdtempSync(join(tmpdir(), "cs-isolation-"));
execFileSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", out, "--metafile", join(out, "meta.json")], { cwd: ROOT, stdio: "pipe" });
const inputs = Object.keys(JSON.parse(readFileSync(join(out, "meta.json"), "utf8")).inputs);
for (const input of inputs) if (inIos(input)) problems.push(`the Worker bundle includes ${input}`);

for (const name of ["tsconfig.json", "tsconfig.node.json"]) {
  const tsconfig = JSON.parse(readFileSync(join(ROOT, name), "utf8"));
  if (!(tsconfig.exclude ?? []).includes("ios")) problems.push(`${name}: add "ios" to "exclude"`);
}
if (existsSync(join(ROOT, ".dockerignore")) && !readFileSync(join(ROOT, ".dockerignore"), "utf8").split("\n").includes("ios")) {
  problems.push(".dockerignore: add ios, so the self-hosted image doesn't carry the app's sources");
}

if (problems.length) {
  console.error("The Worker build is not isolated from ios/:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`OK: ${inputs.filter((i) => !i.includes("node_modules")).length} Worker source files bundled and ${walk(assets).length} static assets, none from ios/.`);
