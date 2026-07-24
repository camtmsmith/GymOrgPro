// ============================================================================
// CHALK — Gymnastics Session Builder (V4)
// Adds a GymOrgPro import/rotation panel on top of every V3 feature:
// warm-up + apparatus skill picking, ALP pathway view, session-plan sidebar,
// print/PDF, copy-as-text, and the mobile drawer.
// Written as plain JSX, transpiled in-browser by Babel standalone — no build
// step, so it stays a "keep the folder together, double-click index.html" app.
// ============================================================================
const { useState, useEffect, useMemo, useRef } = React;

const CHALK_DATA = window.CHALK_DATA;
const CHALK_ALP = window.CHALK_ALP || { cols: [], apparatus: {} };
const GB = window.GymOrgBridge;
const LIVE = window.ChalkLive; // read-only live connector to GymOrgPro's Firebase (optional; absent = file-only)
// New in v6: the editable skills library (baseline data.js + a synced overlay of
// edits, additions and apparatus mappings). Everything the selector shows now
// comes through here rather than reading CHALK_DATA directly.
const LIB = window.ChalkLib;
const imgSrc = (f) => "images/" + f;
const APP_VERSION = "v6.0";
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtShortDate = (iso) => { const p = String(iso || "").split("-"); return p.length === 3 ? `${+p[2]} ${MONTHS3[+p[1] - 1]}` : iso; };

// ---------------------------------------------------------------------------
// DEEP LINK from GymOrgPro — "open THIS lesson in Chalk".
//
// GymOrgPro's calendar links straight to Chalk with the lesson identified in the
// query string:
//
//   https://camtmsmith.github.io/AshDream/?roster=ROSTERID&block=BLOCKID
//        &squad=SQUADID&session=SESSIONID&date=YYYY-MM-DD
//
// Those are exactly the four things Chalk needs to land on one specific lesson:
// which gym (roster) to read live, which schedule block, which squad, and which
// dated session. Everything else (rotation, coach, warm-up, header) Chalk still
// derives from the live roster itself, so a link never carries stale schedule
// data — only a pointer.
//
// Query string is used (not the hash) because GitHub Pages serves the app at a
// fixed path and the hash is free for future in-app routing. Params are read
// from BOTH ?query and #hash so a link still works if a host rewrites one.
// ---------------------------------------------------------------------------
function readDeepLink() {
  try {
    const search = new URLSearchParams(window.location.search || "");
    const h = window.location.hash || "";
    const hq = h.indexOf("?") >= 0 ? new URLSearchParams(h.slice(h.indexOf("?"))) : null;
    const get = (k) => (search.get(k) || (hq && hq.get(k)) || "").trim();
    const rosterId = get("roster");
    if (!rosterId) return null;
    return {
      rosterId,
      blockId: get("block"),
      squadId: get("squad"),
      sessionId: get("session"),
      date: get("date"),
      gymName: get("gym"),
    };
  } catch (e) { return null; }
}

const NAVY = "#211a4d";
const INK = "#1b1930";
const APP_COLORS = {
  "Warm-up": "#d97706", "Warm-down": "#64748b", Floor: "#059669", Vault: "#0284c7", Bars: "#7c3aed",
  Beam: "#db2777", "Pommel Horse": "#ea580c", Rings: "#dc2626",
  "Parallel Bars": "#0d9488", "Horizontal Bar": "#2563eb",
};
// Apparatus a coach invents (by mapping a skill onto a new name) has no colour
// in the table above. Rather than fall back to navy for all of them — which
// makes every custom tab look identical — pick a stable colour from the name.
const EXTRA_COLORS = ["#7e22ce", "#b45309", "#0f766e", "#9d174d", "#1d4ed8", "#4d7c0f"];
function colorFor(name) {
  if (APP_COLORS[name]) return APP_COLORS[name];
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return EXTRA_COLORS[h % EXTRA_COLORS.length];
}
const SCORE_STYLE = {
  1: { bg: "#dbeafe", fg: "#1e3a8a", label: "Intro" },
  2: { bg: "#93c5fd", fg: "#0b2f66", label: "Developing" },
  3: { bg: "#3b82f6", fg: "#ffffff", label: "Advanced" },
  4: { bg: "#1d4ed8", fg: "#ffffff", label: "Comp" },
};
const STREAM_LABELS = {
  Foundational: "Foundational (Preschool)", "Pre-Levels": "Pre-Levels",
  WAG: "Women's Artistic", MAG: "Men's Artistic",
};
const ALL_LEVELS = Object.keys(CHALK_DATA);

