// Headless check of chalk-library.js against the real data.js.
// Run: node build/test-library.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const chalk = join(here, "..", "chalk");

const store = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  document: { querySelector: () => null, head: { appendChild() {} }, createElement: () => ({}) },
  Promise,
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

for (const f of ["data.js", "data-warmdown.js", "chalk-library.js"]) {
  vm.runInContext(readFileSync(join(chalk, f), "utf8"), sandbox, { filename: f });
}

const LIB = sandbox.ChalkLib;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
};

const LEVEL = "MAG Matrix - Level 7";
console.log("\n1. Baseline resolution is unchanged");
const floor = LIB.sections(LEVEL, "Floor");
const rawFloor = sandbox.CHALK_DATA[LEVEL].apparatus.Floor;
ok("group count matches data.js", floor.length === rawFloor.length, `${floor.length} vs ${rawFloor.length}`);
ok("first group name matches", floor[0].group === rawFloor[0].group);
ok("first skill name matches", floor[0].skills[0].name === rawFloor[0].skills[0].name);
ok("baseline indices preserved", floor[0].skills[0]._gi === 0 && floor[0].skills[0]._si === 0);

console.log("\n2. Warm-up and warm-down are tabs");
const tabs = LIB.tabsFor(LEVEL);
ok("Warm-up present", tabs.includes("Warm-up"));
ok("Warm-down present", tabs.includes("Warm-down"));
ok("Warm-down has groups", LIB.sections(LEVEL, "Warm-down").length > 0);
ok("Warm-down groups have skills", LIB.sections(LEVEL, "Warm-down")[0].skills.length > 0);
ok("apparatus still listed", tabs.includes("Floor") && tabs.includes("Rings"));

console.log("\n3. Editing a skill");
const target = floor[0].skills[0];
LIB.edit(target._sid, { name: "RENAMED SKILL", cues: ["one", "two"] });
const afterEdit = LIB.sections(LEVEL, "Floor")[0].skills[0];
ok("name changed", afterEdit.name === "RENAMED SKILL", afterEdit.name);
ok("cues changed", afterEdit.cues.join("|") === "one|two");
ok("marked as edited", afterEdit._edited === true);
ok("stats count the edit", LIB.stats().edited === 1);
LIB.reset(target._sid);
ok("reset restores baseline name", LIB.sections(LEVEL, "Floor")[0].skills[0].name === rawFloor[0].skills[0].name);
ok("reset clears the edit flag", !LIB.sections(LEVEL, "Floor")[0].skills[0]._edited);

console.log("\n4. Hiding and unhiding");
LIB.hide(target._sid, true);
ok("skill gone from selector", !LIB.sections(LEVEL, "Floor")[0].skills.some((s) => s._sid === target._sid));
ok("appears in hidden list", LIB.hiddenList().some((h) => h.sid === target._sid));
ok("hidden list decodes the name", LIB.hiddenList()[0].name === rawFloor[0].skills[0].name, LIB.hiddenList()[0].name);
LIB.unhide(target._sid);
ok("comes back after unhide", LIB.sections(LEVEL, "Floor")[0].skills.some((s) => s._sid === target._sid));
ok("no leftover edit entry", LIB.stats().edited === 0 && LIB.stats().hidden === 0);

console.log("\n5. Adding a skill");
const sid = LIB.addSkill({
  level: LEVEL, apparatus: "Rings", group: "My drills",
  name: "Test drill", cues: ["cue a"], apps: ["Rings"],
});
ok("returns a sid", !!sid);
const rings = LIB.sections(LEVEL, "Rings");
const myGroup = rings.find((g) => g.group === "My drills");
ok("new group appears", !!myGroup);
ok("skill is in it", myGroup && myGroup.skills[0].name === "Test drill");
ok("has a stable selection key", myGroup && typeof myGroup.skills[0]._ck === "string");
ok("flagged custom", myGroup && myGroup.skills[0]._custom === true);
ok("stats count the addition", LIB.stats().added === 1);

