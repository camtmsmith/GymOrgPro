// ============================================================================
// Chalk ⇄ GymOrgPro LIVE bridge (read-only)
//
// GymOrgPro already publishes its entire roster state to a Firebase Realtime
// Database (project "gymorgpro2") at /rosters/{rosterId}, with a lightweight
// /rosterIndex listing and a /defaultRosterId pointer, and keeps them live via
// value listeners. That published blob is the SAME shape as GymOrgPro's "Export
// backup" file — so Chalk can read it straight out of the database and feed it
// to GymOrgBridge.parseBackup(), with NO manual export/import step.
//
// This connector is deliberately READ-ONLY. It only ever calls .once('value')
// and .on('value') on /rosters and /rosterIndex — it never writes, so Chalk
// cannot alter a gym's schedule. GymOrgPro stays the single source of truth;
// Chalk is a viewer that individualises the plans.
//
// SECURITY NOTE: the apiKey below is not a secret for Realtime Database —
// access is governed by the database's security rules, and this is the same
// config GymOrgPro ships in its own client. GymOrgPro's DB is currently in
// "test mode" (open read/write), which is why this works with no sign-in. If
// you later lock the rules down, keep public *read* on /rosters and
// /rosterIndex (or add anonymous auth on both apps) so Chalk can still read.
//
// Needs an internet connection (it loads the Firebase SDK from gstatic and
// talks to the database). Chalk's file-based "Choose backup .json" import stays
// as the offline fallback.
// ============================================================================
(function (global) {
  "use strict";

  // Same project GymOrgPro publishes to.
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyAyIXBU0J1-iGK7hZFgVPapiaIdjqG5rBM",
    authDomain: "gymorgpro2.firebaseapp.com",
    databaseURL: "https://gymorgpro2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "gymorgpro2",
    storageBucket: "gymorgpro2.firebasestorage.app",
    messagingSenderId: "35561140417",
    appId: "1:35561140417:web:bf8814bebaba3babffa440",
  };

  // Match the exact SDK version GymOrgPro loads, to avoid version drift.
  var SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js",
  ];

  var app = null;          // the initialized firebase app
  var readyPromise = null; // memoised connect()
  var listeners = [];      // active { ref, cb } so disconnect() can detach all

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      // if some other loader already added it, don't double-load
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute("data-loaded")) return resolve();
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", function () { reject(new Error("Failed to load " + src)); });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = false; // preserve order: app-compat before database-compat
      s.onload = function () { s.setAttribute("data-loaded", "1"); resolve(); };
      s.onerror = function () { reject(new Error("Failed to load " + src + " (offline?)")); };
      document.head.appendChild(s);
    });
  }

  async function ensureSdk() {
    if (global.firebase && global.firebase.database) return;
    for (var i = 0; i < SDK_URLS.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await loadScript(SDK_URLS[i]);
    }
    if (!global.firebase || !global.firebase.database) {
      throw new Error("Firebase SDK loaded but database module is missing.");
    }
  }

  // Loads the SDK (if needed) and initialises the app. Idempotent — safe to call
  // repeatedly; returns the same promise. Resolves when the DB is usable.
  function connect() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      await ensureSdk();
      // reuse an app if GymOrgPro/another script already made the default one
      if (global.firebase.apps && global.firebase.apps.length) {
        app = global.firebase.app();
      } else {
        app = global.firebase.initializeApp(FIREBASE_CONFIG);
      }
      return true;
    })();
    return readyPromise;
  }

  function db() {
    return global.firebase.database();
  }

  function track(ref, cb) {
    listeners.push({ ref: ref, cb: cb });
    return function untrack() {
      try { ref.off("value", cb); } catch (e) { /* noop */ }
      listeners = listeners.filter(function (l) { return l.cb !== cb; });
    };
  }

  // Subscribe to the roster INDEX ({ [rosterId]: {name, updatedAt, hidden} }).
  // Calls cb(indexObj) now and on every change. Returns an unsubscribe fn.
  async function listRosters(cb, errCb) {
    await connect();
    var ref = db().ref("rosterIndex");
    var handler = function (snap) { cb(snap.val() || {}); };
    ref.on("value", handler, function (e) { if (errCb) errCb(e); });
    return track(ref, handler);
  }

  // The gym's chosen default roster id (or null).
  async function getDefaultRosterId() {
    await connect();
    var snap = await db().ref("defaultRosterId").once("value");
    return snap.val() || null;
  }

  // One-shot read of a roster's full state blob (same shape as a backup file).
  async function readRosterOnce(rosterId) {
    await connect();
    var snap = await db().ref("rosters/" + rosterId).once("value");
    return snap.val();
  }

  // Live subscribe to one roster. Calls cb(blob) now and whenever GymOrgPro
  // saves a change. blob is ready for GymOrgBridge.parseBackup(). Returns an
  // unsubscribe fn. Pass the previous unsubscribe as the 4th arg to swap cleanly.
  async function subscribeRoster(rosterId, cb, errCb) {
    await connect();
    var ref = db().ref("rosters/" + rosterId);
    var handler = function (snap) {
      var blob = snap.val();
      if (blob) cb(blob);
      else if (errCb) errCb(new Error("Roster \"" + rosterId + "\" not found."));
    };
    ref.on("value", handler, function (e) { if (errCb) errCb(e); });
    return track(ref, handler);
  }

  // Detach every active listener. Call when leaving the GymOrgPro panel.
  function disconnect() {
    listeners.slice().forEach(function (l) {
      try { l.ref.off("value", l.cb); } catch (e) { /* noop */ }
    });
    listeners = [];
  }

  global.ChalkLive = {
    available: function () { return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL); },
    connect: connect,
    listRosters: listRosters,
    getDefaultRosterId: getDefaultRosterId,
    readRosterOnce: readRosterOnce,
    subscribeRoster: subscribeRoster,
    disconnect: disconnect,
    CONFIG: FIREBASE_CONFIG,
  };
})(typeof window !== "undefined" ? window : this);