// ---------------------------------------------------------------- icons ----
function Icon({ path, size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {path}
    </svg>
  );
}
const IconCheck = (p) => <Icon {...p} path={<path d="M20 6 9 17l-5-5" />} />;
const IconChevronLeft = (p) => <Icon {...p} path={<path d="m15 18-6-6 6-6" />} />;
const IconChevronRight = (p) => <Icon {...p} path={<path d="m9 18 6-6-6-6" />} />;
const IconSearch = (p) => <Icon {...p} path={<><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></>} />;
const IconPrinter = (p) => <Icon {...p} path={<><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" /></>} />;
const IconCopy = (p) => <Icon {...p} path={<><rect x="8" y="8" width="14" height="14" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>} />;
const IconTrash = (p) => <Icon {...p} path={<><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>} />;
const IconX = (p) => <Icon {...p} path={<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>} />;
const IconImage = (p) => <Icon {...p} path={<><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>} />;
const IconLayers = (p) => <Icon {...p} path={<><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" /></>} />;
const IconTarget = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>} />;
const IconClipboard = (p) => <Icon {...p} path={<><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></>} />;
const IconDumbbell = (p) => <Icon {...p} path={<><path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" /><path d="m2.5 21.5 1.4-1.4" /><path d="m20.1 3.9 1.4-1.4" /><path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" /><path d="m9.6 14.4 4.8-4.8" /></>} />;
const IconUpload = (p) => <Icon {...p} path={<><path d="M12 3v12" /><path d="m17 8-5-5-5 5" /><path d="M5 21h14" /></>} />;
const IconDownload = (p) => <Icon {...p} path={<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>} />;
const IconRefresh = (p) => <Icon {...p} path={<><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v6h-6" /></>} />;
const IconGrip = (p) => <Icon {...p} path={<path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" />} />;
const IconChevronUp = (p) => <Icon {...p} path={<path d="m18 15-6-6-6 6" />} />;
const IconChevronDown = (p) => <Icon {...p} path={<path d="m6 9 6 6 6-6" />} />;
const IconUsers = (p) => <Icon {...p} path={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />;
const IconCalendar = (p) => <Icon {...p} path={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></>} />;
const IconEdit = (p) => <Icon {...p} path={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></>} />;
const IconPlus = (p) => <Icon {...p} path={<><path d="M5 12h14" /><path d="M12 5v14" /></>} />;
const IconCloud = (p) => <Icon {...p} path={<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 1 0 6.34 12.6 3.5 3.5 0 0 0 6.5 19Z" />} />;
const IconEye = (p) => <Icon {...p} path={<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>} />;
const IconEyeOff = (p) => <Icon {...p} path={<><path d="M10.7 5.1A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.2 3.1" /><path d="M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="m2 2 20 20" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>} />;

// -------------------------------------------------------------- storage ----
const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore quota errors */ }
  },
};

// -------------------------------------------------- GymOrgPro name maps ----
const STATION_SYNONYMS = {
  floor: "Floor", floorexercise: "Floor",
  vault: "Vault",
  bars: "Bars", unevenbars: "Bars", ubars: "Bars",
  beam: "Beam", balancebeam: "Beam",
  pommelhorse: "Pommel Horse", pommel: "Pommel Horse", sidehorse: "Pommel Horse",
  rings: "Rings", stillrings: "Rings",
  parallelbars: "Parallel Bars", pbars: "Parallel Bars",
  horizontalbar: "Horizontal Bar", highbar: "Horizontal Bar", hbar: "Horizontal Bar",
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

function allChalkApparatus() {
  const set = new Set();
  Object.values(CHALK_DATA).forEach((lvl) => Object.keys(lvl.apparatus).forEach((a) => set.add(a)));
  return Array.from(set);
}
function guessApparatus(stationName, candidates) {
  const n = norm(stationName);
  if (STATION_SYNONYMS[n] && candidates.includes(STATION_SYNONYMS[n])) return STATION_SYNONYMS[n];
  const hit = candidates.find((c) => norm(c) === n || n.includes(norm(c)) || norm(c).includes(n));
  return hit || "";
}
function guessLevel(squadName, levelKeys) {
  const n = norm(squadName);
  return levelKeys.find((l) => norm(l) === n) || "";
}

// ===========================================================================
// SKILLS LIBRARY  (new in v6)
//
// The editor over ChalkLib. Three things a coach could not do before v6:
//   1. Fix a skill — rename it, rewrite its coaching points, hide it.
//   2. Add a skill that isn't in the club documents at all.
//   3. Map a skill onto more than one apparatus, so a shaping drill filed
//      under Floor also appears when you're planning Beam.
//
// It edits the OVERLAY, never data.js — so "Reset" always has something to go
// back to, and re-generating data.js from the club's source documents doesn't
// destroy anyone's work. See the header of chalk-library.js for why.
// ===========================================================================

// One skill's editable form. Kept as a separate component with its own local
// draft state so typing doesn't re-resolve the whole library on every keystroke
// (which, on a level with a few thousand skills, is visible on a tablet).
function LibSkillRow({ sk, level, tab, onDone }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(sk.name);
  const [cues, setCues] = useState((sk.cues || []).join("\n"));
  const [group, setGroup] = useState(sk._group || "");
  const [apps, setApps] = useState(sk._apps || [sk._home]);
  const allApps = useMemo(() => LIB.allApparatus(), []);
  const dirty = name !== sk.name
    || cues !== (sk.cues || []).join("\n")
    || group !== (sk._group || "")
    || apps.join("|") !== (sk._apps || []).join("|");

  function save() {
    LIB.edit(sk._sid, {
      name: name.trim() || sk.name,
      cues: cues.split("\n").map((c) => c.trim()).filter(Boolean),
      group: group.trim() || sk._group,
      apps: apps.length ? apps : [sk._home],
    });
    setOpen(false);
    onDone && onDone();
  }
  function toggleApp(a) {
    setApps((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : prev.concat([a])));
  }

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="text-left flex-1 min-w-0">
          <div className="text-sm text-slate-800 leading-snug flex items-center gap-1.5 flex-wrap">
            <span className={sk._hidden ? "line-through text-slate-400" : ""}>{sk.name}</span>
            {sk._custom && <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800">Added</span>}
            {sk._edited && !sk._custom && <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-100 text-amber-800">Edited</span>}
            {(sk._apps || []).length > 1 && (
              <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-sky-100 text-sky-800">
                On {sk._apps.length} apparatus
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{(sk.cues || []).length} coaching point{(sk.cues || []).length === 1 ? "" : "s"}</div>
        </button>
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-slate-400 hover:text-slate-700 p-1" title="Edit this skill"><IconEdit size={15} /></button>
      </div>

      {open && (
        <div className="px-3 pb-3 bg-slate-50/70 border-t border-slate-100 space-y-2.5 pt-2.5">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Skill name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-0.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Coaching points — one per line</span>
            <textarea value={cues} onChange={(e) => setCues(e.target.value)} rows={Math.min(10, Math.max(3, cues.split("\n").length + 1))}
              className="w-full mt-0.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm leading-relaxed" />
            <span className="text-[10px] text-slate-400">These print as the KCP column of the Word lesson plan.</span>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Group</span>
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="chalk-lib-groups"
              className="w-full mt-0.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Shows on these apparatus</span>
            <p className="text-[11px] text-slate-500 mb-1">Tick more than one and this skill appears under each of them when you&rsquo;re building a plan. It stays one skill — ticking it anywhere ticks it everywhere.</p>
            <div className="flex flex-wrap gap-1">
              {allApps.map((a) => {
                const on = apps.includes(a);
                return (
                  <button key={a} onClick={() => toggleApp(a)}
                    className="text-[11px] font-semibold px-2 py-1 rounded-full border"
                    style={on ? { background: colorFor(a), borderColor: colorFor(a), color: "#fff" } : { borderColor: "#cbd5e1", color: "#64748b", background: "#fff" }}>
                    {a}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={save} disabled={!dirty}
              className="disp text-sm font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
              style={{ background: NAVY }}>Save</button>
            <button onClick={() => setOpen(false)} className="disp text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">Cancel</button>
            {sk._edited && !sk._custom && (
              <button onClick={() => { LIB.reset(sk._sid); setOpen(false); onDone && onDone(); }}
                className="disp text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 flex items-center gap-1.5"
                title="Throw away this club's changes and go back to the skill as it ships in data.js">
                <IconRefresh size={14} /> Reset to original
              </button>
            )}
            <button
              onClick={() => {
                const msg = sk._custom
                  ? `Delete "${sk.name}"? It was added here, so this removes it for good.`
                  : `Hide "${sk.name}" from the selector? It ships with Chalk, so it isn't deleted — you can unhide it from the Hidden tab.`;
                if (confirm(msg)) { LIB.remove(sk._sid); setOpen(false); onDone && onDone(); }
              }}
              className="ml-auto disp text-sm font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 flex items-center gap-1.5">
              {sk._custom ? <><IconTrash size={14} /> Delete</> : <><IconEyeOff size={14} /> Hide</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillsLibrary({ level, setLevel, tab, setTab, streamGroups, onClose }) {
  const [rev, setRev] = useState(0);
  useEffect(() => LIB.onChange(() => setRev((n) => n + 1)), []);
  const [view, setView] = useState("browse");     // browse | add | hidden | sync
  const [q, setQ] = useState("");
  const stats = useMemo(() => LIB.stats(), [rev]);
  const tabs = useMemo(() => LIB.tabsFor(level), [level, rev]);
  const sections = useMemo(() => LIB.sections(level, tab) || [], [level, tab, rev]);
  const groupNames = useMemo(() => sections.map((s) => s.group), [sections]);

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!term) return sections;
    return sections
      .map((s) => ({ ...s, skills: s.skills.filter((k) => k.name.toLowerCase().includes(term)) }))
      .filter((s) => s.skills.length);
  }, [sections, term]);

  // ---- add-a-skill form ----
  const [nName, setNName] = useState("");
  const [nCues, setNCues] = useState("");
  const [nGroup, setNGroup] = useState("");
  const [nApps, setNApps] = useState([tab]);
  const [nScope, setNScope] = useState("level");   // level = this squad level only; all = every level
  const [added, setAdded] = useState("");
  useEffect(() => { setNApps([tab]); }, [tab]);
  const allApps = useMemo(() => LIB.allApparatus(), [rev]);

  function addSkill() {
    const sid = LIB.addSkill({
      level: nScope === "all" ? LIB.ANY : level,
      apparatus: nApps[0] || tab,
      group: nGroup.trim() || "Added skills",
      name: nName,
      cues: nCues.split("\n").map((c) => c.trim()).filter(Boolean),
      apps: nApps.length ? nApps : [tab],
    });
    if (!sid) return;
    setAdded(nName.trim());
    setNName(""); setNCues("");
    setTimeout(() => setAdded(""), 3500);
  }

  // ---- hidden list ----
  // Skills that ship with Chalk can only be hidden, never deleted, so this is
  // the one place they can be found again.
  const hidden = useMemo(() => LIB.hiddenList(), [rev]);

  const cloud = LIB.cloudState();

  function exportFile() {
    const blob = new Blob([LIB.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chalk-skills-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const mode = confirm("Merge with what's already here?\n\nOK = merge (keep both)\nCancel = replace everything with the file") ? "merge" : "replace";
      const res = LIB.importJSON(String(r.result), mode);
      if (!res.ok) alert(res.error);
    };
    r.readAsText(f);
    e.target.value = "";
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-0 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-50 w-full max-w-3xl rounded-none sm:rounded-2xl shadow-2xl my-0 sm:my-4" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 rounded-t-none sm:rounded-t-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="disp text-lg font-bold" style={{ color: NAVY }}>Skills library</h2>
            <span className="text-[11px] text-slate-500">
              {stats.added} added &middot; {stats.edited} edited &middot; {stats.hidden} hidden &middot; {stats.mapped} multi-apparatus
            </span>
            <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700 p-1"><IconX size={20} /></button>
          </div>
          <div className="flex gap-1 mt-2">
            {[["browse", "Browse & edit"], ["add", "Add a skill"], ["hidden", `Hidden${hidden.length ? ` (${hidden.length})` : ""}`], ["sync", "Sharing & backup"]].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className="disp text-sm font-semibold px-3 py-1.5 rounded-lg"
                style={view === v ? { background: NAVY, color: "#fff" } : { color: "#475569" }}>{label}</button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {/* ------------------------------------------------ browse & edit */}
          {view === "browse" && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <select value={level} onChange={(e) => setLevel(e.target.value)} className="disp font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(streamGroups).map(([stream, levels]) => (
                    <optgroup key={stream} label={STREAM_LABELS[stream] || stream}>
                      {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </optgroup>
                  ))}
                </select>
                <select value={tab} onChange={(e) => setTab(e.target.value)} className="disp font-semibold bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  {tabs.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="relative flex-1 min-w-[150px]">
                  <IconSearch size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a skill…" className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Warm-up and warm-down are shared across every squad level. Apparatus skills belong to the level shown above.
              </p>
              <datalist id="chalk-lib-groups">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>

              <div className="space-y-3">
                {shown.length === 0 && (
                  <div className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center">
                    Nothing here yet. Use &ldquo;Add a skill&rdquo; to put one in.
                  </div>
                )}
                {shown.map((sec, i) => (
                  <div key={sec.group + i}>
                    <h3 className="disp text-[13px] font-bold uppercase tracking-wide text-slate-600 mb-1">{sec.group} <span className="text-slate-400 font-medium">{sec.skills.length}</span></h3>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      {sec.skills.map((sk) => <LibSkillRow key={sk._sid} sk={sk} level={level} tab={tab} />)}
                      {sec.skills.length === 0 && <div className="px-3 py-3 text-[12px] text-slate-400">Empty group — add a skill to it from the Add tab.</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ------------------------------------------------------- add */}
          {view === "add" && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Skill name</span>
                <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="e.g. Straddle press hold, box under hips"
                  className="w-full mt-0.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Coaching points — one per line</span>
                <textarea value={nCues} onChange={(e) => setNCues(e.target.value)} rows={5} placeholder={"Shoulders over the hands\nHips stay open\nEquipment: box, mat"}
                  className="w-full mt-0.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm leading-relaxed" />
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Group</span>
                  <input value={nGroup} onChange={(e) => setNGroup(e.target.value)} list="chalk-lib-groups" placeholder="Added skills"
                    className="w-full mt-0.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Available to</span>
                  <select value={nScope} onChange={(e) => setNScope(e.target.value)} className="w-full mt-0.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm">
                    <option value="level">{level} only</option>
                    <option value="all">Every squad level</option>
                  </select>
                </label>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Shows on these apparatus</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {allApps.map((a) => {
                    const on = nApps.includes(a);
                    return (
                      <button key={a} onClick={() => setNApps((p) => (p.includes(a) ? p.filter((x) => x !== a) : p.concat([a])))}
                        className="text-[11px] font-semibold px-2 py-1 rounded-full border"
                        style={on ? { background: colorFor(a), borderColor: colorFor(a), color: "#fff" } : { borderColor: "#cbd5e1", color: "#64748b", background: "#fff" }}>
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button onClick={addSkill} disabled={!nName.trim() || !nApps.length}
                  className="disp text-sm font-semibold px-4 py-2 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-40" style={{ background: NAVY }}>
                  <IconPlus size={15} /> Add skill
                </button>
                {added && <span className="text-sm text-emerald-700 font-semibold">Added &ldquo;{added}&rdquo;.</span>}
              </div>
              <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                Added skills behave exactly like the ones that ship with Chalk — they can be ticked into a rotation,
                they carry into &ldquo;Copy previous&rdquo;, and their coaching points print as the KCP column of the Word plan.
                They can&rsquo;t have a diagram yet: diagrams come from the <code>images/</code> folder, so a new one has to be
                dropped in there and referenced from data.js.
              </p>
            </div>
          )}

          {/* ---------------------------------------------------- hidden */}
          {view === "hidden" && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="disp font-bold text-slate-800 mb-1">Hidden skills</h3>
              <p className="text-[12px] text-slate-600 mb-3">
                Skills that ship with Chalk are never deleted &mdash; hiding one just takes it out of the selector.
                Anything already ticked into a saved lesson stays there.
              </p>
              {hidden.length === 0 ? (
                <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg p-6 text-center">
                  Nothing is hidden.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {hidden.map((h) => (
                    <div key={h.sid} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 truncate">{h.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {h.level === LIB.ANY ? "All levels" : h.level} &middot; {h.apparatus} &middot; {h.group}
                        </div>
                      </div>
                      <button onClick={() => LIB.unhide(h.sid)}
                        className="shrink-0 disp text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1.5">
                        <IconEye size={14} /> Unhide
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------ sync */}
          {view === "sync" && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <IconCloud size={18} className="text-slate-500" />
                  <h3 className="disp font-bold text-slate-800">Share with the coaching team</h3>
                  {cloud.status === "live" && <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800">Live</span>}
                  {cloud.status === "connecting" && <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">Connecting</span>}
                  {cloud.status === "error" && <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-red-100 text-red-800">Problem</span>}
                </div>
                <p className="text-[12px] text-slate-600 mb-3">
                  Off by default, your edits live in this browser only. Turn it on and they sync through the same
                  Firebase project GymOrgPro already uses, so every coach opens the same library and sees changes as
                  they&rsquo;re made. Chalk still keeps a local copy, so it keeps working if the gym&rsquo;s wifi drops.
                </p>
                {cloud.error && <p className="text-[12px] text-red-600 mb-2">{cloud.error}</p>}
                <div className="flex flex-wrap gap-2 items-end">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Library name</span>
                    <input defaultValue={cloud.libraryId} onBlur={(e) => LIB.setLibraryId(e.target.value)}
                      className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm w-40" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Your name</span>
                    <input defaultValue={cloud.who} onBlur={(e) => LIB.setWho(e.target.value)} placeholder="so edits are attributed"
                      className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm w-48" />
                  </label>
                  {cloud.enabled
                    ? <button onClick={() => LIB.cloudDisconnect()} className="disp text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700">Turn off sharing</button>
                    : <button onClick={() => LIB.cloudConnect()} className="disp text-sm font-semibold px-3 py-2 rounded-lg text-white" style={{ background: NAVY }}>Turn on sharing</button>}
                </div>
                {stats.updatedAt > 0 && (
                  <p className="text-[11px] text-slate-400 mt-2">
                    Revision {stats.rev}, last changed {new Date(stats.updatedAt).toLocaleString()}
                    {stats.updatedBy ? ` by ${stats.updatedBy}` : ""}.
                  </p>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="disp font-bold text-slate-800 mb-1">Backup &amp; transfer</h3>
                <p className="text-[12px] text-slate-600 mb-3">
                  Everything above is a single small JSON file of the differences from the shipped database — worth
                  keeping a copy of, and the easiest way to move a library onto another computer without turning
                  sharing on.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={exportFile} className="disp text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1.5"><IconDownload size={15} /> Export</button>
                  <label className="disp text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 flex items-center gap-1.5 cursor-pointer">
                    <IconUpload size={15} /> Import
                    <input type="file" accept="application/json,.json" onChange={importFile} className="hidden" />
                  </label>
                  <button
                    onClick={() => { if (confirm("Throw away every edit, addition and mapping and go back to the database Chalk ships with?")) LIB.clearAll(); }}
                    className="ml-auto disp text-sm font-semibold px-3 py-2 rounded-lg border border-red-200 text-red-600">Reset everything</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
function ChalkApp() {
  const [level, setLevel] = useState(ALL_LEVELS[0]);
  const [tab, setTab] = useState("Warm-up");
  const [selected, setSelected] = useState({});
  const [focus, setFocus] = useState("");
  const [duration, setDuration] = useState("60");
  const [search, setSearch] = useState("");
  const [openCues, setOpenCues] = useState({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [mode, setMode] = useState("club"); // club | alp
  const [alpIdx, setAlpIdx] = useState(3);
  const [alpFilter, setAlpFilter] = useState("range");
  const [gymorgOpen, setGymorgOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false); // Skills Library editor (v6)
  const [activeSlot, setActiveSlot] = useState(null); // rotation leg index the selector is adding to

  // ---------------- GymOrgPro import state ----------------
  const [gymorg, setGymorg] = useState(null); // parsed backup {gymName,squads,stations,blocks}
  const [gBlockId, setGBlockId] = useState("");
  const [gSquadId, setGSquadId] = useState("");
  const [gSessionIdx, setGSessionIdx] = useState(0); // index into the dated-session list
  const [squadMap, setSquadMap] = useState(() => LS.get("chalk-gymorg-squadmap", {}));
  const [stationMap, setStationMap] = useState(() => LS.get("chalk-gymorg-stationmap", {}));
  const [headerMap, setHeaderMap] = useState(() => LS.get("chalk-gymorg-headermap", {})); // {squadId: headerId} override; "" = auto-guess
  const [alpMap, setAlpMap] = useState(() => LS.get("chalk-gymorg-alpmap", {}));
  const [prefillMode, setPrefillMode] = useState("fresh"); // fresh | last
  const [gymorgError, setGymorgError] = useState("");
  const fileInputRef = useRef(null);
  // Live (no-import) connection to GymOrgPro's Firebase — all optional/read-only.
  const [liveRosters, setLiveRosters] = useState(null); // null=not connected, {}=index loaded
  const [liveRosterId, setLiveRosterId] = useState("");
  const [liveStatus, setLiveStatus] = useState("");     // "", "connecting", "live"
  const liveUnsubRef = useRef(null);
  const autoPickedRef = useRef(false); // has the first roster been auto-opened?
  // Deep link (?roster=&block=&squad=&session=&date=) — a lesson opened straight
  // from GymOrgPro's calendar. Held in a ref so it's consumed exactly once, and
  // mirrored into state only so the banner can re-render.
  const deepLinkRef = useRef(readDeepLink());
  const [deepLink, setDeepLink] = useState(() => deepLinkRef.current ? "loading" : ""); // "" | "loading" | "done" | "error"

  const apparatusHasAlp = !!CHALK_ALP.apparatus[tab];
  useEffect(() => { if (!apparatusHasAlp && mode === "alp") setMode("club"); }, [tab]);

  // Every edit made in the Skills Library bumps a revision; re-rendering on it
  // is what makes an edit (or another coach's edit arriving over Firebase) show
  // up in the selector immediately, without a reload.
  const [libRev, setLibRev] = useState(0);
  useEffect(() => LIB.onChange(() => setLibRev((n) => n + 1)), []);
  const libStats = useMemo(() => LIB.stats(), [libRev]);

  const apparatusList = useMemo(() => Object.keys(CHALK_DATA[level].apparatus), [level]);
  // Warm-up AND warm-down are now first-class tabs alongside the apparatus, and
  // the list can also gain apparatus a coach invented in the library.
  const tabList = useMemo(() => LIB.tabsFor(level), [level, libRev]);
  useEffect(() => { if (!tabList.includes(tab)) setTab("Warm-up"); }, [level]);

  // Resolved skills = the shipped data.js baseline + the club's overlay, with
  // skills mapped onto extra apparatus already folded in. `_gi`/`_si` survive
  // from the baseline so selection keys made in v5 still match.
  const sections = useMemo(() => {
    // A group can hold skills that came from different baseline positions (a
    // skill moved between groups, or mapped in from another apparatus), so the
    // baseline indices stay ON THE SKILL — the group index is only a fallback
    // for anything that never had one.
    const raw = LIB.sections(level, tab) || [];
    return raw.map((sec, gi) => ({
      ...sec,
      _gi: gi,
      skills: sec.skills.map((sk, si) => ({ ...sk, _gi: sk._gi != null ? sk._gi : gi, _si: sk._si != null ? sk._si : si })),
    }));
  }, [level, tab, libRev]);

  const searchTerm = search.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!searchTerm) return sections;
    return sections
      .map((sec) => ({ ...sec, skills: sec.skills.filter((sk) => sk.name.toLowerCase().includes(searchTerm) || (sk.cues || []).some((c) => c.toLowerCase().includes(searchTerm))) }))
      .filter((sec) => sec.skills.length);
  }, [sections, searchTerm]);

  const skillKey = (lvl, sectionName, gi, si) => `${lvl}::${sectionName}::${gi}::${si}`;
  const color = APP_COLORS[tab] || NAVY;

  // ---- Current GymOrgPro session (must precede the slot logic below) -------
  const gBlock = useMemo(() => gymorg && gymorg.blocks.find((b) => b.id === gBlockId), [gymorg, gBlockId]);
  const gSquad = useMemo(() => gymorg && gymorg.squads.find((s) => s.id === gSquadId), [gymorg, gSquadId]);
  const gAllDated = useMemo(() => (gymorg && gBlock) ? GB.datedSessions(gymorg, gBlock) : [], [gymorg, gBlock]);
  const gSessions = useMemo(() => gSquadId ? GB.datedForSquad(gAllDated, gSquadId) : [], [gAllDated, gSquadId]);
  const gCurrent = gSessions[gSessionIdx] || gSessions[0] || null;
  const gLegs = gCurrent ? gCurrent.legs : [];

  // ---- Rotation slots ----------------------------------------------------
  // Every lesson has: a warm-up ("W"), the scheduled rotations (0..n-1), and a
  // warm-down ("D"). Warm-up and warm-down always exist even though GymOrgPro
  // doesn't schedule them as stations. "M" = manual mode (no session loaded).
  //
  // The block you've SELECTED is where skills go — whatever apparatus they come
  // from. Pick "Rotation 2 · Beam" and a Floor skill still lands in Rotation 2.
  // That's deliberate: a coach often runs a conditioning or shaping drill at a
  // station that isn't that apparatus.
  const hasSession = gLegs.length > 0;
  const slotValid = (s) =>
    s === "W" || s === "D" || (typeof s === "number" && s >= 0 && s < gLegs.length);
  // Sticky: whatever block you last selected stays the target until you pick
  // another. Falls back to the first rotation (or the warm-up if there are none).
  const targetSlot = !hasSession ? "M"
    : (slotValid(activeSlot) ? activeSlot : (gLegs.length ? 0 : "W"));
  const slotKey = (base) => `${targetSlot}|${base}`;

  // Where an already-selected skill lives. Entries saved before slots existed
  // (or against a rotation this session doesn't have) are pulled back into a
  // real block rather than being stranded.
  function slotOf(v) {
    if (!hasSession) return "M";
    if (slotValid(v.slot)) return v.slot;
    if (v.section === "Warm-up") return "W";
    if (v.section === "Warm-down") return "D";
    const i = gLegs.findIndex((l) => stationMap[l.stationId] === v.section);
    return i >= 0 ? i : 0;
  }

  // Select a block as the target. For a rotation we also swing the selector to
  // that station's apparatus (the usual case) — but you're free to switch tabs
  // afterwards and keep adding to the same block.
  function focusSlot(slotId, stationId) {
    setActiveSlot(slotId);
    if (typeof slotId === "number" && stationId) {
      const appName = stationMap[stationId];
      if (appName) {
        if (gMappedLevel) setLevel(gMappedLevel);
        setTab(appName);
        if (CHALK_ALP.apparatus[appName]) { setMode("alp"); setAlpIdx(gAlpIdx); setAlpFilter("range"); }
        else setMode("club");
      }
    } else if (slotId === "W") {
      setTab("Warm-up");
      setMode("club");
    } else if (slotId === "D") {
      setTab("Warm-down");
      setMode("club");
    }
  }

  // A human label for whichever block new ticks will land in.
  const targetLabel = !hasSession ? ""
    : targetSlot === "W" ? "Warm-up"
    : targetSlot === "D" ? "Warm-down"
    : (() => { const l = gLegs[targetSlot]; return l ? `Rotation ${targetSlot + 1} · ${l.gap ? "Open" : l.stationName}` : ""; })();

  function toggleSkill(sectionName, gi, si, group, skill) {
    // Custom skills carry a permanent key (they have no position in data.js to
    // derive one from); baseline skills keep the v5 level/section/index key.
    const key = slotKey(skill && skill._ck ? skill._ck : skillKey(level, sectionName, gi, si));
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = {
        level, slot: targetSlot, ord: nextOrd(prev, targetSlot),
        section: sectionName, group: (skill && skill._group) || group.group,
        name: skill.name, cues: skill.cues || [], img: skill.img || [],
        color: colorFor(sectionName),
      };
      return next;
    });
  }
  function toggleAlpSkill(sectionName, idx, entry, levelLabel) {
    const key = slotKey(`ALP::${sectionName}::${idx}`);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else {
        const cues = [`Family: ${entry.f}`, `Difficulty: ${entry.d || "—"}`, `Pathway skill (${levelLabel})`];
        next[key] = { level, slot: targetSlot, ord: nextOrd(prev, targetSlot), section: sectionName, group: entry.f, name: entry.s, cues, img: [], color: APP_COLORS[sectionName] || NAVY, alp: true };
      }
      return next;
    });
  }

  const selectedList = Object.entries(selected);
  // Every entry carries an `ord` — its position INSIDE its block. That's what
  // makes the lesson plan re-orderable (see moveSkill): the object itself is a
  // map, so without an explicit order the rows would just sit in the order they
  // happened to be ticked. Entries saved before ordering existed have no `ord`;
  // they keep their insertion order and get numbered on load (see withOrds).
  const byOrd = (a, b) => (a.ord == null ? 1e9 : a.ord) - (b.ord == null ? 1e9 : b.ord);
  const bySection = useMemo(() => {
    const map = {};
    selectedList.forEach(([id, v]) => { (map[v.section] = map[v.section] || []).push({ id, ...v }); });
    Object.keys(map).forEach((k) => map[k].sort(byOrd));
    return map;
  }, [selected]);
  // Skills grouped by rotation slot — this is what the lesson plan renders from.
  const bySlot = useMemo(() => {
    const map = {};
    selectedList.forEach(([id, v]) => { const s = slotOf(v); (map[s] = map[s] || []).push({ id, ...v }); });
    Object.keys(map).forEach((k) => map[k].sort(byOrd));
    return map;
  }, [selected, gLegs, stationMap, hasSession]);

  // Next free position at the BOTTOM of a block (new ticks append, they don't
  // jump the queue).
  function nextOrd(plan, slot) {
    let max = -1;
    Object.values(plan).forEach((v) => { if (v.slot === slot && typeof v.ord === "number" && v.ord > max) max = v.ord; });
    return max + 1;
  }
  // Number any entries that don't have a position yet, per block, keeping the
  // order they're already in. Run whenever a plan is loaded from storage.
  function withOrds(plan) {
    const groups = {};
    Object.entries(plan).forEach(([id, v]) => { const k = String(v.slot); (groups[k] = groups[k] || []).push([id, v]); });
    const out = {};
    Object.values(groups).forEach((list) => {
      let max = -1;
      list.forEach(([, v]) => { if (typeof v.ord === "number" && v.ord > max) max = v.ord; });
      list.forEach(([id, v]) => { out[id] = (typeof v.ord === "number") ? v : { ...v, ord: ++max }; });
    });
    return out;
  }

  // Drop one skill at a given position inside its block (this is what a drag
  // commits). Renumbers the whole block so positions stay 0..n-1 — and pins any
  // legacy entry to where it's currently displayed.
  function moveSkillTo(slotId, id, toIndex) {
    setSelected((prev) => {
      const list = Object.entries(prev)
        .filter(([, v]) => slotOf(v) === slotId)
        .sort((a, b) => byOrd(a[1], b[1]));
      const from = list.findIndex(([k]) => k === id);
      if (from < 0) return prev;
      const to = Math.max(0, Math.min(toIndex, list.length - 1));
      if (to === from) return prev;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      const next = { ...prev };
      list.forEach(([k, v], n) => { next[k] = { ...v, slot: slotId, ord: n }; });
      return next;
    });
  }

  // Keyboard fallback (focus a drag handle, press ↑ / ↓) — same renumbering.
  function moveSkill(slotId, id, dir) {
    setSelected((prev) => {
      const list = Object.entries(prev)
        .filter(([, v]) => slotOf(v) === slotId)
        .sort((a, b) => byOrd(a[1], b[1]));
      const i = list.findIndex(([k]) => k === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return prev;
      const swap = list[i]; list[i] = list[j]; list[j] = swap;
      const next = { ...prev };
      list.forEach(([k, v], n) => { next[k] = { ...v, slot: slotId, ord: n }; });
      return next;
    });
  }
  // Warm-up first, then the apparatus, then warm-down last — the order a plan
  // actually runs in, which is also the order it prints in.
  const orderedSections = useMemo(
    () => ["Warm-up", ...apparatusList, "Warm-down"].filter((s) => bySection[s]),
    [apparatusList, bySection]
  );

  function clearAll() {
    if (confirm("Clear all selected skills from this session?")) setSelected({});
  }
  function planText() {
    let out = `GYMNASTICS SESSION PLAN\n${level}` + (focus ? `  —  Focus: ${focus}` : "") + `\nDuration: ${duration} min\n`;
    orderedSections.forEach((sec) => {
      out += `\n${sec.toUpperCase()}\n`;
      bySection[sec].forEach((sk) => {
        out += `  • ${sk.name}` + (sk.group && sk.group !== "General" ? `  [${sk.group}]` : "") + `\n`;
        (sk.cues || []).forEach((c) => { out += `      - ${c}\n`; });
      });
    });
    return out;
  }
  function copyPlan() { navigator.clipboard?.writeText(planText()); }
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  function printPlan() {
    const win = window.open("", "_blank");
    if (!win) return;

    // Build the circuits from the REAL GymOrgPro rotation when a session is
    // active: one circuit per rotation leg, using that leg's actual station name
    // and its actual minutes. Falls back to the manual grouping otherwise.
    const headerUri = gHeader ? GB.headerDataUri(gHeader) : "";
    const title = hasSession && gSquad ? gSquad.name : level;
    const subtitle = hasSession && gMappedLevel && gSquad && gMappedLevel !== gSquad.name ? gMappedLevel : (hasSession ? "" : (focus || ""));
    const dateStr = hasSession && gCurrent ? `${gCurrent.dow} ${fmtShortDate(gCurrent.date)}` : "__________";
    const coachStr = hasSession && gCurrent && gCurrent.coachName ? gCurrent.coachName : "__________";
    const assistStr = hasSession && gCurrent && gCurrent.assistantName ? gCurrent.assistantName : "";
    const timeStr = hasSession && gCurrent ? `${GB.fmtTime(gCurrent.startTime)}–${GB.fmtTime(gCurrent.endTime)}` : "";
    const totalMins = hasSession && gCurrent ? gCurrent.duration : (parseInt(duration) || 0);

    const circuits = hasSession
      ? gLegs.map((leg, i) => ({
          label: leg.gap ? "Break / free time" : (leg.stationName || "Station"),
          apparatus: stationMap[leg.stationId] || "",
          minutes: leg.minutes,
          skills: bySlot[i] || [],
          gap: leg.gap,
        })).filter((c) => !c.gap || c.skills.length)
      : orderedSections.filter((s) => s !== "Warm-up" && s !== "Warm-down").map((sec) => ({
          label: sec, apparatus: sec, minutes: null, skills: bySection[sec] || [], gap: false,
        }));

    const wAll = hasSession ? (bySlot["W"] || []) : (bySection["Warm-up"] || []);
    const dAll = hasSession ? (bySlot["D"] || []) : (bySection["Warm-down"] || []);
    const warmSkills = wAll.filter((v) => !v.gop);
    const coolSkills = dAll.filter((v) => !v.gop);
    const warmStd = wAll.filter((v) => v.gop)
      .map((v) => `${v.name}${v.duration ? ` (${v.duration} min)` : ""}`);
    const warmMins = wAll.filter((v) => v.gop).reduce((n, v) => n + (Number(v.duration) || 0), 0);
    const warmdownItems = dAll.filter((v) => v.gop)
      .map((v) => `${v.name}${v.duration ? ` (${v.duration} min)` : ""}`);
    const warmdownMins = dAll.filter((v) => v.gop).reduce((n, v) => n + (Number(v.duration) || 0), 0);

    const skillRows = (skills, equip) => skills.map((sk) => `
      <tr>
        <td class="eq">${esc(equip || sk.section || "")}</td>
        <td class="sk"><div class="skrow">${sk.img && sk.img.length ? `<img class="thumb" src="${imgSrc(sk.img[0])}"/>` : ""}<span class="skname">${esc(sk.name)}${sk.group && sk.group !== "General" ? `<span class="sub">${esc(sk.group)}</span>` : ""}</span></div></td>
        <td class="kcp">${(sk.cues || []).length ? `<ul>${sk.cues.map((c2) => `<li>${esc(c2)}</li>`).join("")}</ul>` : ""}</td>
        <td class="safe"></td>
      </tr>`).join("");

    const circuitsHtml = circuits.map((c, i) => {
      const col = APP_COLORS[c.apparatus] || NAVY;
      const mins = c.minutes != null ? ` &nbsp;–&nbsp; ${c.minutes} mins` : "";
      const body = c.skills.length
        ? `<table class="circ"><thead><tr><th class="eq">Equipment</th><th class="sk">Skill</th><th class="kcp">KCP</th><th class="safe">Safety</th></tr></thead><tbody>${skillRows(c.skills, c.label)}</tbody></table>`
        : `<table class="circ"><thead><tr><th class="eq">Equipment</th><th class="sk">Skill</th><th class="kcp">KCP</th><th class="safe">Safety</th></tr></thead><tbody>${[0, 1, 2].map(() => `<tr><td class="eq">${esc(c.label)}</td><td class="sk"></td><td class="kcp"></td><td class="safe"></td></tr>`).join("")}</tbody></table>`;
      return `<div class="bar" style="background:${col}">Rotation ${i + 1} &nbsp;–&nbsp; ${esc(c.label)}${mins}</div>${body}`;
    }).join("");

    const warmBlock = (warmStd.length || warmSkills.length)
      ? `<div class="bar">Warm-up${warmMins ? ` &nbsp;–&nbsp; ${warmMins} mins` : ""}</div>
         ${warmStd.length ? `<table class="warm"><tbody><tr><td class="wt" colspan="4">${warmStd.map(esc).join(" &nbsp;·&nbsp; ")}</td></tr></tbody></table>` : ""}
         ${warmSkills.length ? `<table class="circ"><thead><tr><th class="eq">Equipment</th><th class="sk">Skill</th><th class="kcp">KCP</th><th class="safe">Safety</th></tr></thead><tbody>${skillRows(warmSkills, "Warm-up")}</tbody></table>` : ""}`
      : "";

    const coolBlock = `<div class="bar">Warm Down &nbsp;–&nbsp; complete at last station${warmdownMins ? ` &nbsp;–&nbsp; ${warmdownMins} mins` : ""}</div>
      <table class="warm"><tbody><tr><td class="wt" colspan="4" style="font-style:italic;color:#555">${warmdownItems.length ? esc(warmdownItems.join(" · ")) : "Gymnasts stand on line. Coach dismisses gymnasts."}</td></tr></tbody></table>
      ${coolSkills.length ? `<table class="circ"><thead><tr><th class="eq">Equipment</th><th class="sk">Skill</th><th class="kcp">KCP</th><th class="safe">Safety</th></tr></thead><tbody>${skillRows(coolSkills, "Warm-down")}</tbody></table>` : ""}`;

    // The Notes box that closes the document: the gym's standing notes from
    // GymOrgPro, then this lesson's own. Same content as the Word export's.
    const notesText = notesFor(currentPlanKey);
    const notesBlock = `<div class="bar">Notes</div>
      <table class="warm"><tbody><tr><td class="wt" style="font-weight:400;min-height:52px">${
        notesText ? notesText.split(/\r?\n/).filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join("") : "&nbsp;<br>&nbsp;"
      }</td></tr></tbody></table>`;

    const metaBits = [
      totalMins ? `Duration: <b>${esc(totalMins)} min</b>` : "",
      timeStr ? `Time: ${esc(timeStr)}` : "",
      `Skills: ${selectedList.length}`,
      `Date: ${esc(dateStr)}`,
      `Coach: ${esc(coachStr)}${assistStr ? ` &nbsp;·&nbsp; Assist: ${esc(assistStr)}` : ""}`,
    ].filter(Boolean).join("<br>");

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — Lesson Plan</title>
      <style>
        @page{size:A4;margin:12mm}
        *{box-sizing:border-box} body{font-family:'Barlow Semi Condensed',Arial,sans-serif;color:#1b1930;margin:0}
        .banner{width:100%;max-height:70px;object-fit:contain;object-position:left;display:block;margin-bottom:8px}
        .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid ${NAVY};padding-bottom:6px;margin-bottom:12px}
        .hd h1{font-size:22px;margin:0;letter-spacing:.4px} .hd .club{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px}
        .hd .sub{font-size:12px;color:#666;margin-top:2px}
        .hd .meta{font-family:Arial,sans-serif;font-size:11px;color:#555;text-align:right;line-height:1.5}
        .bar{background:#C2D69B;font-weight:700;font-size:13px;padding:5px 9px;margin-top:11px;color:#26331a;border:1px solid #a9c07c;letter-spacing:.3px}
        .bar[style]{color:#fff;border:none}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        .circ th{background:#BFBFBF;color:#222;font-size:11px;text-transform:uppercase;letter-spacing:.6px;text-align:left;padding:3px 8px;border:1px solid #9a9a9a}
        .circ td{border:1px solid #c9c9c9;padding:5px 8px;vertical-align:top;font-family:Arial,sans-serif}
        .circ .eq{width:15%;font-size:11px;color:#444} .circ .sk{width:34%} .circ .kcp{width:36%} .circ .safe{width:15%;background:#fbfbfb}
        .skrow{display:flex;gap:7px;align-items:flex-start}
        .thumb{width:38px;height:38px;object-fit:contain;flex:0 0 auto;border:1px solid #e2e2ea;border-radius:4px;background:#fff}
        .skname{font-size:12.5px;font-weight:600;line-height:1.25;font-family:Arial,sans-serif}
        .sub{display:block;font-size:9.5px;font-weight:400;color:#8a8a8a;letter-spacing:.2px}
        .kcp ul{margin:0;padding-left:14px} .kcp li{font-size:10.5px;color:#444;margin:1px 0}
        .warm{margin-top:0} .warm td{border:1px solid #c9c9c9;padding:5px 8px;font-family:Arial,sans-serif;font-size:11.5px;vertical-align:top}
        .warm .wt{font-weight:600}
        .foot{margin-top:12px;font-family:Arial,sans-serif;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:5px}
        tr,table,.bar{break-inside:avoid}
      </style></head><body>
      ${headerUri ? `<img class="banner" src="${headerUri}"/>` : ""}
      <div class="hd"><div><div class="club">Gymnastics Lesson Plan</div><h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}</div>
        <div class="meta">${metaBits}</div></div>
      ${warmBlock}${circuitsHtml || "<p style='font-family:Arial;color:#888'>No skills selected yet.</p>"}${coolBlock}${notesBlock}
      <div class="foot">KCP = Key Coaching Points &nbsp;·&nbsp; Key: Coach position</div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),450)}<\/script></body></html>`);
    win.document.close();
  }

  const streamGroups = useMemo(() => {
    const g = {};
    ALL_LEVELS.forEach((l) => { (g[CHALK_DATA[l].stream] = g[CHALK_DATA[l].stream] || []).push(l); });
    return g;
  }, []);

  // ==================================================================
  // GymOrgPro import + rotation logic
  // ==================================================================
  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { applyParsed(GB.parseBackup(reader.result)); }
      catch (err) { setGymorgError(err.message || "Couldn't read that file."); }
    };
    reader.readAsText(file);
  }

  // Single ingest path shared by file import AND the live connection: takes a
  // parsed backup and seeds the UI + auto-guessed mappings. Preserves the block
  // the user was already on (so a live re-sync doesn't yank them elsewhere).
  function applyParsed(parsed) {
    setGymorg(parsed);
    setGymorgError("");
    // A pending deep link wins over everything: it names the exact block+squad
    // the coach clicked in GymOrgPro. (Only while unconsumed — once resolved,
    // normal "keep where the user is" behaviour resumes, so a live re-sync from
    // GymOrgPro never yanks them back to the linked lesson.)
    const dl = deepLinkRef.current;
    const dlBlock = (dl && dl.blockId && parsed.blocks.some((b) => b.id === dl.blockId)) ? dl.blockId : "";
    // Keep the user's current block if it still exists (so a live re-sync doesn't
    // jump them), else the active block, else the first block.
    const bid = dlBlock || ((gBlockId && parsed.blocks.some((b) => b.id === gBlockId)) ? gBlockId
      : (parsed.activeBlockId && parsed.blocks.some((b) => b.id === parsed.activeBlockId) ? parsed.activeBlockId
      : (parsed.blocks[0] ? parsed.blocks[0].id : "")));
    // Default the squad to one that's actually scheduled in that block, not just
    // the first squad in the org (which may not train in this block at all).
    const blk = parsed.blocks.find((b) => b.id === bid);
    const blockSquads = (blk && blk.squadIds && blk.squadIds.length) ? blk.squadIds : parsed.squads.map((s) => s.id);
    const dlSquad = (dl && dl.squadId && blockSquads.indexOf(dl.squadId) !== -1) ? dl.squadId : "";
    const sid = dlSquad || ((gSquadId && blockSquads.indexOf(gSquadId) !== -1) ? gSquadId : (blockSquads[0] || ""));
    setGBlockId(bid);
    setGSquadId(sid);
    setGSessionIdx((idx) => idx || 0);
    const candidates = allChalkApparatus();
    setStationMap((prevMap) => {
      const next = { ...prevMap };
      parsed.stations.forEach((s) => { if (!next[s.id]) next[s.id] = guessApparatus(s.name, candidates); });
      LS.set("chalk-gymorg-stationmap", next); return next;
    });
    setSquadMap((prevMap) => {
      const next = { ...prevMap };
      parsed.squads.forEach((s) => { if (!next[s.id]) next[s.id] = guessLevel(s.name, ALL_LEVELS); });
      LS.set("chalk-gymorg-squadmap", next); return next;
    });
  }

  // Connect to GymOrgPro's Firebase (read-only) and load the roster list.
  function connectLive() {
    if (!LIVE || !LIVE.available()) return;
    setLiveStatus("connecting"); setGymorgError("");
    LIVE.listRosters((index) => {
      const idx = index || {};
      setLiveRosters(idx);
      // The roster list is a live listener, so this fires again whenever the
      // index changes — only auto-open a roster the FIRST time.
      if (autoPickedRef.current) return;
      const ids = Object.keys(idx).filter((id) => !(idx[id] && idx[id].hidden));
      if (!ids.length) { setLiveStatus(""); setGymorgError("No rosters found in GymOrgPro."); return; }
      // Prefer the roster last used here, then GymOrgPro's default, then the first.
      const saved = LS.get("chalk-gymorg-liveroster", "");
      const pick = (def) => {
        if (autoPickedRef.current) return;
        autoPickedRef.current = true;
        const id = (saved && idx[saved]) ? saved : ((def && idx[def]) ? def : ids[0]);
        selectLiveRoster(id); // actually subscribe + load — not just set the dropdown
      };
      LIVE.getDefaultRosterId().then(pick).catch(() => pick(null));
    }, () => { setLiveStatus(""); setGymorgError("Couldn't reach GymOrgPro live (offline?). You can still load a backup file."); });
  }

  // Subscribe to one roster live — every save in GymOrgPro re-applies here.
  function selectLiveRoster(rosterId) {
    if (!LIVE || !rosterId) return;
    setLiveRosterId(rosterId);
    LS.set("chalk-gymorg-liveroster", rosterId);
    if (liveUnsubRef.current) { liveUnsubRef.current(); liveUnsubRef.current = null; }
    setLiveStatus("connecting");
    LIVE.subscribeRoster(rosterId, (blob) => {
      try {
        const parsed = GB.parseBackup(blob);
        applyParsed(parsed);
        setLiveStatus("live");
        if (!parsed.blocks || !parsed.blocks.length) {
          setGymorgError("This roster has no schedule blocks yet — add one in GymOrgPro (Calendar → blocks), or pick another roster.");
        }
      } catch (err) { setLiveStatus(""); setGymorgError(err.message || "That roster couldn't be read."); }
    }, (e) => { setLiveStatus(""); setGymorgError(e.message || "Live roster read failed."); }).then((unsub) => { liveUnsubRef.current = unsub; });
  }

  useEffect(() => () => { if (liveUnsubRef.current) liveUnsubRef.current(); }, []);

  // ---- Deep link: opened from a lesson in GymOrgPro's calendar --------------
  // On load, skip the roster picker entirely: connect live, subscribe to the
  // roster named in the URL, and (below) land on the exact lesson. Read-only as
  // always — the link is a pointer, not a hand-off of data.
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (!dl) return;
    if (!LIVE || !LIVE.available()) {
      deepLinkRef.current = null;
      setDeepLink("error");
      setGymorgError("This link points at a GymOrgPro lesson, but the live connection isn't available. Load a backup .json instead.");
      return;
    }
    autoPickedRef.current = true; // the link IS the pick — don't let connectLive override it
    connectLive();                // still loads the roster list, so the dropdown works afterwards
    selectLiveRoster(dl.rosterId);
  }, []);

  // Reset to the first lesson whenever the block or squad changes.
  useEffect(() => { setGSessionIdx(0); }, [gBlockId, gSquadId]);

  // ...then, once the linked roster has arrived and the block/squad have settled,
  // jump to the exact dated session. Declared AFTER the reset effect above so it
  // runs second in the same commit and wins. Consumes the link (ref -> null) so
  // later live re-syncs leave the coach wherever they've navigated to.
  useEffect(() => {
    const dl = deepLinkRef.current;
    if (!dl || !gymorg) return;
    const fail = (msg) => { deepLinkRef.current = null; setDeepLink("error"); setGymorgError(msg); setGymorgOpen(true); };
    if (dl.blockId && !gymorg.blocks.some((b) => b.id === dl.blockId)) {
      return fail("That lesson's schedule block isn't in this roster — it may belong to a different GymOrgPro location. Switch location in GymOrgPro, or pick the block below.");
    }
    if (dl.blockId && gBlockId !== dl.blockId) return;   // still settling
    if (dl.squadId && gSquadId !== dl.squadId) return;
    if (!gSessions.length) return;                        // rotations not built yet

    const key = GB.datedKey(dl.date, dl.squadId, dl.sessionId);
    let idx = gSessions.findIndex((s) => s.key === key);
    if (idx === -1) idx = gSessions.findIndex((s) => s.date === dl.date && s.sessionId === dl.sessionId);
    if (idx === -1) idx = gSessions.findIndex((s) => s.date === dl.date); // same day, different session id
    if (idx === -1) {
      return fail("Couldn't find that lesson in the live schedule — it may have been moved or deleted since the link was made. Pick a lesson below.");
    }
    deepLinkRef.current = null;
    setGSessionIdx(idx);
    setActiveSlot(null);                       // start on the first rotation
    const lvl = squadMap[dl.squadId];
    if (lvl && ALL_LEVELS.includes(lvl)) setLevel(lvl); // open at the squad's Chalk level
    setDeepLink("done");
  }, [gymorg, gBlockId, gSquadId, gSessions, squadMap]);

  const gMappedLevel = gSquad ? (squadMap[gSquad.id] || "") : "";
  const gAlpIdx = gSquad ? (alpMap[gSquad.id] != null ? alpMap[gSquad.id] : 3) : 3;
  const gHeader = useMemo(() => (gymorg && gSquadId) ? GB.resolveHeader(gymorg, gSquadId, headerMap) : null, [gymorg, gSquadId, headerMap]);
  const gKey = gCurrent ? gCurrent.key : null;

  // ---- Per-session lesson plans ----
  // Every session's ticked skills are kept separately and swapped in/out of the
  // working `selected` as you move between lessons/squads, so nothing is lost.
  // Keyed by the dated session key (date::squad::session); "__manual__" holds the
  // free-form (no active session) working set. Persisted to localStorage.
  const plansRef = useRef(LS.get("chalk-gymorg-plans", {}));
  const seededRef = useRef(LS.get("chalk-gymorg-seeded", {}));
  const loadedKeyRef = useRef(undefined);
  const currentPlanKey = gKey || "__manual__";

  // ---- The Notes box at the bottom of the plan (new in v5.9) ----------------
  // GymOrgPro owns the STANDING notes: whatever is typed into "Lesson Plan
  // Notes" on its Lesson Plans tab (between Warm-up and Warm-down) arrives here
  // through the live/backup bridge and heads every plan's Notes box. It is read
  // only in Chalk — edit it over there and it re-syncs here, like everything
  // else GymOrgPro owns.
  //
  // Underneath it, a coach can add notes for THIS lesson only. Those are
  // Chalk's, kept per dated session and persisted to localStorage, and both
  // halves print into the Notes box of the Word export.
  const gopNotes = useMemo(
    () => (gymorg ? (GB.notesText ? GB.notesText(gymorg) : String(gymorg.notes || "").trim()) : ""),
    [gymorg]
  );
  const [lessonNotes, setLessonNotes] = useState(() => LS.get("chalk-lesson-notes", {}));
  useEffect(() => {
    const t = setTimeout(() => LS.set("chalk-lesson-notes", lessonNotes), 400);
    return () => clearTimeout(t);
  }, [lessonNotes]);
  const myNote = lessonNotes[currentPlanKey] || "";
  const setMyNote = (text) => setLessonNotes((prev) => ({ ...prev, [currentPlanKey]: text }));
  // What actually goes in the Notes box of a given lesson's document: the gym's
  // standing notes, then that lesson's own.
  const notesFor = (key) => [gopNotes, (lessonNotes[key] || "").trim()].filter(Boolean).join("\n");

  // GymOrgPro's standard warm-up / warm-down items, turned into ordinary plan
  // entries so a coach can see them in the block and REMOVE any that don't apply
  // to this lesson. They're seeded once per session; after that the coach owns
  // them (delete one and it stays deleted for that lesson).
  function gopSeed() {
    const out = {};
    const add = (items, slot, section) => {
      (items || []).forEach((w, i) => {
        const name = (w.name || "").trim();
        if (!name) return;
        out[`${slot}|GOP::${slot}::${i}`] = {
          level, slot, ord: i, section, group: section, name,
          duration: Number(w.duration) || 0, gop: true,
          cues: [], img: [], color: slot === "W" ? (APP_COLORS["Warm-up"] || NAVY) : "#64748b",
        };
      });
    };
    add((gymorg && gymorg.warmup) || [], "W", "Warm-up");
    add((gymorg && gymorg.warmdown) || [], "D", "Warm-down");
    return out;
  }

  // The previous occurrence of THIS squad's same weekly slot (earlier date), so
  // "same as last time" can carry a plan forward from lesson N-1 to lesson N.
  function prevSameSlotKey() {
    if (!gCurrent) return null;
    const i = gSessions.findIndex((s) => s.key === gCurrent.key);
    for (let j = i - 1; j >= 0; j--) if (gSessions[j].sessionId === gCurrent.sessionId) return gSessions[j].key;
    return null;
  }

  useEffect(() => {
    const prevKey = loadedKeyRef.current;
    if (prevKey !== currentPlanKey) {
      // Switching sessions: stash the outgoing plan, restore the incoming one.
      if (prevKey !== undefined) plansRef.current = { ...plansRef.current, [prevKey]: selected };
      loadedKeyRef.current = currentPlanKey;
      LS.set("chalk-gymorg-plans", plansRef.current);
      let incoming = withOrds(plansRef.current[currentPlanKey] || {});
      // First time we open this lesson, drop GymOrgPro's warm-up/warm-down in.
      if (hasSession && !seededRef.current[currentPlanKey]) {
        incoming = { ...gopSeed(), ...incoming };
        seededRef.current = { ...seededRef.current, [currentPlanKey]: true };
        LS.set("chalk-gymorg-seeded", seededRef.current);
        plansRef.current = { ...plansRef.current, [currentPlanKey]: incoming };
        LS.set("chalk-gymorg-plans", plansRef.current);
      }
      if (prevKey !== undefined || Object.keys(incoming).length) setSelected(incoming);
      return;
    }
    // Same session, skills changed: keep the store current, persist debounced.
    plansRef.current = { ...plansRef.current, [currentPlanKey]: selected };
    const t = setTimeout(() => LS.set("chalk-gymorg-plans", plansRef.current), 400);
    return () => clearTimeout(t);
  }, [selected, currentPlanKey, hasSession]);

  // ---- GymOrgPro's own notes, brought across as rotation items --------------
  // A coach who typed KCP / safety notes into GymOrgPro's lesson-plan pop-up
  // shouldn't have to retype them here. Each note comes across as an item in the
  // matching rotation (warm-down notes land in the Warm-down block), sitting
  // ABOVE the skills as the brief for that station, and flows into the Word
  // export — KCP notes as coaching points, safety notes in the Safety column.
  //
  // They stay GymOrgPro's: edit the note over there and it re-syncs here (the
  // note's text is the signature — see the effect below). Delete one here and it
  // stays gone, because deleting doesn't change GymOrgPro's text. They're never
  // carried into another lesson by "Copy previous" — they belong to this one.
  function gopNoteEntries() {
    if (!gymorg || !gCurrent || !gLegs.length) return {};
    const plan = GB.lessonPlanFor(gymorg, gCurrent.date, gCurrent.squadId, gCurrent.sessionId);
    if (!plan) return {};
    const out = {};
    const add = (slot, kind, text, section, color, ord) => {
      const t = String(text || "").trim();
      if (!t) return;
      const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      out[`${slot}|GOPNOTE::${slot}::${kind}`] = {
        level, slot, ord, section, group: kind === "safety" ? "Safety" : "Coach's note",
        name: lines[0], cues: lines.slice(1), img: [], color,
        gopNote: true, noteKind: kind,
      };
    };
    const circuits = GB.circuitsForLegs(plan, gLegs);
    gLegs.forEach((leg, i) => {
      const c = circuits[i];
      if (!c) return;
      const section = stationMap[leg.stationId] || leg.stationName || "";
      const color = APP_COLORS[stationMap[leg.stationId]] || NAVY;
      add(i, "kcp", c.kcp, section, color, -2);       // negative ord = above the skills
      add(i, "safety", c.safety, section, "#b45309", -1);
    });
    add("D", "warmdown", plan.warmDown, "Warm-down", "#64748b", -1);
    return out;
  }

  // Keep the notes in step with GymOrgPro. The signature is the note TEXT, so a
  // note only re-appears when it's actually been edited over there — not every
  // time the roster re-syncs, and not after a coach has deliberately removed it.
  const noteSigRef = useRef(LS.get("chalk-gymorg-notesig", {}));
  useEffect(() => {
    if (!gymorg || !gCurrent) return;
    if (loadedKeyRef.current !== currentPlanKey) return;   // wait for the plan swap
    const notes = gopNoteEntries();
    const sig = JSON.stringify(Object.entries(notes).map(([id, v]) => [id, v.name, v.cues]));
    if (noteSigRef.current[currentPlanKey] === sig) return;
    const first = noteSigRef.current[currentPlanKey] === undefined;
    noteSigRef.current = { ...noteSigRef.current, [currentPlanKey]: sig };
    LS.set("chalk-gymorg-notesig", noteSigRef.current);
    const n = Object.keys(notes).length;
    if (first && !n) return;
    setSelected((prev) => {
      const next = {};
      Object.entries(prev).forEach(([id, v]) => { if (!v.gopNote) next[id] = v; });   // drop the old notes
      return { ...next, ...notes };
    });
    if (n) flashPlan(first
      ? `Brought ${n} note${n === 1 ? "" : "s"} across from GymOrgPro's lesson plan.`
      : `Notes updated from GymOrgPro (${n}).`);
  }, [gymorg, gCurrent, gLegs, currentPlanKey, stationMap]);

  function jumpToLeg(stationId, legIdx) { focusSlot(legIdx != null ? legIdx : 0, stationId); }

  // ---- "Copy previous" (per rotation) --------------------------------------
  // A squad might be on Floor 3 this Monday, then not again for a fortnight. When
  // it does come back around, the coach wants what they ran LAST time on that
  // station — not last lesson (which was a different apparatus entirely). So this
  // walks BACKWARDS through this squad's lessons in the block, finds the most
  // recent one whose rotation included this same station AND had skills planned
  // for it, and hands those skills back. Repeat them as-is, or use them as the
  // starting point and progress from there.

  // The skills that were planned for one leg of an EARLIER lesson. GymOrgPro's
  // seeded warm-up/warm-down items are skipped (they're not rotation skills), and
  // entries saved before slots existed fall back to matching on apparatus.
  function entriesForLeg(plan, legs, legIdx) {
    const section = legs[legIdx] ? stationMap[legs[legIdx].stationId] : "";
    return Object.entries(plan || {}).filter(([, v]) => {
      if (v.gop || v.gopNote) return false;   // GymOrgPro's own items/notes belong to THAT lesson
      if (typeof v.slot === "number") return v.slot === legIdx;
      if (v.slot === "W" || v.slot === "D") return false;
      return !!section && v.section === section;
    });
  }

  // The most recent earlier lesson (this squad, this block) that used `stationId`
  // and had skills on it. Returns { session, items } or null. If a lesson visited
  // the station twice, its LAST visit wins — that's the freshest thinking.
  function prevStationUse(stationId) {
    if (!gCurrent || !stationId) return null;
    const i = gSessions.findIndex((s) => s.key === gCurrent.key);
    const from = i >= 0 ? i : gSessions.length;
    for (let j = from - 1; j >= 0; j--) {
      const s = gSessions[j];
      const plan = plansRef.current[s.key];   // j < i, so never the on-screen `selected`
      if (!plan) continue;
      const legIdxs = (s.legs || []).map((l, k) => (l.stationId === stationId ? k : -1)).filter((k) => k >= 0);
      for (let li = legIdxs.length - 1; li >= 0; li--) {
        const items = entriesForLeg(plan, s.legs, legIdxs[li]);
        if (items.length) return { session: s, items };
      }
    }
    return null;
  }

  // Precomputed per rotation, so the button can show the date it would copy from
  // (and go dim when there's nothing behind it yet).
  const prevByLeg = useMemo(() => {
    const out = {};
    gLegs.forEach((leg, i) => { out[i] = leg.stationId ? prevStationUse(leg.stationId) : null; });
    return out;
  }, [gSessions, gCurrent, gLegs, stationMap, selected]);

  const [planFlash, setPlanFlash] = useState("");
  const flashTimerRef = useRef(null);
  function flashPlan(msg) {
    setPlanFlash(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setPlanFlash(""), 5000);
  }

  // Copy that earlier rotation's skills into THIS rotation. Existing skills in the
  // block are kept (a copy tops it up, it never wipes) and the block is selected
  // afterwards, so the coach can immediately add the progression on top.
  function copyPreviousIntoLeg(legIdx) {
    const leg = gLegs[legIdx];
    if (!leg || !leg.stationId) return;
    const hit = prevStationUse(leg.stationId);
    if (!hit) { flashPlan(`Nothing to copy — no earlier lesson in this block has planned skills for ${leg.stationName || "this station"}.`); return; }
    setSelected((prev) => {
      const next = { ...prev };
      let ord = nextOrd(prev, legIdx);
      hit.items.slice().sort((a, b) => byOrd(a[1], b[1])).forEach(([id, v]) => {
        const base = id.slice(id.indexOf("|") + 1);   // drop the old slot prefix
        const nid = `${legIdx}|${base}`;
        next[nid] = { ...v, slot: legIdx, ord: (prev[nid] && typeof prev[nid].ord === "number") ? prev[nid].ord : ord++ };
      });
      return next;
    });
    setActiveSlot(legIdx);
    const n = hit.items.length;
    flashPlan(`Copied ${n} skill${n === 1 ? "" : "s"} from ${hit.session.dow} ${fmtShortDate(hit.session.date)} — the last time this squad was on ${leg.stationName || "this station"}.`);
  }

  function applyPrefillToRotation() {
    if (!gLegs.length || !gMappedLevel) return;
    const secs = gLegs.map((l) => stationMap[l.stationId]).filter(Boolean);
    if (prefillMode === "last") {
      const pk = prevSameSlotKey();
      const stored = pk ? (plansRef.current[pk] || {}) : {};
      if (Object.keys(stored).length) {
        setSelected((prev) => ({ ...prev, ...stored }));
        return;
      }
    }
    // Fresh suggestion: for each rotation leg, auto-tick that apparatus's
    // current-level ALP pathway skills into THAT leg's slot.
    setSelected((prev) => {
      const next = { ...prev };
      gLegs.forEach((leg, legIdx) => {
        const sectionName = stationMap[leg.stationId];
        if (!sectionName) return;
        const entries = CHALK_ALP.apparatus[sectionName];
        if (!entries) return;
        let ord = nextOrd(next, legIdx);
        entries.forEach((entry, idx) => {
          if (entry.t && entry.t[gAlpIdx] != null) {
            const key = `${legIdx}|ALP::${sectionName}::${idx}`;
            if (!next[key]) {
              const cues = [`Family: ${entry.f}`, `Difficulty: ${entry.d || "—"}`, `Pathway skill (auto-suggested)`];
              next[key] = { level: gMappedLevel, slot: legIdx, ord: ord++, section: sectionName, group: entry.f, name: entry.s, cues, img: [], color: APP_COLORS[sectionName] || NAVY, alp: true };
            }
          }
        });
      });
      return next;
    });
  }

  // ---- Word (.docx) export -------------------------------------------------
  // Builds the same document GymOrgPro exports, with Chalk's skills filled in.
  // Works for ANY dated session in the block (not just the one on screen), by
  // reading that session's saved plan out of the per-session store.
  const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function planFor(key) {
    // The session on screen holds its skills in `selected`; others come from the store.
    return (key === currentPlanKey) ? selected : (plansRef.current[key] || {});
  }

  function docxSpecFor(s) {
    const plan = planFor(s.key);
    const legs = s.legs || [];
    const groups = {};
    Object.entries(plan).forEach(([id, v]) => {
      let slot = v.slot;
      const valid = slot === "W" || slot === "D" || (typeof slot === "number" && slot >= 0 && slot < legs.length);
      if (!valid) {
        slot = v.section === "Warm-up" ? "W" : legs.findIndex((l) => stationMap[l.stationId] === v.section);
        if (slot < 0) slot = 0;
      }
      (groups[slot] = groups[slot] || []).push(v);
    });

    // A GymOrgPro safety note belongs in the Safety column, not the Skill one.
    const rowsOf = (arr, equip) => (arr || []).slice().sort(byOrd).map((v) => (
      v.gopNote && v.noteKind === "safety"
        ? { equipment: equip || v.section || "", skill: "Safety", sub: "", kcp: [], img: [], safety: [v.name].concat(v.cues || []).join(" ") }
        : {
            equipment: equip || v.section || "",
            skill: v.name,
            sub: v.group && v.group !== "General" ? v.group : "",
            kcp: v.cues || [],
            img: v.img || [],   // diagrams get embedded in the Word file
            safety: "",
          }
    ));

    const circuits = legs.map((leg, i) => ({
      title: `Circuit ${i + 1} \u2014 ${leg.gap ? "Open" : (leg.stationName || "Station")} \u2014 ${leg.minutes} mins`,
      rows: rowsOf(groups[i], leg.gap ? "" : leg.stationName),
    }));
    const hdr = GB.resolveHeader(gymorg, s.squadId, headerMap);
    const blockStart = gBlock ? new Date(gBlock.startDate + "T00:00:00Z") : null;
    const sDate = new Date(s.date + "T00:00:00Z");
    const week = blockStart ? Math.floor((sDate - blockStart) / 604800000) + 1 : "";
    // Warm-up / warm-down: the GymOrgPro items the coach KEPT become the
    // Activity/Duration rows; anything else they added becomes Skill/KCP rows.
    const wAll = groups["W"] || [], dAll = groups["D"] || [];
    const warmActs = wAll.filter((v) => v.gop).map((v) => ({ name: v.name, duration: v.duration }));
    const coolActs = dAll.filter((v) => v.gop && !v.gopNote).map((v) => ({ name: v.name, duration: v.duration }));
    const warmSkills = rowsOf(wAll.filter((v) => !v.gop), "Warm-up");
    const coolSkills = rowsOf(dAll.filter((v) => !v.gop), "Warm-down");

    return {
      spec: {
        banner: hdr && hdr.imageBase64 ? { base64: hdr.imageBase64, ext: hdr.ext, width: hdr.width, height: hdr.height } : null,
        term: gBlock ? gBlock.name : "",
        week: String(week),
        day: DAYS_FULL[s.weekday],
        date: `${MONTHS_FULL[Number(s.date.slice(5, 7)) - 1]} ${Number(s.date.slice(8, 10))}, ${s.date.slice(0, 4)}`,
        time: `${GB.fmtTime(s.startTime)} to ${GB.fmtTime(s.endTime)}`,
        squad: s.squadName,
        length: `${s.duration} min`,
        coach: s.coachName || "",
        assistant: s.assistantName || "",
        warmup: warmActs,
        warmdown: coolActs,
        warmupRows: warmSkills,
        warmdownRows: coolSkills,
        circuits,
        // The Notes box at the bottom: GymOrgPro's standing lesson-plan notes,
        // then anything the coach added for this lesson in Chalk.
        notes: notesFor(s.key),
      },
      filename: ChalkDocx.safeName(
        `${s.date.slice(0, 4)}_${s.squadName}_${gBlock ? gBlock.name : ""}_Week_${week}_${MONTHS_FULL[Number(s.date.slice(5, 7)) - 1]}_${Number(s.date.slice(8, 10))}_${DAYS_FULL[s.weekday]}`
      ) + ".docx",
      skillCount: Object.keys(plan).length,
    };
  }

  function exportOne() {
    if (!gCurrent) return;
    const { spec, filename } = docxSpecFor(gCurrent);
    ChalkDocx.saveDocx(spec, filename);
  }

  // scope: "squad" = this squad's lessons in the block, "all" = every lesson.
  // onlyPlanned: skip lessons with no skills chosen yet.
  function exportMany(scope, onlyPlanned) {
    const list = scope === "all" ? gAllDated : gSessions;
    let items = list.map((s) => docxSpecFor(s));
    if (onlyPlanned) items = items.filter((it) => it.skillCount > 0);
    if (!items.length) { alert("No planned lessons to export yet. Tick some skills first, or choose 'include empty'."); return; }
    const label = scope === "all" ? "All-squads" : (gSquad ? gSquad.name : "Squad");
    ChalkDocx.saveDocxZip(items, ChalkDocx.safeName(`${gBlock ? gBlock.name : "Block"}_${label}_lesson_plans`) + ".zip");
  }

  function goToSession(idx) { setGSessionIdx(Math.max(0, Math.min(idx, gSessions.length - 1))); }  function nextLesson() { if (gSessionIdx < gSessions.length - 1) setGSessionIdx(gSessionIdx + 1); }
  function prevLesson() { if (gSessionIdx > 0) setGSessionIdx(gSessionIdx - 1); }

  const planContext = gCurrent ? `${gSquad ? gSquad.name + " · " : ""}${gCurrent.dow} ${fmtShortDate(gCurrent.date)}` : "";
  const planProps = { gymorg, gCurrent, gSquad, gHeader, gLegs, stationMap, selected, setSelected, setLightbox, orderedSections, bySection, bySlot, targetSlot, focusSlot, level, focus, duration, copyPlan, printPlan, clearAll, planContext, selectedList, exportOne, exportMany, gSessions, gAllDated, prevByLeg, copyPreviousIntoLeg, planFlash, setPlanFlash, moveSkill, moveSkillTo, gopNotes, myNote, setMyNote };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", color: INK }} className="min-h-screen bg-slate-100">
      <header style={{ background: NAVY }} className="text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,.12)" }}><IconDumbbell size={20} /></div>
          <div>
            <div className="disp text-xl font-bold tracking-wide leading-none">CHALK <span className="text-[11px] font-semibold align-middle text-indigo-200 tracking-normal">{APP_VERSION}</span></div>
            <div className="text-[11px] uppercase tracking-[2px] text-indigo-200">Session Builder</div>
          </div>
          <button onClick={() => setGymorgOpen((o) => !o)}
            className="ml-auto disp text-sm font-semibold px-3 py-1.5 rounded-full border flex items-center gap-1.5"
            style={gymorgOpen ? { background: "#fff", color: NAVY, borderColor: "#fff" } : { background: "rgba(255,255,255,.1)", borderColor: "rgba(255,255,255,.3)", color: "#fff" }}>
            <IconLayers size={14} /> GymOrgPro {gymorg ? "· connected" : ""}
          </button>
        </div>
      </header>

      {/* Opened from a lesson in GymOrgPro's calendar (?roster=&block=&squad=&session=&date=) */}
      {deepLink === "loading" && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Opening this lesson from GymOrgPro&hellip;
          </div>
        </div>
      )}
      {deepLink === "done" && gCurrent && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 flex items-center gap-2">
            <IconLayers size={14} />
            <span><b>{gCurrent.squadName}</b> &middot; {gCurrent.dow} {fmtShortDate(gCurrent.date)} &middot; opened from GymOrgPro. Skills you tick are saved in Chalk; GymOrgPro&rsquo;s schedule is never changed.</span>
            <button onClick={() => setDeepLink("")} className="ml-auto text-emerald-700/70 hover:text-emerald-900 font-bold px-1">&times;</button>
          </div>
        </div>
      )}

      {gymorgOpen && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <GymOrgPanel
            gymorg={gymorg} gymorgError={gymorgError} fileInputRef={fileInputRef} handleFile={handleFile}
            gBlockId={gBlockId} setGBlockId={setGBlockId} gSquadId={gSquadId} setGSquadId={setGSquadId}
            gSessions={gSessions} gSessionIdx={gSessionIdx} goToSession={goToSession}
            gLegs={gLegs} stationMap={stationMap} setStationMap={setStationMap}
            headerMap={headerMap} setHeaderMap={setHeaderMap} gHeader={gHeader}
            gSquad={gSquad} squadMap={squadMap} setSquadMap={setSquadMap}
            alpMap={alpMap} setAlpMap={setAlpMap} gAlpIdx={gAlpIdx}
            prefillMode={prefillMode} setPrefillMode={setPrefillMode}
            jumpToLeg={jumpToLeg} applyPrefillToRotation={applyPrefillToRotation}
            nextLesson={nextLesson} prevLesson={prevLesson}
            activeTab={tab} setFocus={setFocus} setDuration={setDuration}
            liveRosters={liveRosters} liveRosterId={liveRosterId} liveStatus={liveStatus}
            connectLive={connectLive} selectLiveRoster={selectLiveRoster}
          />
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-5 grid lg:grid-cols-2 gap-5 items-start">
        {/* LEFT — the lesson plan, stepping down through warm-up and rotations */}
        <div className="min-w-0 order-1"><LessonPlanDoc {...planProps} /></div>

        {/* RIGHT — skill selector; tick a skill and it drops into the selected block */}
        <div className="min-w-0 order-2">
          {hasSession && targetLabel && (
            <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2 text-[12px]">
              <span className="text-slate-400 uppercase tracking-wide font-semibold text-[10px]">Adding to</span>
              <span className="disp font-bold truncate" style={{ color: NAVY }}>{targetLabel}</span>
              <span className="ml-auto text-slate-400">any apparatus &rarr; this block</span>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Squad level</span>
                <select value={level} onChange={(e) => setLevel(e.target.value)} className="disp text-lg font-semibold bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 min-w-[190px]">
                  {Object.entries(streamGroups).map(([stream, levels]) => (
                    <optgroup key={stream} label={STREAM_LABELS[stream] || stream}>
                      {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Session focus (optional)</span>
                <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. handstand shape, safe landings" className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mins</span>
                <input value={duration} onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {tabList.map((y) => {
              const active = y === tab; const c = colorFor(y); const n = (bySection[y] || []).length;
              return (
                <button key={y} onClick={() => { setTab(y); setSearch(""); }}
                  className="disp text-sm font-semibold px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5"
                  style={active ? { background: c, borderColor: c, color: "#fff" } : { background: "#fff", borderColor: "#e2e8f0", color: "#334155" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: active ? "#fff" : c }} />
                  {y}
                  {n > 0 && <span className="text-[11px] rounded-full px-1.5 leading-4" style={active ? { background: "rgba(255,255,255,.25)" } : { background: c, color: "#fff" }}>{n}</span>}
                </button>
              );
            })}
            <button onClick={() => setLibOpen(true)} title="Edit the skill database — rename skills, rewrite coaching points, add your own, map them to other apparatus"
              className="disp text-sm font-semibold px-3 py-1.5 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-700 flex items-center gap-1.5">
              <IconEdit size={14} /> Edit skills
              {libStats.added + libStats.edited > 0 && (
                <span className="text-[11px] rounded-full px-1.5 leading-4 bg-slate-200 text-slate-700">{libStats.added + libStats.edited}</span>
              )}
            </button>
          </div>

          {apparatusHasAlp && (
            <div className="flex items-center gap-1 mb-3 bg-white border border-slate-200 rounded-lg p-1 w-max">
              {[["club", "Club skills"], ["alp", "ALP Pathway"]].map(([y, label]) => (
                <button key={y} onClick={() => setMode(y)} className="disp text-sm font-semibold px-3 py-1 rounded-md flex items-center gap-1.5"
                  style={mode === y ? { background: color, color: "#fff" } : { color: "#475569" }}>
                  {y === "alp" ? <IconLayers size={14} /> : <IconDumbbell size={14} />} {label}
                </button>
              ))}
            </div>
          )}

          {mode === "alp" && apparatusHasAlp ? (
            <AlpView app={tab} color={color} alpIdx={alpIdx} setAlpIdx={setAlpIdx} alpFilter={alpFilter} setAlpFilter={setAlpFilter} selected={selected} toggleAlp={toggleAlpSkill} level={level} slotKey={slotKey} />
          ) : (
            <>
              <div className="relative mb-3">
                <IconSearch size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab.toLowerCase()} skills & coaching points…`} className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm" />
              </div>
              <div className="space-y-4 pb-24 lg:pb-4">
                {filteredSections.length === 0 && (
                  <div className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center">No skills match &ldquo;{search}&rdquo;. Try another word or clear the search.</div>
                )}
                {filteredSections.map((sec, secIdx) => (
                  <div key={sec.group + secIdx}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-1.5 h-4 rounded" style={{ background: color }} />
                      <h3 className="disp text-[15px] font-bold uppercase tracking-wide text-slate-700">{sec.group}</h3>
                      <span className="text-[11px] text-slate-400">{sec.skills.length}</span>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                      {sec.skills.map((sk) => {
                        // Custom skills have no baseline indices, so they carry
                        // their own permanent key. Everything else is keyed on
                        // its HOME apparatus (_kt), not the tab it's being shown
                        // on — so ticking a mapped skill on Beam and on Floor is
                        // the same tick, and v5 plans still resolve unchanged.
                        const key = sk._ck || skillKey(level, sk._kt || tab, sk._gi, sk._si);
                        const isSel = !!selected[slotKey(key)];
                        const open = !!openCues[key];
                        return (
                          <div key={key} className="px-3 py-2.5">
                            <div className="flex items-start gap-3">
                              <button onClick={() => toggleSkill(sk._kt || tab, sk._gi, sk._si, sec, sk)} aria-pressed={isSel}
                                className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
                                style={isSel ? { background: color, borderColor: color } : { borderColor: "#cbd5e1" }}>
                                {isSel && <IconCheck size={14} color="#fff" strokeWidth={3} />}
                              </button>
                              {sk.img && sk.img.length > 0 && (
                                <button onClick={() => setLightbox({ imgs: sk.img, name: sk.name })} className="shrink-0 w-12 h-12 rounded-md border border-slate-200 bg-white overflow-hidden flex items-center justify-center hover:border-slate-400" title="View diagram">
                                  <img src={imgSrc(sk.img[0])} alt="" className="max-w-full max-h-full object-contain" />
                                </button>
                              )}
                              <div className="min-w-0 flex-1">
                                <button onClick={() => toggleSkill(sk._kt || tab, sk._gi, sk._si, sec, sk)} className="text-left text-sm text-slate-800 leading-snug block w-full">
                                  {sk.name}
                                  {/* This skill lives on another apparatus and was mapped here.
                                      Say so, or a coach wonders why a Floor drill is in the Beam list. */}
                                  {sk._via && (
                                    <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5" style={{ background: "#f1f5f9", color: colorFor(sk._via) }}>{sk._via}</span>
                                  )}
                                </button>
                                <div className="flex items-center gap-3 mt-0.5">
                                  {(sk.cues || []).length > 0 && (
                                    <button onClick={() => setOpenCues((p) => ({ ...p, [key]: !p[key] }))} className="text-[11px] font-medium inline-flex items-center gap-0.5" style={{ color }}>
                                      <IconChevronRight size={12} className={open ? "rotate-90 transition-transform" : "transition-transform"} /> {sk.cues.length} coaching {sk.cues.length === 1 ? "point" : "points"}
                                    </button>
                                  )}
                                  {sk.img && sk.img.length > 1 && <span className="text-[11px] text-slate-400 inline-flex items-center gap-0.5"><IconImage size={11} /> {sk.img.length} diagrams</span>}
                                </div>
                                {open && <ul className="mt-1 ml-1 space-y-0.5 border-l-2 pl-3" style={{ borderColor: color + "44" }}>{sk.cues.map((c, i) => <li key={i} className="text-xs text-slate-500 leading-snug">{c}</li>)}</ul>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {libOpen && (
        <SkillsLibrary
          level={level} setLevel={setLevel} tab={tab} setTab={setTab}
          streamGroups={streamGroups} onClose={() => setLibOpen(false)}
        />
      )}

      {lightbox && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="bg-white rounded-xl p-4 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="disp font-bold text-slate-800 leading-tight">{lightbox.name}</div>
              <button onClick={() => setLightbox(null)} className="p-1 text-slate-400 hover:text-slate-700"><IconX size={20} /></button>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">{lightbox.imgs.map((y, i) => <img key={i} src={imgSrc(y)} alt="" className="max-h-72 object-contain border border-slate-200 rounded-lg bg-white p-2" />)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------- plan blocks ---
// These three live at MODULE scope on purpose. While they were declared INSIDE
// LessonPlanDoc they were a brand-new component type on every render, so React
// couldn't match them up between renders: it tore the whole lesson plan down and
// rebuilt it every time a skill was ticked. The scrolling container's content
// briefly went to zero height, which pins scrollTop back to 0 — so the plan
// jumped up to the warm-up / earlier rotations and away from the rotation being
// worked on. Stable component types => React patches the rows in place, the
// scroll position holds, and the selected rotation stays where the coach is.
const NOTE_LABEL = { kcp: "GymOrgPro note", safety: "GymOrgPro safety", warmdown: "GymOrgPro note" };

// The drag handle (and keyboard reorder) is only wired up inside a rotation
// block, where an order actually means something — in the no-session view skills
// just group by apparatus.
function SkillRow({ sk, index, onDragStart, dragging, onMove, onRemove, setLightbox }) {
  return (
    <li ref={(el) => onDragStart && onDragStart.register(index, el)}
      className={`group flex items-start gap-2 text-[13px] text-slate-700 py-1 ${dragging ? "opacity-60" : ""}`}
      style={dragging ? { background: "#f8fafc", borderRadius: 6 } : undefined}>
      {sk.img && sk.img.length > 0
        ? <button onClick={() => setLightbox({ imgs: sk.img, name: sk.name })} className="mt-0.5 w-8 h-8 rounded border border-slate-200 overflow-hidden shrink-0 bg-white flex items-center justify-center"><img src={imgSrc(sk.img[0])} alt="" className="max-w-full max-h-full object-contain" /></button>
        : <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sk.color || NAVY }} />}
      <div className="flex-1 min-w-0">
        <div className="leading-snug font-medium text-slate-800">
          {sk.gopNote && (
            <span className="mr-1.5 align-middle text-[9px] font-bold uppercase tracking-wide rounded px-1 py-0.5"
              style={sk.noteKind === "safety" ? { background: "#fef3c7", color: "#92400e" } : { background: "#e2e8f0", color: "#475569" }}
              title="Typed into GymOrgPro's lesson plan — edit it there and it re-syncs">
              {NOTE_LABEL[sk.noteKind] || "GymOrgPro note"}
            </span>
          )}
          {sk.name}{sk.duration ? <span className="ml-1.5 text-[11px] font-semibold text-slate-400">{sk.duration} min</span> : null}
        </div>
        {(sk.cues || []).length > 0 && <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{sk.cues.join(" · ")}</div>}
      </div>
      {onDragStart && (
        // Pointer events (not HTML5 drag-and-drop) so this works with a finger on
        // a tablet as well as a mouse. touch-none stops the drag from scrolling
        // the page instead of moving the row.
        <span
          onPointerDown={(e) => onDragStart(e, sk.id, index)}
          onKeyDown={(e) => {
            if (!onMove) return;
            if (e.key === "ArrowUp") { e.preventDefault(); onMove(sk.id, -1); }
            if (e.key === "ArrowDown") { e.preventDefault(); onMove(sk.id, 1); }
          }}
          role="button" tabIndex={0} aria-label="Drag to reorder"
          title="Drag to reorder (or focus and use ↑ / ↓)"
          className="shrink-0 mt-0.5 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing touch-none select-none">
          <IconGrip size={14} />
        </span>
      )}
      <button onClick={() => onRemove(sk.id)} className="text-slate-300 hover:text-red-500 shrink-0 mt-0.5" title="Remove"><IconX size={14} /></button>
    </li>
  );
}

// The plain (no GymOrgPro session) block: skills grouped by apparatus.
function PlanBlock({ title, color, minutes, skills, onFocus, subtitle, empty, onRemove, setLightbox }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button onClick={onFocus || undefined} disabled={!onFocus} className="w-full flex items-center gap-2 px-3 py-2 text-left disabled:cursor-default" style={{ background: (color || NAVY) + "14" }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color || NAVY }} />
        <span className="disp text-[13px] font-bold uppercase tracking-wide truncate" style={{ color: color || NAVY }}>{title}</span>
        {minutes != null && <span className="text-[11px] text-slate-500 shrink-0">{minutes} min</span>}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {skills && skills.length > 0 && <span className="text-[11px] text-slate-400">{skills.length}</span>}
          {onFocus && <span className="text-[11px] font-semibold inline-flex items-center" style={{ color: color || NAVY }}>Add<IconChevronRight size={13} /></span>}
        </span>
      </button>
      <div className="px-3 py-2">
        {subtitle && <div className="text-[11px] text-slate-400 mb-1 leading-snug">{subtitle}</div>}
        {skills && skills.length > 0
          ? <ul className="divide-y divide-slate-100">{skills.map((sk) => <SkillRow key={sk.id} sk={sk} onRemove={onRemove} setLightbox={setLightbox} />)}</ul>
          : <div className="text-[12px] text-slate-400 italic py-1">{empty || "No skills yet."}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- notes ----
// The Notes box at the bottom of the lesson plan, mirroring the Notes box at
// the bottom of the printed/Word document. Two halves:
//
//   • GymOrgPro's standing notes — typed into "Lesson Plan Notes" on its Lesson
//     Plans tab, between Warm-up and Warm-down. Read-only here (GymOrgPro is
//     the source of truth); edit them there and they re-sync live.
//   • This lesson's own notes — Chalk's, saved per dated session.
//
// Both print into the Notes box of the exported document, standing notes first.
// Defined at module scope, like the other blocks, so React updates it in place
// instead of throwing the plan away on every keystroke (see v5.7.1).
function NotesBlock({ gopNotes, value, onChange }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="w-full flex items-center gap-2 px-3 py-2" style={{ background: "#64748b14" }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#64748b" }} />
        <span className="disp text-[13px] font-bold uppercase tracking-wide" style={{ color: "#64748b" }}>Notes</span>
        <span className="ml-auto text-[10px] text-slate-400 shrink-0">Bottom of the lesson plan</span>
      </div>
      <div className="px-3 py-2 space-y-2">
        {gopNotes ? (
          <div className="rounded-md bg-slate-50 border border-slate-200 px-2.5 py-2">
            <span className="inline-block text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 mb-1" style={{ background: "#e2e8f0", color: "#475569" }}>
              GymOrgPro note
            </span>
            <p className="text-[12px] text-slate-600 leading-snug whitespace-pre-wrap">{gopNotes}</p>
          </div>
        ) : (
          <div className="text-[12px] text-slate-400 italic">
            No standing notes set in GymOrgPro (Lesson Plans → Lesson Plan Notes).
          </div>
        )}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Notes for this lesson only — added underneath the gym's notes in the Word export."
          className="w-full text-[12px] text-slate-700 leading-snug rounded-md border border-slate-200 px-2.5 py-2 resize-y focus:outline-none focus:border-slate-400"
        />
      </div>
    </div>
  );
}

// A block that can be SELECTED as the target for new skills. Whatever block is
// selected receives every skill you tick, from any apparatus.
function SlotBlock({ slotId, stationId, title, color, minutes, skills, subtitle, empty, prev, onCopyPrev, targetSlot, focusSlot, moveSkill, moveSkillTo, onRemove, setLightbox }) {
  const active = targetSlot === slotId;
  const c = color || NAVY;

  // ---- drag to reorder ------------------------------------------------------
  // Pointer events, not HTML5 drag-and-drop: HTML5 drag doesn't fire on touch, and
  // coaches are on tablets mid-session. The landing spot is recomputed live from
  // the rows' own rectangles as the finger/mouse moves, so the gap follows your
  // thumb; the plan itself is only rewritten on release.
  const rowEls = useRef({});                 // display index -> <li>
  const dragRef = useRef(null);              // { id, from, to } while dragging
  const [drag, setDrag] = useState(null);    // mirrored into state to re-render

  const startDrag = (e, id, index) => {
    if (!moveSkillTo) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    dragRef.current = { id, from: index, to: index };
    setDrag({ id, from: index, to: index });

    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const y = ev.clientY;
      // Nudge the lesson-plan column along at its edges, so a row can travel
      // further than one screenful.
      const sc = handle.closest ? handle.closest("[data-plan-scroll]") : null;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (y < r.top + 48) sc.scrollTop -= 12;
        else if (y > r.bottom - 48) sc.scrollTop += 12;
      }
      let to = d.to;
      for (let i = 0; i < skills.length; i++) {
        const el = rowEls.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) { to = i; break; }
        to = i;
      }
      if (to !== d.to) { dragRef.current = { ...d, to }; setDrag({ ...d, to }); }
    };
    const end = (ev) => {
      const d = dragRef.current;
      dragRef.current = null;
      try { handle.releasePointerCapture(ev.pointerId); } catch (err) { /* noop */ }
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDrag(null);
      if (d && d.to !== d.from) moveSkillTo(slotId, d.id, d.to);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };
  startDrag.register = (i, el) => { if (el) rowEls.current[i] = el; else delete rowEls.current[i]; };

  // What's on screen mid-drag: the list with the dragged row already sitting where
  // it would land.
  const display = (() => {
    if (!drag) return skills;
    const arr = (skills || []).slice();
    const [item] = arr.splice(drag.from, 1);
    if (!item) return skills;
    arr.splice(drag.to, 0, item);
    return arr;
  })();
  // The header is a div (not a button) because "Copy previous" is a button of
  // its own, and a button can't legally nest inside another button.
  const select = () => focusSlot(slotId, stationId);
  return (
    <div className="rounded-lg overflow-hidden border transition-shadow" style={active ? { borderColor: c, boxShadow: `0 0 0 2px ${c}33` } : { borderColor: "#e2e8f0" }}>
      <div role="button" tabIndex={0} onClick={select}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer select-none" style={{ background: c + (active ? "26" : "14") }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
        <span className="disp text-[13px] font-bold uppercase tracking-wide truncate" style={{ color: c }}>{title}</span>
        {minutes != null && <span className="text-[11px] text-slate-500 shrink-0">{minutes} min</span>}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {skills && skills.length > 0 && <span className="text-[11px] text-slate-400">{skills.length}</span>}
          {onCopyPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopyPrev(); }}
              disabled={!prev}
              title={prev
                ? `Copy the ${prev.items.length} skill${prev.items.length === 1 ? "" : "s"} planned for this station on ${prev.session.dow} ${fmtShortDate(prev.session.date)}`
                : "No earlier lesson in this block has planned skills for this station yet"}
              className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-default"
              style={{ color: c, borderColor: c + "55", background: "#ffffffcc" }}>
              <IconRefresh size={10} />
              <span className="hidden sm:inline">Copy previous</span><span className="sm:hidden">Copy</span>
              {prev && <span className="font-normal opacity-70">{fmtShortDate(prev.session.date)}</span>}
            </button>
          )}
          {active
            ? <span className="text-[10px] font-bold uppercase tracking-wide text-white rounded px-1.5 py-0.5" style={{ background: c }}>Adding here</span>
            : <span className="text-[11px] font-semibold inline-flex items-center" style={{ color: c }}>Select<IconChevronRight size={13} /></span>}
        </span>
      </div>
      <div className="px-3 py-2">
        {subtitle && <div className="text-[11px] text-slate-400 mb-1 leading-snug">{subtitle}</div>}
        {display && display.length > 0
          ? <ul className="divide-y divide-slate-100">{display.map((sk, i) => (
              <SkillRow key={sk.id} sk={sk} index={i} onRemove={onRemove} setLightbox={setLightbox}
                onDragStart={moveSkillTo ? startDrag : null}
                dragging={!!drag && drag.id === sk.id}
                onMove={moveSkill ? ((id, dir) => moveSkill(slotId, id, dir)) : null} />
            ))}</ul>
          : <div className="text-[12px] text-slate-400 italic py-1">{empty || "No skills yet."}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- session plan --
function LessonPlanDoc({ gymorg, gCurrent, gSquad, gHeader, gLegs, stationMap, selected, setSelected, setLightbox, orderedSections, bySection, bySlot, targetSlot, focusSlot, level, focus, duration, copyPlan, printPlan, clearAll, planContext, selectedList, exportOne, exportMany, gSessions, gAllDated, prevByLeg, copyPreviousIntoLeg, planFlash, setPlanFlash, moveSkill, moveSkillTo, gopNotes, myNote, setMyNote }) {
  const hasSession = !!(gLegs && gLegs.length);
  const remove = (id) => setSelected((prev) => { const n = { ...prev }; delete n[id]; return n; });
  const headerUri = gHeader ? GB.headerDataUri(gHeader) : "";
  const warmupRef = ((gymorg && gymorg.warmup) || []).map((w) => `${(w.name || "").trim()}${w.duration ? ` (${w.duration}m)` : ""}`).filter(Boolean).join(" · ");
  const warmdownRef = ((gymorg && gymorg.warmdown) || []).map((w) => `${(w.name || "").trim()}${w.duration ? ` (${w.duration}m)` : ""}`).filter(Boolean).join(" · ");
  const warmdown = (gymorg && gymorg.warmdown) || [];
  // What the (module-scope) blocks need from this component.
  const blockProps = { targetSlot, focusSlot, moveSkill, moveSkillTo, onRemove: remove, setLightbox };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="text-white" style={{ background: NAVY }}>
        {headerUri && <img src={headerUri} alt="" className="w-full h-auto max-h-24 object-contain object-left bg-white" />}
        <div className="px-4 py-3">
          <div className="disp font-bold text-lg leading-tight">{hasSession && gSquad ? gSquad.name : "Session Plan"}</div>
          {hasSession
            ? <div className="text-[12px] text-indigo-200">{planContext}{gCurrent && gCurrent.coachName ? ` · Coach ${gCurrent.coachName}` : ""}{gCurrent ? ` · ${gCurrent.duration} min` : ""} · {selectedList.length} skill{selectedList.length === 1 ? "" : "s"}</div>
            : <div className="text-[12px] text-indigo-200">{level}{focus ? ` · ${focus}` : ""} · {duration} min · {selectedList.length} skill{selectedList.length === 1 ? "" : "s"}</div>}
        </div>
      </div>

      <div data-plan-scroll className="max-h-[70vh] lg:max-h-[calc(100vh-9rem)] overflow-auto p-3 space-y-2.5">
        {planFlash && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 flex items-start gap-2">
            <span className="flex-1 leading-snug">{planFlash}</span>
            <button onClick={() => setPlanFlash && setPlanFlash("")} className="text-slate-400 hover:text-slate-700 shrink-0"><IconX size={12} /></button>
          </div>
        )}
        {hasSession ? (
          <>
            <SlotBlock slotId="W" title="Warm-up" color={APP_COLORS["Warm-up"] || NAVY} skills={bySlot["W"] || []}
              {...blockProps} empty="Select this block, then add any skills." />
            {gLegs.map((leg, i) => {
              const app = stationMap[leg.stationId];
              return (
                <SlotBlock key={i} slotId={i} stationId={leg.stationId}
                  title={`Rotation ${i + 1} · ${leg.gap ? "Break / free time" : (leg.stationName || "Station")}`}
                  color={APP_COLORS[app] || NAVY} minutes={leg.minutes} skills={bySlot[i] || []}
                  prev={(prevByLeg && prevByLeg[i]) || null}
                  onCopyPrev={leg.gap || !copyPreviousIntoLeg ? null : () => copyPreviousIntoLeg(i)}
                  {...blockProps} empty="Select this block, then add any skills." />
              );
            })}
            <SlotBlock slotId="D" title="Warm-down" color="#64748b" skills={bySlot["D"] || []}
              {...blockProps} empty="Select this block, then add any skills." />
            <NotesBlock gopNotes={gopNotes} value={myNote} onChange={setMyNote} />
          </>
        ) : (
          orderedSections.length === 0
            ? <p className="text-sm text-slate-400 text-center py-8">Tick skills in the selector to build the session.<br />They&rsquo;ll appear here grouped by section.</p>
            : <>
                {orderedSections.map((sec) => <PlanBlock key={sec} title={sec} color={APP_COLORS[sec] || NAVY} skills={bySection[sec] || []} onFocus={null} onRemove={remove} setLightbox={setLightbox} />)}
                <NotesBlock gopNotes={gopNotes} value={myNote} onChange={setMyNote} />
              </>
        )}
      </div>

      <div className="border-t border-slate-100 p-2.5 space-y-2">
        {hasSession && (
          <>
            <button onClick={exportOne} className="w-full disp font-semibold text-sm text-white rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ background: NAVY }}>
              <IconDownload size={15} /> Export this lesson (Word)
            </button>
            <div className="flex gap-2">
              <button onClick={() => exportMany("squad", true)} className="flex-1 text-[12px] font-semibold rounded-lg border border-slate-300 text-slate-600 py-1.5 hover:border-slate-400" title="One .docx per planned lesson for this squad, zipped">
                Export squad&rsquo;s block ({(gSessions || []).length})
              </button>
              <button onClick={() => exportMany("all", true)} className="flex-1 text-[12px] font-semibold rounded-lg border border-slate-300 text-slate-600 py-1.5 hover:border-slate-400" title="One .docx per planned lesson across every squad in the block, zipped">
                Export whole block ({(gAllDated || []).length})
              </button>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <button onClick={printPlan} disabled={!selectedList.length} className={`${hasSession ? "flex-1 text-[12px] py-1.5 border border-slate-300 text-slate-600 font-semibold rounded-lg" : "flex-1 disp font-semibold text-sm text-white rounded-lg py-2"} flex items-center justify-center gap-1.5 disabled:opacity-40`} style={hasSession ? undefined : { background: NAVY }}><IconPrinter size={15} /> Print / PDF</button>
          <button onClick={copyPlan} disabled={!selectedList.length} className="px-3 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40" title="Copy as text"><IconCopy size={15} /></button>
          <button onClick={clearAll} disabled={!selectedList.length} className="px-3 rounded-lg border border-slate-300 text-slate-600 hover:text-red-500 disabled:opacity-40" title="Clear all"><IconTrash size={15} /></button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ALP view -
function AlpView({ app, color, alpIdx, setAlpIdx, alpFilter, setAlpFilter, selected, toggleAlp, level, slotKey }) {
  const cols = CHALK_ALP.cols || [];
  const entries = CHALK_ALP.apparatus[app] || [];
  const col = cols[alpIdx] || {};
  const grouped = {};
  entries.forEach((entry, i) => {
    const levels = Object.keys(entry.t).map(Number).sort((a, b) => a - b);
    let status = "none", score = null;
    if (entry.t[alpIdx] != null) { status = "current"; score = entry.t[alpIdx]; }
    else if (levels.length && levels[0] > alpIdx) { status = "stretch"; score = entry.t[levels[0]]; }
    else if (levels.length && levels[levels.length - 1] < alpIdx) { status = "support"; score = entry.t[levels[levels.length - 1]]; }
    const lo = levels.length ? levels[0] : null, hi = levels.length ? levels[levels.length - 1] : null;
    let show = true;
    if (alpFilter === "current") show = status === "current";
    else if (alpFilter === "range") show = status === "current" || (status === "stretch" && lo === alpIdx + 1) || (status === "support" && hi === alpIdx - 1);
    (grouped[entry.f] = grouped[entry.f] || []).push({ ...entry, i, status, score, show });
  });
  return (
    <div className="pb-24 lg:pb-4">
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
        <div className="flex items-center gap-2 mb-2"><IconTarget size={15} style={{ color }} /><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Group working level (ALP)</span></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAlpIdx(Math.max(0, alpIdx - 1))} disabled={alpIdx === 0} className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 disabled:opacity-30"><IconChevronLeft size={16} /></button>
          <div className="flex-1 text-center"><div className="disp text-lg font-bold leading-none" style={{ color }}>{col.level}</div><div className="text-[11px] text-slate-500">{col.age} years</div></div>
          <button onClick={() => setAlpIdx(Math.min(cols.length - 1, alpIdx + 1))} disabled={alpIdx === cols.length - 1} className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 disabled:opacity-30"><IconChevronRight size={16} /></button>
        </div>
        <div className="flex gap-0.5 mt-2">{cols.map((c, i) => <button key={i} onClick={() => setAlpIdx(i)} title={`${c.level} · ${c.age}`} className="flex-1 h-1.5 rounded-full" style={{ background: i === alpIdx ? color : "#e2e8f0" }} />)}</div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1">{[["current", "This level"], ["range", "± 1 level"], ["all", "Full pathway"]].map(([v, label]) => (
            <button key={v} onClick={() => setAlpFilter(v)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md border" style={alpFilter === v ? { background: color, borderColor: color, color: "#fff" } : { borderColor: "#e2e8f0", color: "#64748b" }}>{label}</button>
          ))}</div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">{[1, 2, 3, 4].map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: SCORE_STYLE[s].bg }} />{SCORE_STYLE[s].label}</span>)}</div>
        </div>
      </div>
      <div className="space-y-4">
        {Object.entries(grouped).map(([fam, list]) => {
          const visible = list.filter((x) => x.show);
          if (!visible.length) return null;
          return (
            <div key={fam}>
              <div className="flex items-center gap-2 mb-1.5"><span className="w-1.5 h-4 rounded" style={{ background: color }} /><h3 className="disp text-[15px] font-bold uppercase tracking-wide text-slate-700">{fam}</h3><span className="text-[11px] text-slate-400">{visible.length}</span></div>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {visible.map((entry) => {
                  const key = `ALP::${app}::${entry.i}`;
                  const isSel = !!selected[slotKey ? slotKey(key) : key];
                  const tag = entry.status === "stretch" ? { t: "Stretch", c: "#7c3aed" } : entry.status === "support" ? { t: "Support", c: "#0d9488" } : null;
                  return (
                    <div key={key} className="px-3 py-2.5" style={{ opacity: entry.status === "none" ? 0.5 : 1 }}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleAlp(app, entry.i, entry, col.level)} aria-pressed={isSel} className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0" style={isSel ? { background: color, borderColor: color } : { borderColor: "#cbd5e1" }}>{isSel && <IconCheck size={14} color="#fff" strokeWidth={3} />}</button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => toggleAlp(app, entry.i, entry, col.level)} className="text-left text-sm font-medium text-slate-800 leading-snug">{entry.s}</button>
                            {entry.d && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#f1f5f9", color: "#475569" }}>{entry.d}</span>}
                            {tag && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: tag.c + "1a", color: tag.c }}>{tag.t}</span>}
                          </div>
                          <div className="flex gap-0.5 mt-1.5">{cols.map((c, ci) => { const s = entry.t[ci]; return <div key={ci} title={`${c.level} (${c.age}): ${s ? SCORE_STYLE[s].label : "—"}`} className="flex-1 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold" style={{ background: s ? SCORE_STYLE[s].bg : "#f8fafc", color: s ? SCORE_STYLE[s].fg : "#cbd5e1", border: ci === alpIdx ? `2px solid ${color}` : "1px solid #eef2f6" }}>{s || ""}</div>; })}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- GymOrgPro --
function GymOrgPanel(props) {
  const {
    gymorg, gymorgError, fileInputRef, handleFile,
    gBlockId, setGBlockId, gSquadId, setGSquadId,
    gSessions, gSessionIdx, goToSession,
    gLegs, stationMap, setStationMap, gSquad, squadMap, setSquadMap,
    headerMap, setHeaderMap, gHeader,
    alpMap, setAlpMap, gAlpIdx, prefillMode, setPrefillMode,
    jumpToLeg, applyPrefillToRotation, nextLesson, prevLesson, activeTab,
    liveRosters, liveRosterId, liveStatus, connectLive, selectLiveRoster,
  } = props;

  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDated = (s) => {
    const parts = String(s.date || "").split("-");
    const dm = parts.length === 3 ? `${+parts[2]} ${MON[+parts[1] - 1]}` : s.date;
    const lbl = s.session && s.session.label && s.session.label !== "Session" ? ` (${s.session.label})` : "";
    return `${s.dow} ${dm} · ${GB.fmtTime(s.startTime)}${lbl}`;
  };

  if (!gymorg) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center gap-2 mb-1"><IconLayers size={16} style={{ color: NAVY }} /><h3 className="disp font-bold text-slate-800">Import from GymOrgPro</h3></div>
        <p className="text-sm text-slate-500 mb-3">Connect straight to GymOrgPro to pull a squad&rsquo;s rotation automatically &mdash; no export or import. Every change saved in GymOrgPro updates here live. Offline, load a backup .json instead.</p>
        {LIVE && LIVE.available() && liveRosters === null && (
          <button onClick={connectLive} disabled={liveStatus === "connecting"} className="disp font-semibold text-sm text-white rounded-lg py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-50" style={{ background: NAVY }}><IconRefresh size={15} /> {liveStatus === "connecting" ? "Connecting\u2026" : "Connect to GymOrgPro"}</button>
        )}
        {liveRosters !== null && (
          <div className="flex flex-col gap-2 mb-1">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Roster</span>
              <select value={liveRosterId} onChange={(e) => selectLiveRoster(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">&mdash; choose a roster &mdash;</option>
                {Object.keys(liveRosters).filter((id) => !(liveRosters[id] && liveRosters[id].hidden)).map((id) => <option key={id} value={id}>{(liveRosters[id] && liveRosters[id].name) || id}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="text-[13px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"><IconUpload size={13} /> Or load a backup .json (offline)</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
        </div>
        {gymorgError && <p className="text-sm text-red-600 mt-2">{gymorgError}</p>}
      </div>
    );
  }

  const blocks = gymorg.blocks;
  const squads = gymorg.squads;
  const gCurrent = gSessions[gSessionIdx] || gSessions[0] || null;
  const stationsUsed = Array.from(new Set((gLegs || []).map((l) => l.stationId))).map((id) => gymorg.stations.find((s) => s.id === id)).filter(Boolean);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3"><IconLayers size={16} style={{ color: NAVY }} /><h3 className="disp font-bold text-slate-800">GymOrgPro{gymorg.gymName ? ` · ${gymorg.gymName}` : ""}</h3>
        {liveStatus === "live" && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live</span>
        )}
        {liveRosters !== null ? (
          <select value={liveRosterId} onChange={(e) => selectLiveRoster(e.target.value)} className="ml-auto text-[11px] bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-600">
            {Object.keys(liveRosters).filter((id) => !(liveRosters[id] && liveRosters[id].hidden)).map((id) => <option key={id} value={id}>{(liveRosters[id] && liveRosters[id].name) || id}</option>)}
          </select>
        ) : (
          <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="ml-auto text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><IconUpload size={12} /> Replace file</button>
        )}
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1"><IconCalendar size={12} /> Block</span>
          <select value={gBlockId} onChange={(e) => setGBlockId(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.startDate ? ` (${b.startDate} – ${b.endDate})` : ""}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1"><IconUsers size={12} /> Squad</span>
          <select value={gSquadId} onChange={(e) => setGSquadId(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {gSquad && (
        <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
          <label className="flex items-center gap-1.5 text-slate-600">Maps to Chalk level:
            <select value={squadMap[gSquad.id] || ""} onChange={(e) => { const m = { ...squadMap, [gSquad.id]: e.target.value }; setSquadMap(m); LS.set("chalk-gymorg-squadmap", m); }} className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm">
              <option value="">— choose —</option>
              {ALL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">ALP working level:
            <select value={gAlpIdx} onChange={(e) => { const m = { ...alpMap, [gSquad.id]: Number(e.target.value) }; setAlpMap(m); LS.set("chalk-gymorg-alpmap", m); }} className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm">
              {(CHALK_ALP.cols || []).map((c, i) => <option key={i} value={i}>{c.level}</option>)}
            </select>
          </label>
          {gymorg.headers && gymorg.headers.length > 0 && (
            <label className="flex items-center gap-1.5 text-slate-600">Lesson plan header:
              <select value={headerMap[gSquad.id] || ""} onChange={(e) => { const m = { ...headerMap, [gSquad.id]: e.target.value }; setHeaderMap(m); LS.set("chalk-gymorg-headermap", m); }} className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm">
                <option value="">{(() => { const h = GB.resolveHeader(gymorg, gSquad.id, {}); return h && h.name ? `Auto — ${h.name}` : "Auto — none"; })()}</option>
                {gymorg.headers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {gHeader && GB.headerDataUri(gHeader) && (
        <div className="mb-3">
          <img src={GB.headerDataUri(gHeader)} alt={`${gHeader.name} lesson plan header`} className="w-full h-auto rounded-lg border border-slate-200" style={{ maxHeight: 90, objectFit: "contain", objectPosition: "left" }} />
        </div>
      )}

      {!gSessions.length ? (
        <p className="text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">This squad has no scheduled sessions in this block.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={prevLesson} disabled={gSessionIdx <= 0} className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 disabled:opacity-40"><IconChevronLeft size={16} /></button>
            <select value={gSessionIdx} onChange={(e) => goToSession(Number(e.target.value))} className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm">
              {gSessions.map((s, i) => <option key={s.key} value={i}>{fmtDated(s)}</option>)}
            </select>
            <button onClick={nextLesson} disabled={gSessionIdx >= gSessions.length - 1} className="disp font-semibold text-sm text-white rounded-lg px-3 py-2 flex items-center gap-1 disabled:opacity-40" style={{ background: NAVY }}>Next lesson <IconChevronRight size={16} /></button>
          </div>
          <div className="text-[11px] text-slate-400 mb-3">
            Lesson {gSessionIdx + 1} of {gSessions.length} in this block{gCurrent && gCurrent.coachName ? ` · Coach ${gCurrent.coachName}` : ""}{gCurrent ? ` · ${gCurrent.duration} min` : ""}
          </div>

          <div className="mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Rotation this session</div>
            <div className="flex flex-wrap gap-1.5">
              {gLegs.map((leg, i) => {
                const stName = GB.stationName(gymorg, leg.stationId) || "Unassigned";
                const appName = stationMap[leg.stationId];
                const active = appName === activeTab;
                const c = APP_COLORS[appName] || "#94a3b8";
                return (
                  <button key={i} onClick={() => jumpToLeg(leg.stationId)} disabled={!appName}
                    className="disp text-sm font-semibold px-3 py-1.5 rounded-full border flex items-center gap-1.5 disabled:opacity-50"
                    style={active ? { background: c, borderColor: c, color: "#fff" } : { background: "#fff", borderColor: "#e2e8f0", color: "#334155" }}>
                    {stName}{appName && appName !== stName ? ` → ${appName}` : ""} <span className="text-[10px] opacity-80">{leg.minutes}m</span>
                  </button>
                );
              })}
            </div>
            {stationsUsed.some((s) => !stationMap[s.id]) && (
              <div className="mt-2 space-y-1.5">
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Map each station name to a Chalk apparatus tab so it links up:</div>
                {stationsUsed.filter((s) => !stationMap[s.id]).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-slate-600">
                    {s.name} →
                    <select value={stationMap[s.id] || ""} onChange={(e) => { const m = { ...stationMap, [s.id]: e.target.value }; setStationMap(m); LS.set("chalk-gymorg-stationmap", m); }} className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-sm">
                      <option value="">— choose —</option>
                      {allChalkApparatus().map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[["fresh", "Fresh suggestions"], ["last", "Same as last time"]].map(([v, label]) => (
                <button key={v} onClick={() => setPrefillMode(v)} className="text-[11px] font-semibold px-2.5 py-1 rounded-md border" style={prefillMode === v ? { background: NAVY, borderColor: NAVY, color: "#fff" } : { borderColor: "#e2e8f0", color: "#64748b" }}>{label}</button>
              ))}
            </div>
            <button onClick={applyPrefillToRotation} className="ml-auto disp font-semibold text-sm rounded-lg px-3 py-1.5 border flex items-center gap-1.5 text-slate-700 border-slate-300 hover:border-slate-400"><IconRefresh size={14} /> Prefill this session</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Tap a rotation chip to jump straight to that apparatus tab, filtered to this squad&rsquo;s working level. Ticked skills are saved automatically so &ldquo;Same as last time&rdquo; carries forward next visit.</p>
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ChalkApp />);
