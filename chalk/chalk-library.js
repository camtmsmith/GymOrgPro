// ============================================================================
// CHALK SKILLS LIBRARY  (new in v6)
//
// Makes the skill database EDITABLE — rename a skill, rewrite its coaching
// points, add skills that aren't in the club documents at all, hide ones you
// never use, and map a skill onto more than one apparatus so it shows up
// wherever a coach would look for it.
//
// ---------------------------------------------------------------------------
// WHY AN OVERLAY, NOT A REPLACEMENT
// ---------------------------------------------------------------------------
// The obvious move is "put the whole skill database in Firebase". Don't. The
// shipped database (data.js) is ~780 kB of generated content plus 382 diagram
// files, and it is not the thing that changes — a club edits a few dozen
// skills a year. Uploading all of it would mean:
//
//   • every page load waits on the network before showing a single skill;
//   • Chalk stops working on a plane, in a gym with bad wifi, or from a
//     double-clicked index.html (which is still how some coaches run it);
//   • regenerating data.js from the club's source documents would clobber
//     everything anyone had typed.
//
// So data.js stays the read-only BASELINE, and this file keeps a small
// OVERLAY — just the differences — in localStorage and (optionally) Firebase.
// Resolution is baseline + overlay, computed in the browser. The overlay for a
// busy club is a few tens of kB, syncs instantly, and if Firebase is
// unreachable the app still runs on the last local copy.
//
// That is the answer to "does this need migrating into Firebase?": the EDITS
// do, the database doesn't.
//
// ---------------------------------------------------------------------------
// SHAPE OF THE OVERLAY
// ---------------------------------------------------------------------------
//   {
//     v: 1,
//     rev: 12,                     // bumped on every local change
//     updatedAt: 1750000000000,
//     updatedBy: "Cam",            // free-text, for the "last edited by" line
//     edits:  { [sid]: { name?, cues?, img?, apps?, group?, hidden? } },
//     custom: { [sid]: { level, apparatus, group, name, cues, img, apps } },
//     groups: [ { level, apparatus, group } ]     // new, initially-empty groups
//   }
//
// `sid` is a STABLE id built from level + apparatus + group + skill name, not
// from array positions — so regenerating data.js and reordering it doesn't
// detach anyone's edits. If a skill is renamed upstream its edit is orphaned
// (harmless, and listed in the library UI so it can be cleaned up).
//
// Warm-up and warm-down are modelled as a pseudo-level "*" so they run through
// exactly the same code path as apparatus skills — one resolver, not three.
//
// ---------------------------------------------------------------------------
// SYNC MODEL
// ---------------------------------------------------------------------------
// Whole-document last-write-wins on a `rev` counter, stored as a single JSON
// string at /chalkLibrary/{libraryId}. It is not operational-transform, and it
// doesn't need to be: two coaches editing the SAME skill in the same minute is
// vanishingly rare, and everything else merges fine because it's one document
// written atomically. If a remote revision arrives that is newer than ours we
// adopt it; the UI shows who wrote it and when.
//
// Storing it as a JSON string (rather than a nested object) sidesteps
// Firebase's key restrictions — skill names contain '.', '/', '#' and '$' all
// over the place, none of which are legal in RTDB paths.
// ============================================================================
(function (global) {
  "use strict";

  var LS_KEY = "chalk-library-v1";
  var LS_CLOUD = "chalk-library-cloud";     // { enabled, libraryId, who }
  var DB_PATH = "chalkLibrary";
  var ANY = "*";                            // pseudo-level for warm-up/warm-down

  // Same project GymOrgPro and the live rotation bridge already use.
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyAyIXBU0J1-iGK7hZFgVPapiaIdjqG5rBM",
    authDomain: "gymorgpro2.firebaseapp.com",
    databaseURL: "https://gymorgpro2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "gymorgpro2",
    storageBucket: "gymorgpro2.firebasestorage.app",
    messagingSenderId: "35561140417",
    appId: "1:35561140417:web:bf8814bebaba3babffa440",
  };
  var SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js",
  ];

  // ------------------------------------------------------------------ util --
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function nowMs() { return Date.now(); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x) { return typeof x === "string" ? x : ""; }
  function trim(x) { return str(x).trim(); }

  // sid parts are joined with "::" so the id stays readable in a JSON dump.
  // A literal "~" or ":" inside a skill name is escaped rather than banned —
  // real skill names contain both ("L-sit press: rings", "Tsuk ~ pit").
  function enc(s) { return String(s == null ? "" : s).replace(/~/g, "~0").replace(/:/g, "~1"); }
  function dec(s) { return String(s == null ? "" : s).replace(/~1/g, ":").replace(/~0/g, "~"); }
  function sidOf(level, apparatus, group, name) {
    return [enc(level), enc(apparatus), enc(group), enc(name)].join("::");
  }
  // Turn a sid back into the four things it was built from, so the library UI
  // can list a hidden skill without having to re-scan the whole baseline for it.
  function partsOf(sid) {
    var p = String(sid || "").split("::");
    if (p[0] === "custom") p = p.slice(1, 5);
    return { level: dec(p[0]), apparatus: dec(p[1]), group: dec(p[2]), name: dec(p[3]) };
  }

  function emptyDoc() {
    return { v: 1, rev: 0, updatedAt: 0, updatedBy: "", edits: {}, custom: {}, groups: [] };
  }
  function normaliseDoc(d) {
    var out = emptyDoc();
    if (!d || typeof d !== "object") return out;
    out.v = 1;
    out.rev = typeof d.rev === "number" ? d.rev : 0;
    out.updatedAt = typeof d.updatedAt === "number" ? d.updatedAt : 0;
    out.updatedBy = str(d.updatedBy);
    if (d.edits && typeof d.edits === "object") out.edits = d.edits;
    if (d.custom && typeof d.custom === "object") out.custom = d.custom;
    out.groups = arr(d.groups).filter(function (g) { return g && g.apparatus && g.group; });
    return out;
  }

  // ------------------------------------------------------------- the store --
  var doc = emptyDoc();
  var subs = [];
  var cache = {};        // "level" -> resolved tabs, invalidated whenever rev changes
  var cacheRev = -1;
  var cloud = { enabled: false, libraryId: "default", who: "", status: "off", error: "" };

  function loadLocal() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (raw) doc = normaliseDoc(JSON.parse(raw));
    } catch (e) { /* corrupt or unavailable storage — start clean */ }
    try {
      var c = JSON.parse(global.localStorage.getItem(LS_CLOUD) || "null");
      if (c) {
        cloud.enabled = !!c.enabled;
        cloud.libraryId = trim(c.libraryId) || "default";
        cloud.who = str(c.who);
      }
    } catch (e) { /* ignore */ }
  }
  function saveLocal() {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { /* quota/private mode */ }
  }
  function saveCloudPrefs() {
    try {
      global.localStorage.setItem(LS_CLOUD, JSON.stringify({
        enabled: cloud.enabled, libraryId: cloud.libraryId, who: cloud.who,
      }));
    } catch (e) { /* ignore */ }
  }

  function bump(alsoPush) {
    doc.rev = (doc.rev || 0) + 1;
    doc.updatedAt = nowMs();
    if (cloud.who) doc.updatedBy = cloud.who;
    cache = {}; cacheRev = doc.rev;
    saveLocal();
    if (alsoPush !== false) pushToCloud();
    notify();
  }
  function notify() { subs.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // ------------------------------------------------------------- resolution --
  // Baseline lookups. Warm-up / warm-down are objects keyed by group name;
  // apparatus data is an array of {group, skills}. Both are normalised to the
  // array form here so there is exactly one resolver below.
  function baseTabs(level) {
    var out = {};
    if (level === ANY) {
      out["Warm-up"] = groupObjToArr(global.CHALK_WARMUP);
      out["Warm-down"] = groupObjToArr(global.CHALK_WARMDOWN);
      return out;
    }
    var lvl = (global.CHALK_DATA || {})[level];
    if (!lvl || !lvl.apparatus) return out;
    Object.keys(lvl.apparatus).forEach(function (app) {
      out[app] = arr(lvl.apparatus[app]).map(function (g) {
        return { group: str(g.group), skills: arr(g.skills) };
      });
    });
    return out;
  }
  function groupObjToArr(obj) {
    if (!obj) return [];
    return Object.keys(obj).map(function (g) { return { group: g, skills: arr(obj[g]) }; });
  }

  // One resolved skill, with the edit applied and the bookkeeping the app needs.
  function resolveSkill(level, homeApp, groupName, skill, gi, si) {
    var sid = sidOf(level, homeApp, groupName, skill.name);
    var ed = doc.edits[sid] || null;
    if (ed && ed.hidden) return null;
    return {
      name: ed && trim(ed.name) ? ed.name : skill.name,
      cues: ed && Array.isArray(ed.cues) ? ed.cues : arr(skill.cues),
      img: ed && Array.isArray(ed.img) ? ed.img : arr(skill.img),
      _sid: sid,
      _kt: homeApp,                 // tab the selection key is built from
      _home: homeApp,
      _homeLevel: level,
      _group: (ed && trim(ed.group)) || groupName,
      _gi: gi, _si: si,
      _edited: !!ed,
      _apps: (ed && arr(ed.apps).length) ? ed.apps.slice() : [homeApp],
    };
  }
  function resolveCustom(sid, c) {
    return {
      name: c.name,
      cues: arr(c.cues),
      img: arr(c.img),
      _sid: sid,
      _kt: c.apparatus,
      _home: c.apparatus,
      _homeLevel: c.level,
      _group: c.group,
      _ck: "CUST::" + sid,          // stable selection key — custom skills have no indices
      _custom: true,
      _apps: arr(c.apps).length ? c.apps.slice() : [c.apparatus],
    };
  }

  // Build every tab for a level in one pass. Cached per level per revision,
  // because the selector re-renders on every keystroke in the search box and
  // a full re-resolve of a big level would be felt on a tablet.
  function buildLevel(level) {
    if (cacheRev !== doc.rev) { cache = {}; cacheRev = doc.rev; }
    if (cache[level]) return cache[level];

    var base = baseTabs(level);
    var tabs = {};                       // tabName -> { groupName -> skills[] }
    var order = {};                      // tabName -> [groupName] in display order
    var names = Object.keys(base);

    function bucket(tab, group) {
      if (!tabs[tab]) { tabs[tab] = {}; order[tab] = []; }
      if (!tabs[tab][group]) { tabs[tab][group] = []; order[tab].push(group); }
      return tabs[tab][group];
    }
    // Seed every base tab with its base groups, in the original order, so an
    // apparatus with no edits comes out byte-identical to v5.
    names.forEach(function (tab) {
      base[tab].forEach(function (g) { bucket(tab, g.group); });
    });

    // Home skills, plus any extra apparatus they've been mapped onto.
    names.forEach(function (tab) {
      base[tab].forEach(function (g, gi) {
        g.skills.forEach(function (sk, si) {
          var r = resolveSkill(level, tab, g.group, sk, gi, si);
          if (!r) return;
          r._apps.forEach(function (target) {
            if (target === tab) bucket(tab, r._group).push(r);
            else bucket(target, r._group).push(Object.assign({}, r, { _via: tab }));
          });
        });
      });
    });

    // Custom skills belonging to this level (and "*" ones, which are global).
    Object.keys(doc.custom).forEach(function (sid) {
      var c = doc.custom[sid];
      if (!c || (c.level !== level && c.level !== ANY)) return;
      if (level === ANY && c.level !== ANY) return;
      var r = resolveCustom(sid, c);
      r._apps.forEach(function (target) {
        bucket(target, r._group).push(target === c.apparatus ? r : Object.assign({}, r, { _via: c.apparatus }));
      });
    });

    // Empty groups a coach created but hasn't filled yet.
    doc.groups.forEach(function (g) {
      if (g.level !== level && g.level !== ANY) return;
      bucket(g.apparatus, g.group);
    });

    var out = {};
    Object.keys(tabs).forEach(function (tab) {
      out[tab] = order[tab].map(function (gname) {
        return { group: gname, skills: tabs[tab][gname] };
      });
    });
    cache[level] = out;
    return out;
  }

  // Skills mapped in from "*" (warm-up/warm-down) need to appear on apparatus
  // tabs at EVERY level, so they're resolved separately and merged in.
  function globalOverlayFor(tab) {
    var g = buildLevel(ANY);
    var out = [];
    Object.keys(g).forEach(function (t) {
      if (t === "Warm-up" || t === "Warm-down") return;
    });
    return (g[tab] || []).slice();
  }

  // ---------------------------------------------------------------- public --
  var API = {
    ANY: ANY,
    sid: sidOf,

    init: function () {
      loadLocal();
      if (cloud.enabled) API.cloudConnect();
      return API;
    },
    onChange: function (fn) {
      subs.push(fn);
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },

    // --- reading -----------------------------------------------------------
    // The tabs a level should show: its own apparatus, plus Warm-up/Warm-down,
    // plus any apparatus a coach has created by mapping a skill onto a name
    // that didn't exist yet.
    tabsFor: function (level) {
      var own = Object.keys(buildLevel(level));
      var baseOrder = Object.keys(baseTabs(level));
      var extras = own.filter(function (t) { return baseOrder.indexOf(t) < 0; });
      return ["Warm-up", "Warm-down"].concat(baseOrder, extras.sort());
    },

    // Resolved [{group, skills:[…]}] for one tab of one level.
    sections: function (level, tab) {
      if (tab === "Warm-up" || tab === "Warm-down") return buildLevel(ANY)[tab] || [];
      var own = buildLevel(level)[tab] || [];
      var fromGlobal = globalOverlayFor(tab);
      if (!fromGlobal.length) return own;
      // Merge warm-up/warm-down skills that were mapped onto this apparatus.
      var merged = own.slice();
      fromGlobal.forEach(function (g) {
        var hit = merged.filter(function (m) { return m.group === g.group; })[0];
        if (hit) hit.skills = hit.skills.concat(g.skills);
        else merged.push({ group: g.group, skills: g.skills });
      });
      return merged;
    },

    // Every apparatus name known anywhere — the checklist in the mapping editor.
    allApparatus: function () {
      var seen = {};
      Object.keys(global.CHALK_DATA || {}).forEach(function (lvl) {
        var a = (global.CHALK_DATA[lvl] || {}).apparatus || {};
        Object.keys(a).forEach(function (n) { seen[n] = true; });
      });
      Object.keys(doc.custom).forEach(function (sid) {
        var c = doc.custom[sid];
        if (c) arr(c.apps).concat([c.apparatus]).forEach(function (n) { if (n) seen[n] = true; });
      });
      Object.keys(doc.edits).forEach(function (sid) {
        arr((doc.edits[sid] || {}).apps).forEach(function (n) { if (n) seen[n] = true; });
      });
      delete seen["Warm-up"]; delete seen["Warm-down"];
      return ["Warm-up", "Warm-down"].concat(Object.keys(seen).sort());
    },

    groupsFor: function (level, tab) {
      return API.sections(level, tab).map(function (g) { return g.group; });
    },

    parts: partsOf,
    // Everything currently hidden, newest-looking first, so the library UI can
    // offer them back. Hidden skills are deliberately invisible everywhere else.
    hiddenList: function () {
      return Object.keys(doc.edits)
        .filter(function (sid) { return doc.edits[sid] && doc.edits[sid].hidden; })
        .map(function (sid) {
          var p = partsOf(sid);
          return {
            sid: sid, level: p.level, apparatus: p.apparatus, group: p.group,
            name: trim((doc.edits[sid] || {}).name) || p.name,
          };
        })
        .sort(function (a, b) {
          return (a.apparatus + a.group + a.name).localeCompare(b.apparatus + b.group + b.name);
        });
    },
    unhide: function (sid) {
      var ed = doc.edits[sid];
      if (!ed) return;
      delete ed.hidden;
      // An entry that ONLY said "hidden" is now noise — drop it entirely so the
      // skill goes back to being an untouched baseline skill.
      if (!Object.keys(ed).length) delete doc.edits[sid];
      bump();
    },

    editOf: function (sid) { return doc.edits[sid] ? clone(doc.edits[sid]) : null; },
    customOf: function (sid) { return doc.custom[sid] ? clone(doc.custom[sid]) : null; },

    // --- writing -----------------------------------------------------------
    // Patch an existing (baseline) skill. Passing a field back to its baseline
    // value doesn't remove the edit — use reset() for that — because "I typed
    // it back the same on purpose" and "never edited" should look different in
    // the library list.
    edit: function (sid, patch) {
      if (doc.custom[sid]) {
        doc.custom[sid] = Object.assign({}, doc.custom[sid], patch || {});
      } else {
        doc.edits[sid] = Object.assign({}, doc.edits[sid] || {}, patch || {});
      }
      bump();
    },
    reset: function (sid) {
      if (doc.edits[sid]) { delete doc.edits[sid]; bump(); }
    },
    hide: function (sid, on) {
      if (doc.custom[sid]) { if (on) delete doc.custom[sid]; }
      else doc.edits[sid] = Object.assign({}, doc.edits[sid] || {}, { hidden: !!on });
      bump();
    },
    // Delete: baseline skills can only be hidden (the baseline is read-only);
    // custom skills are removed outright.
    remove: function (sid) {
      if (doc.custom[sid]) { delete doc.custom[sid]; bump(); return true; }
      API.hide(sid, true); return false;
    },
    addSkill: function (s) {
      var level = s.level || ANY;
      var apparatus = trim(s.apparatus);
      var group = trim(s.group) || "Added skills";
      var name = trim(s.name);
      if (!apparatus || !name) return null;
      var sid = "custom::" + sidOf(level, apparatus, group, name) + "::" + nowMs().toString(36);
      doc.custom[sid] = {
        level: level, apparatus: apparatus, group: group, name: name,
        cues: arr(s.cues), img: arr(s.img),
        apps: arr(s.apps).length ? s.apps.slice() : [apparatus],
        created: nowMs(),
      };
      bump();
      return sid;
    },
    addGroup: function (level, apparatus, group) {
      group = trim(group);
      if (!group || !apparatus) return false;
      var exists = doc.groups.some(function (g) {
        return g.level === level && g.apparatus === apparatus && g.group === group;
      });
      if (!exists) { doc.groups.push({ level: level || ANY, apparatus: apparatus, group: group }); bump(); }
      return true;
    },
    // Map a skill onto a set of apparatus. An empty/1-item list is the normal
    // case; more than one means it shows on several tabs at once.
    mapTo: function (sid, apps) {
      var list = arr(apps).map(trim).filter(Boolean);
      API.edit(sid, { apps: list });
    },

    // --- housekeeping ------------------------------------------------------
    stats: function () {
      var edits = Object.keys(doc.edits);
      return {
        edited: edits.filter(function (k) { return !doc.edits[k].hidden; }).length,
        hidden: edits.filter(function (k) { return doc.edits[k].hidden; }).length,
        added: Object.keys(doc.custom).length,
        mapped: edits.filter(function (k) { return arr(doc.edits[k].apps).length > 1; }).length
              + Object.keys(doc.custom).filter(function (k) { return arr(doc.custom[k].apps).length > 1; }).length,
        rev: doc.rev, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy,
      };
    },
    exportJSON: function () { return JSON.stringify(doc, null, 2); },
    importJSON: function (text, mode) {
      var incoming;
      try { incoming = normaliseDoc(JSON.parse(text)); }
      catch (e) { return { ok: false, error: "That file isn't valid Chalk library JSON." }; }
      if (mode === "merge") {
        Object.keys(incoming.edits).forEach(function (k) { doc.edits[k] = incoming.edits[k]; });
        Object.keys(incoming.custom).forEach(function (k) { doc.custom[k] = incoming.custom[k]; });
        incoming.groups.forEach(function (g) { doc.groups.push(g); });
      } else {
        var rev = doc.rev;
        doc = incoming; doc.rev = rev;    // keep our revision line so sync still orders correctly
      }
      bump();
      return { ok: true };
    },
    clearAll: function () { var rev = doc.rev; doc = emptyDoc(); doc.rev = rev; bump(); },

    // --- cloud -------------------------------------------------------------
    cloudState: function () { return clone(cloud); },
    setWho: function (who) { cloud.who = trim(who); saveCloudPrefs(); notify(); },
    setLibraryId: function (id) {
      cloud.libraryId = trim(id) || "default";
      saveCloudPrefs();
      if (cloud.enabled) { API.cloudDisconnect(); API.cloudConnect(); } else notify();
    },
    cloudConnect: function () {
      cloud.enabled = true; cloud.status = "connecting"; cloud.error = ""; saveCloudPrefs(); notify();
      return connectDb().then(function (db) {
        var ref = db.ref(DB_PATH + "/" + cloud.libraryId);
        cloudRef = ref;
        ref.on("value", onRemote, function (err) {
          cloud.status = "error"; cloud.error = String(err && err.message || err); notify();
        });
        cloud.status = "live"; notify();
        // Publish immediately if we have local work the cloud hasn't seen.
        if (doc.rev > 0) pushToCloud();
      }).catch(function (err) {
        cloud.status = "error";
        cloud.error = String(err && err.message || err);
        notify();
      });
    },
    cloudDisconnect: function () {
      if (cloudRef) { try { cloudRef.off("value", onRemote); } catch (e) {} cloudRef = null; }
      cloud.enabled = false; cloud.status = "off"; saveCloudPrefs(); notify();
    },
  };

  // ------------------------------------------------------------- firebase ---
  var fbApp = null, cloudRef = null, dbPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute("data-loaded")) return resolve();
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", function () { reject(new Error("Failed to load " + src)); });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { s.setAttribute("data-loaded", "1"); resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  function connectDb() {
    if (dbPromise) return dbPromise;
    dbPromise = SDK_URLS.reduce(function (p, url) {
      return p.then(function () { return loadScript(url); });
    }, Promise.resolve()).then(function () {
      if (!global.firebase) throw new Error("Firebase SDK did not load — check the connection.");
      // A NAMED app, so we never fight with the read-only rotation bridge in
      // chalk-gymorg-live.js, which owns the default app.
      var existing = (global.firebase.apps || []).filter(function (a) { return a.name === "chalklib"; })[0];
      fbApp = existing || global.firebase.initializeApp(FIREBASE_CONFIG, "chalklib");
      return fbApp.database();
    }).catch(function (e) { dbPromise = null; throw e; });
    return dbPromise;
  }

  var suppressPush = false;
  function onRemote(snap) {
    var val = snap && snap.val();
    if (!val) { cloud.status = "live"; notify(); return; }
    var incoming;
    try { incoming = normaliseDoc(JSON.parse(val.doc || "null")); }
    catch (e) { return; }
    incoming.rev = typeof val.rev === "number" ? val.rev : incoming.rev;
    incoming.updatedAt = typeof val.updatedAt === "number" ? val.updatedAt : incoming.updatedAt;
    incoming.updatedBy = str(val.updatedBy) || incoming.updatedBy;

    if (incoming.rev > doc.rev) {
      doc = incoming;
      cache = {}; cacheRev = doc.rev;
      saveLocal();
      cloud.status = "live";
      notify();
    } else if (incoming.rev < doc.rev) {
      pushToCloud();               // we're ahead — republish
    }
    cloud.status = "live";
  }

  function pushToCloud() {
    if (!cloud.enabled || !cloudRef || suppressPush) return;
    var payload = {
      rev: doc.rev,
      updatedAt: doc.updatedAt || nowMs(),
      updatedBy: doc.updatedBy || cloud.who || "",
      doc: JSON.stringify(doc),
    };
    cloudRef.set(payload).catch(function (err) {
      cloud.status = "error";
      cloud.error = String(err && err.message || err);
      notify();
    });
  }

  global.ChalkLib = API.init();
})(window);
