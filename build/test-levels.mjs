// Checks the generated Levels Program dataset: shape, coverage, that every
// picture reference points at a file that exists, and that the fields the user
// asked for are present.
//
// Run: node build/test-levels.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const chalk = join(here, "..", "chalk");

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(chalk, "data-levels.js"), "utf8"), sandbox, { filename: "data-levels.js" });
const LV = sandbox.window.CHALK_LEVELS;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
};

console.log("\n1. Level coverage");
ok("eight levels present", Object.keys(LV).length === 8, Object.keys(LV).join(", "));
ok("levels are named Level 1..8", Object.keys(LV).every((k) => /^Level [1-8]$/.test(k)));

console.log("\n2. Apparatus map onto Chalk's MAG names");
const CANON = new Set(["Floor", "Pommel Horse", "Rings", "Vault", "Parallel Bars", "Horizontal Bar"]);
let badApp = [];
Object.entries(LV).forEach(([lv, d]) => Object.keys(d.apparatus).forEach((a) => { if (!CANON.has(a)) badApp.push(`${lv}/${a}`); }));
ok("every apparatus is a known MAG name", badApp.length === 0, badApp.join(", "));
ok("Floor present in all 8 levels", Object.values(LV).every((d) => (d.apparatus.Floor || []).length > 0));
ok("Vault present in all 8 levels", Object.values(LV).every((d) => (d.apparatus.Vault || []).length > 0));
ok("Pommel Horse only in Levels 1-5",
  ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"].every((l) => LV[l].apparatus["Pommel Horse"])
  && ["Level 6", "Level 7", "Level 8"].every((l) => !LV[l].apparatus["Pommel Horse"]));

console.log("\n3. Every skill has the required fields");
let noName = 0, noKcp = 0, total = 0;
Object.values(LV).forEach((d) => Object.values(d.apparatus).forEach((skills) => skills.forEach((s) => {
  total++;
  if (!s.name || typeof s.name !== "string") noName++;
  if (!Array.isArray(s.kcp)) noKcp++;
})));
ok(`all ${total} skills have a name`, noName === 0, `${noName} missing`);
ok("all skills have a kcp array", noKcp === 0, `${noKcp} missing`);
ok("a healthy skill count", total > 250, `${total}`);

console.log("\n4. Optional fields come through where present");
const allSkills = Object.values(LV).flatMap((d) => Object.values(d.apparatus).flat());
ok("some skills carry a skill number", allSkills.some((s) => s.num));
ok("some skills carry a skill value", allSkills.some((s) => s.value));
ok("some skills carry typical deductions", allSkills.some((s) => Array.isArray(s.deductions) && s.deductions.length));

console.log("\n5. Pictures resolve to real files");
const imgDir = join(chalk, "levels-images");
ok("levels-images folder exists", existsSync(imgDir));
const onDisk = new Set(existsSync(imgDir) ? readdirSync(imgDir) : []);
let refs = 0, missing = [];
allSkills.forEach((s) => (s.img || []).forEach((f) => {
  refs++;
  if (!onDisk.has(f)) missing.push(f);
}));
ok(`${refs} picture references, all files present`, missing.length === 0, missing.slice(0, 5).join(", "));
ok("most skills have a picture", allSkills.filter((s) => (s.img || []).length).length > total * 0.8,
  `${allSkills.filter((s) => (s.img || []).length).length}/${total}`);

console.log("\n6. Known skills read correctly");
const l1floor = LV["Level 1"].apparatus.Floor[0];
ok("Level 1 Floor skill 1 name", /Forward Roll/i.test(l1floor.name), l1floor.name);
ok("its KCP is readable prose, not wrap fragments", l1floor.kcp[0].length > 20 && /\.$/.test(l1floor.kcp[0]), l1floor.kcp[0]);
const l1vault = LV["Level 1"].apparatus.Vault[0];
ok("Level 1 Vault skill survived header/skill disambiguation", /Jump|box/i.test(l1vault.name), l1vault.name);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
