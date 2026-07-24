# Gym Suite — GymOrgPro + Chalk (v6.0)

Two browser apps for running a gymnastics club, in one repository:

| | What it's for |
|---|---|
| **GymOrgPro** (`gymorgpro/`) | The schedule. Squads, blocks, rotation grids, coaches, session times, lesson-plan banners. |
| **Chalk** (`chalk/`) | The lesson. Turns one scheduled session into a plan by ticking skills into each rotation. |

They read the same Firebase project, so the schedule is entered once. Chalk's
connection to it is **read-only** — GymOrgPro stays the single source of truth.

---

## Repository layout

```
/
├── index.html            launcher — links to both apps
├── README.md             this file
│
├── gymorgpro/
│   └── index.html        the whole app: one self-contained file, no build
│
├── chalk/
│   ├── index.html        page shell — loads the scripts below in order
│   ├── app.jsx           the app, readable JSX          ← edit this
│   ├── app.js            prebundled React + app         ← generated, don't edit
│   ├── data.js           skills, warm-ups, ALP matrix   ← generated from club docs
│   ├── data-warmdown.js  warm-down activities           ← hand-maintained
│   ├── chalk-library.js  editable skills library (v6)
│   ├── gymorg-bridge.js  turns a GymOrgPro roster into rotations
│   ├── chalk-gymorg-live.js  read-only live link to GymOrgPro's Firebase
│   ├── chalk-docx.js     builds the Word lesson plans
│   ├── images-b64.js     diagrams as data, for the Word export
│   ├── images/           382 skill diagrams
│   └── CHANGELOG-v5.txt  the v1–v5.10 history
│
└── build/
    ├── build.mjs         rebuilds chalk/app.js from chalk/app.jsx
    ├── test-library.mjs  headless tests for the skills library
    └── package.json
```

---

## Running it

**No install.** Open `index.html` and pick an app, or open `gymorgpro/index.html`
or `chalk/index.html` directly. Both work from a double-clicked file, a shared
drive, or any web host.

**Hosting.** Push the repo and turn on GitHub Pages (or any static host). Because
the apps now live side by side, GymOrgPro links to Chalk with the **relative**
path `../chalk/` — it keeps working wherever you host it, with nothing to
reconfigure. That's the one thing that had to change to merge the repos: v5
hardcoded an absolute URL.

**Internet.** Needed for the shared schedule, the live library sync, and the CDN
fonts/Tailwind. The Word export and the skill database work offline.

---

## What's new in v6

### 1. Both apps in one repository

Previously two separate deployments that had to be kept in step by hand. Now one
repo, one version number, one push. The `CHALK_URL` constant in
`gymorgpro/index.html` is a relative path; set it back to an absolute URL only if
you deploy Chalk somewhere else entirely.

### 2. Warm-down activities

The skill selector had a Warm-up tab but no warm-down, even though the lesson
plan and the Word export both had a warm-down block to fill. There's now a
**Warm-down** tab beside Warm-up, and clicking the warm-down block on the plan
jumps the selector to it, exactly like every rotation.

The content lives in `chalk/data-warmdown.js` — eight groups, sequenced in the
order a warm-down should actually run:

> Pulse lowering · Joint unloading & mobility · Static stretching (lower body) ·
> Static stretching (upper body) · Spine & back release · Soft tissue & recovery ·
> Breathing & settle · Review & finish

It's a separate file from `data.js` on purpose: `data.js` is generated from the
club's source documents, so anything written into it is lost the next time it's
regenerated. This one is hand-maintained and safe to edit.

### 3. Editing skills, adding skills, and mapping them to apparatus

New **Edit skills** button next to the apparatus tabs. It opens a library editor
with four tabs:

- **Browse & edit** — rename a skill, rewrite its coaching points, move it to a
  different group, or hide it. Every change can be reset back to the original.
- **Add a skill** — put in something that isn't in the club documents at all.
  Added skills behave like any other: they tick into a rotation, carry through
  "Copy previous", and print as KCP rows in the Word plan.
- **Hidden** — skills that ship with Chalk are hidden rather than deleted, and
  this is where they can be brought back.
- **Sharing & backup** — turn on team sync, or export/import the library as a
  file.

