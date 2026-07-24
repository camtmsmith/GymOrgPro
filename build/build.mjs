// ---------------------------------------------------------------------------
// Chalk bundle build
//
// Chalk ships as a folder you can double-click — no server, no build step at
// RUN time. But React itself has to come from somewhere, and a file:// page
// can't fetch modules, so React + ReactDOM + the app are prebundled here into
// one plain <script> file: chalk/app.js.
//
//   cd build && npm install && npm run build
//
// Edit chalk/app.jsx (readable JSX), then re-run this. Nothing else in the
// repo needs a build — data.js, the bridges and the docx writer are plain
// scripts loaded directly by index.html.
//
// app.jsx is written against GLOBAL React/ReactDOM (no imports of its own), so
// the entry point below prepends a tiny shim that pulls React in as a module
// and republishes it on window before the app code runs. Concatenation (rather
// than an import) is deliberate: ES imports hoist, which would run app.jsx
// before the globals were assigned.
// ---------------------------------------------------------------------------
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appJsx = join(here, "..", "chalk", "app.jsx");
const outFile = join(here, "..", "chalk", "app.js");

const shim = `
import * as ReactNS from "react";
import { createRoot } from "react-dom/client";
const React = ReactNS;
const ReactDOM = { createRoot };
window.React = React;
window.ReactDOM = ReactDOM;
`;

// Written next to node_modules so "react" resolves normally; removed after.
const tmp = join(here, ".entry.generated.jsx");
writeFileSync(tmp, shim + "\n" + readFileSync(appJsx, "utf8"));

await esbuild.build({
  entryPoints: [tmp],
  bundle: true,
  minify: true,
  legalComments: "eof",
  format: "iife",
  target: ["es2019"],
  jsx: "transform",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: outFile,
  absWorkingDir: here,
});

rmSync(tmp, { force: true });

const kb = (statSync(outFile).size / 1024).toFixed(0);
console.log(`built chalk/app.js  (${kb} kB)`);