console.log("\n6. Mapping onto several apparatus");
LIB.mapTo(sid, ["Rings", "Parallel Bars", "Floor"]);
const onPbars = LIB.sections(LEVEL, "Parallel Bars").find((g) => g.group === "My drills");
const onFloor = LIB.sections(LEVEL, "Floor").find((g) => g.group === "My drills");
ok("shows on Parallel Bars", !!onPbars && onPbars.skills[0].name === "Test drill");
ok("shows on Floor", !!onFloor);
ok("tagged with its home apparatus", onPbars && onPbars.skills[0]._via === "Rings");
ok("same selection key everywhere",
  onPbars.skills[0]._ck === onFloor.skills[0]._ck && onPbars.skills[0]._ck === LIB.sections(LEVEL, "Rings").find((g) => g.group === "My drills").skills[0]._ck);
ok("stats count the mapping", LIB.stats().mapped === 1);

console.log("\n7. Mapping a baseline skill across apparatus");
const beamish = LIB.sections(LEVEL, "Rings")[0].skills[0];
LIB.mapTo(beamish._sid, ["Rings", "Vault"]);
const vaultHit = LIB.sections(LEVEL, "Vault").some((g) => g.skills.some((s) => s._sid === beamish._sid));
ok("baseline skill reaches Vault", vaultHit);
ok("still on its home apparatus", LIB.sections(LEVEL, "Rings").some((g) => g.skills.some((s) => s._sid === beamish._sid)));
ok("home key unchanged by mapping",
  LIB.sections(LEVEL, "Vault").flatMap((g) => g.skills).find((s) => s._sid === beamish._sid)._kt === "Rings");

console.log("\n8. Warm-down skill mapped onto an apparatus");
const wd = LIB.sections(LEVEL, "Warm-down")[0].skills[0];
LIB.mapTo(wd._sid, ["Warm-down", "Floor"]);
ok("appears on Floor", LIB.sections(LEVEL, "Floor").some((g) => g.skills.some((s) => s._sid === wd._sid)));
ok("appears on Floor at another level too",
  LIB.sections("WAG Level 1", "Floor").some((g) => g.skills.some((s) => s._sid === wd._sid)));
ok("still in the warm-down list", LIB.sections(LEVEL, "Warm-down")[0].skills.some((s) => s._sid === wd._sid));

console.log("\n9. Skills with awkward characters in the name");
const tricky = LIB.addSkill({
  level: LEVEL, apparatus: "Floor", group: "Odd: names",
  name: "L-sit press: rings ~ pit / hard #2 $x [a].", cues: [],
});
ok("sid decodes back to the original name",
  LIB.parts(tricky).name === "L-sit press: rings ~ pit / hard #2 $x [a].", LIB.parts(tricky).name);
const found = LIB.sections(LEVEL, "Floor").find((g) => g.group === "Odd: names");
ok("resolves back out intact", !!found && found.skills[0].name === "L-sit press: rings ~ pit / hard #2 $x [a].");

console.log("\n10. Export / import round trip");
const dump = LIB.exportJSON();
ok("export is valid JSON", (() => { try { JSON.parse(dump); return true; } catch (e) { return false; } })());
const before = LIB.stats();
LIB.clearAll();
ok("clear empties it", LIB.stats().added === 0 && LIB.stats().edited === 0);
ok("baseline survives a clear", LIB.sections(LEVEL, "Floor")[0].skills[0].name === rawFloor[0].skills[0].name);
LIB.importJSON(dump, "replace");
ok("import restores additions", LIB.stats().added === before.added);
ok("import restores mappings", LIB.stats().mapped === before.mapped);

console.log("\n11. Every level still resolves");
let broken = [];
Object.keys(sandbox.CHALK_DATA).forEach((lv) => {
  LIB.tabsFor(lv).forEach((t) => {
    try {
      const secs = LIB.sections(lv, t);
      if (!Array.isArray(secs)) broken.push(`${lv}/${t}`);
    } catch (e) { broken.push(`${lv}/${t}: ${e.message}`); }
  });
});
ok(`all ${Object.keys(sandbox.CHALK_DATA).length} levels × their tabs resolve`, broken.length === 0, broken.slice(0, 3).join(", "));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