**Mapping to apparatus** answers the request directly. Each skill has a row of
apparatus chips; tick more than one and the skill appears under each of them when
you're writing a plan. It stays *one* skill — ticking it on Beam and on Floor is
the same tick, and mapped-in skills are badged with the apparatus they came from
so nobody wonders why a Floor drill is in the Beam list. Warm-up and warm-down
count as apparatus here too, so a conditioning drill can be pulled into the
warm-up, or a stretch can be made available on every apparatus at once.

---

## Why the skills database did *not* move into Firebase

This came up as "this may require migration of the skills database into
Firebase?" — the answer is that the **edits** need to, and the database doesn't.

Uploading all of `data.js` would mean:

- every page load waits on the network before showing a single skill;
- Chalk stops working on a plane, in a gym with bad wifi, or from a
  double-clicked `index.html`;
- regenerating `data.js` from the club's source documents would clobber
  everything anyone had typed.

So `data.js` and `data-warmdown.js` stay the read-only **baseline**, and
`chalk-library.js` keeps a small **overlay** — just the differences — in
localStorage and, optionally, Firebase. Resolution is baseline + overlay,
computed in the browser.

```
data.js  +  data-warmdown.js        the shipped database, read-only
                 +
   overlay { edits, additions, mappings }    localStorage ⇄ Firebase
                 =
      what the selector actually shows
```

For a busy club the overlay is a few tens of kB rather than 780 kB, it syncs
instantly, and if Firebase is unreachable the app runs on the last local copy.

**Stable IDs.** An edit is keyed on level + apparatus + group + skill name, not
on array position, so reordering or regenerating `data.js` doesn't detach
anyone's work. If a skill is *renamed* upstream its edit is orphaned — harmless,
and it shows up in the library so it can be cleaned up.

**Sync model.** Whole-document last-write-wins on a revision counter, stored as
one JSON string at `/chalkLibrary/{libraryId}`. It isn't operational transform
and doesn't need to be: two coaches editing the same skill in the same minute is
vanishingly rare, and everything else merges because it's one document written
atomically. It's stored as a *string* because skill names are full of `.`, `/`,
`#` and `$`, none of which are legal in Firebase paths.

**Sharing is off by default.** Until someone turns it on, edits stay in that
browser. Turn it on and set your name, and every coach opens the same library
with changes attributed.

### Firebase rules

Sharing writes to a new path. If the database is still in test mode it already
works; if you lock it down, keep:

```json
{
  "rules": {
    "rosters":      { ".read": true },
    "rosterIndex":  { ".read": true },
    "chalkLibrary": { ".read": true, ".write": true }
  }
}
```

`chalkLibrary` needs **write** — unlike the rotation data, which Chalk only ever
reads. Anonymous auth on both apps is the sensible next step if the club wants
edits restricted to coaches.

---

## Editing Chalk

`chalk/app.jsx` is the readable source; `chalk/app.js` is the prebundled output
the browser loads. After changing the JSX:

```bash
cd build
npm install     # first time only
npm run build   # regenerates chalk/app.js
```

React is bundled in rather than loaded from a CDN so Chalk still runs from a
double-clicked file, where module imports aren't allowed.

Everything else — `data.js`, `data-warmdown.js`, `chalk-library.js`, the bridges,
the docx writer — is a plain script loaded directly by `index.html`. Edit and
reload, no build step.

`gymorgpro/index.html` has no build step at all.

### Tests

```bash
cd build && node test-library.mjs
```

45 assertions covering the library against the real `data.js`: that an untouched
level resolves byte-identically to v5, that edit/reset/hide/unhide round-trip,
that added skills get stable selection keys, that a mapped skill keeps one
identity across apparatus, that skill names containing `: ~ / # $ [ ]` survive
the ID encoding, and that all 23 levels resolve without error.

---

## Known gaps

- **Added skills can't have a diagram yet.** Diagrams come from `chalk/images/`
  and are inlined into `images-b64.js` for the Word export, so a new one has to
  be dropped into the folder and referenced. Doing it from the UI needs image
  upload to Firebase Storage.
- **The library editor doesn't cover the ALP pathway matrix** (`CHALK_ALP` in
  `data.js`). That's a scoring matrix rather than a skill list, and it needs its
  own editor.
- **No edit history.** The overlay keeps only the current state plus who last
  changed it. Restoring something from three weeks ago means keeping exports.
