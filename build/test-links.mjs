// Checks every internal link resolves to an actual FILE on disk.
//
// This exists because of a real bug: the launcher linked to "gymorgpro/", which
// a web server happily resolves to gymorgpro/index.html but a double-clicked
// file:// page does not — the browser shows a directory listing instead. Both
// apps are meant to run from a plain folder, so a link ending at a directory is
// always wrong here, however well it behaves on GitHub Pages.
//
// Run: node build/test-links.mjs
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
};

// A path is only usable over file:// if it points at a file, not a folder.
function checkTarget(label, fromDir, target) {
  const clean = target.split("?")[0].split("#")[0];
  const abs = resolve(fromDir, clean);
  if (!existsSync(abs)) return ok(label, false, `${clean} does not exist`);
  if (statSync(abs).isDirectory()) return ok(label, false, `${clean} is a directory — file:// will list it instead of opening it`);
  ok(label, true);
}

console.log("\n1. Launcher links");
const launcher = readFileSync(join(root, "index.html"), "utf8");
const hrefs = [...launcher.matchAll(/href="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((h) => !/^https?:|^#|^mailto:/.test(h));
ok("launcher has internal links", hrefs.length >= 2, `${hrefs.length}`);
hrefs.forEach((h) => checkTarget(`launcher → ${h}`, root, h));

console.log("\n2. GymOrgPro's link across to Chalk");
const gop = readFileSync(join(root, "gymorgpro", "index.html"), "utf8");
const m = gop.match(/const CHALK_URL = '([^']+)'/);
ok("CHALK_URL is set", !!m, "not found");
if (m) {
  const url = m[1];
  ok("CHALK_URL is relative (survives being re-hosted)", !/^https?:/.test(url), url);
  checkTarget(`GymOrgPro → ${url}`, join(root, "gymorgpro"), url);
  // The deep link appends ?roster=…&block=… — make sure that still forms a
  // sane URL rather than doubling up separators.
  const built = url + (url.indexOf("?") >= 0 ? "&" : "?") + "roster=r1&date=2026-08-04";
  ok("deep link builds cleanly", built === "../chalk/index.html?roster=r1&date=2026-08-04", built);
}

console.log("\n3. Chalk's own script tags");
const chalkHtml = readFileSync(join(root, "chalk", "index.html"), "utf8");
const srcs = [...chalkHtml.matchAll(/src="([^"]+)"/g)]
  .map((x) => x[1])
  .filter((s) => !/^https?:/.test(s));
ok("chalk loads local scripts", srcs.length >= 7, `${srcs.length}`);
srcs.forEach((s) => checkTarget(`chalk → ${s}`, join(root, "chalk"), s));

// Load order matters: the library reads the data files at startup.
const order = srcs.map((s) => s.replace(/^\.\//, ""));
const idx = (f) => order.indexOf(f);
console.log("\n4. Script load order");
ok("data.js before chalk-library.js", idx("data.js") >= 0 && idx("data.js") < idx("chalk-library.js"));
ok("data-warmdown.js before chalk-library.js", idx("data-warmdown.js") >= 0 && idx("data-warmdown.js") < idx("chalk-library.js"));
ok("chalk-library.js before app.js", idx("chalk-library.js") < idx("app.js"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
