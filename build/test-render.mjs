// Mounts the real chalk/app.js bundle in jsdom against the real data files and
// checks the things v6 changed actually render. Catches reference errors and
// bad hook usage that a successful esbuild pass would not.
//
// Run: node build/test-render.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const chalk = join(here, "..", "chalk");

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "https://example.test/chalk/",
  pretendToBeVisual: true,
  runScripts: "dangerously",
});
const { window } = dom;

// Tailwind is a CDN stylesheet in the real page; nothing here depends on it.
// Stub only what the app calls and jsdom doesn't implement.
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.scrollTo = () => {};
if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = () => {};

const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
const realError = window.console.error;
window.console.error = (...a) => { errors.push(a.map(String).join(" ")); realError(...a); };

function run(file) {
  const code = readFileSync(join(chalk, file), "utf8");
  const s = window.document.createElement("script");
  s.textContent = code;
  window.document.head.appendChild(s);
}

// Same order as chalk/index.html.
for (const f of ["data.js", "data-warmdown.js", "chalk-library.js", "gymorg-bridge.js", "chalk-docx.js", "app.js"]) {
  try { run(f); }
  catch (e) { console.log(`  FAIL loading ${f}: ${e.message}`); process.exit(1); }
}

await new Promise((r) => setTimeout(r, 400));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
};
const root = window.document.getElementById("root");
const text = () => root.textContent || "";
const buttons = () => Array.from(root.querySelectorAll("button"));
const byText = (t) => buttons().find((b) => (b.textContent || "").trim().startsWith(t));
const click = (el) => {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return new Promise((r) => setTimeout(r, 120));
};

console.log("\n1. The app mounts");
ok("root has content", root.innerHTML.length > 500, `${root.innerHTML.length} chars`);
ok("no console errors during mount", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log("\n2. Warm-down is a tab");
ok("Warm-up tab rendered", !!byText("Warm-up"));
ok("Warm-down tab rendered", !!byText("Warm-down"));
ok("apparatus tabs rendered", !!byText("Floor"));
ok("Edit skills button rendered", !!byText("Edit skills"));

console.log("\n3. Warm-down tab shows the activities");
await click(byText("Warm-down"));
ok("pulse lowering group shown", text().includes("Pulse lowering"), "");
ok("a warm-down skill shown", text().includes("Easy jog to walk"));
ok("review group shown", text().includes("Review & finish") || text().includes("Review &amp; finish"));
ok("still no errors", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log("\n4. Ticking a warm-down skill lands in the plan");
const before = (window.localStorage.getItem("x"), text());
const checkboxes = Array.from(root.querySelectorAll('button[aria-pressed]'));
ok("skills have checkboxes", checkboxes.length > 0, `${checkboxes.length}`);
await click(checkboxes[0]);
const pressed = Array.from(root.querySelectorAll('button[aria-pressed="true"]'));
ok("the skill reads as selected", pressed.length === 1, `${pressed.length}`);
ok("no errors after ticking", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log("\n5. The skills library opens");
await click(byText("Edit skills"));
ok("library heading shown", text().includes("Skills library"));
ok("browse tab shown", text().includes("Browse & edit") || text().includes("Browse &amp; edit"));
ok("add tab shown", text().includes("Add a skill"));
ok("sharing tab shown", text().includes("Sharing & backup") || text().includes("Sharing &amp; backup"));
ok("no errors opening it", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log("\n6. Library tabs render");
for (const t of ["Add a skill", "Sharing & backup"]) {
  const b = buttons().find((x) => (x.textContent || "").trim() === t);
  if (b) await click(b);
  ok(`"${t}" renders without error`, errors.length === 0, errors.slice(0, 1).join(" | "));
}
const hiddenBtn = buttons().find((x) => (x.textContent || "").trim().startsWith("Hidden"));
ok("Hidden tab present", !!hiddenBtn);
if (hiddenBtn) {
  await click(hiddenBtn);
  ok("empty hidden list explains itself", text().includes("Nothing is hidden"));
}

console.log("\n7. Adding a skill through the UI");
const addBtn = buttons().find((x) => (x.textContent || "").trim() === "Add a skill");
await click(addBtn);
const inputs = Array.from(root.querySelectorAll("input, textarea"));
const nameInput = inputs.find((i) => (i.placeholder || "").includes("Straddle press"));
ok("name field present", !!nameInput);
if (nameInput) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(nameInput, "JSDOM test skill");
  nameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  const submit = buttons().find((x) => (x.textContent || "").trim() === "Add skill");
  ok("Add skill button present", !!submit);
  if (submit) {
    await click(submit);
    ok("library records the addition", window.ChalkLib.stats().added === 1, JSON.stringify(window.ChalkLib.stats()));
    ok("confirmation shown", text().includes("JSDOM test skill"));
  }
}
ok("no errors adding", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
