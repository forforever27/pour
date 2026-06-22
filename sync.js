/* ============================================================================
   sync.js — shared cross-device cloud sync for the "play." games hub
   ----------------------------------------------------------------------------
   Offline-first by design: localStorage stays the source of truth on each
   device. The cloud (Firebase / Firestore) is an ADDITIVE mirror that only
   does anything once the player signs in with Google ON THE HUB.

   Sign-in lives in ONE place — the hub home page. Firebase keeps the session
   for the whole origin (forforever27.github.io), so every game page is signed
   in automatically afterwards and syncs its own data silently, with no button.

   The Firebase web config below is NOT secret — it is safe to commit to a
   public repo. Security is enforced by Firestore rules (each player can only
   touch their own users/{uid} document), not by hiding these values.

   USAGE
   -----
   Hub (index.html), once:
       PlaySync.initHub({ btn: el, toast: fn, onChange: renderChips });
       // btn = an existing <button> the hub styles itself
       // onChange runs after cloud data lands so the hub can repaint chips

   A game (e.g. pour/index.html):
       PlaySync.init({ game: 'pour', toast: fn, onRemote: fn });
       // no button — login is inherited from the hub
       // call PlaySync.push() after the game saves a synced value

   REGISTRY below is the single source of truth for what each game syncs and
   how conflicting values are merged. Add a game here when wiring its sync.

   Firestore shape:  users/{uid} = { pour: { "pour__level": "42" },
                                     updatedAt: "..." }
   (dots in localStorage keys are stored as "__" so Firestore is happy.)
   ============================================================================ */
window.PlaySync = (function () {
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
  const firebaseConfig = {
    apiKey: "AIzaSyBT6XLjKm5sFJUJ8KQFhcm0RBQ4r8TGavE",
    authDomain: "play-ee089.firebaseapp.com",
    projectId: "play-ee089",
    storageBucket: "play-ee089.firebasestorage.app",
    messagingSenderId: "811102676707",
    appId: "1:811102676707:web:ce951a6e6e81c6003b07d6",
  };

  // What each game syncs + how to merge a local vs cloud value.
  // merge: 'max' = furthest/best wins, 'min', 'maxmap' = per-key max of a JSON
  // object (e.g. {gentle:3,classic:1}), or 'latest' = trust the cloud copy.
  // Only monotonic progress markers are synced — never in-progress board blobs
  // (*.state) so two devices never clobber each other's live game, and never
  // *.sound (a per-device preference).
  const REGISTRY = {
    pour:     { "pour.level":     { merge: "max" } },
    sudoku:   { "sudoku.stats":   { merge: "maxmap" } },               // solved counts per difficulty
    codeword: { "codeword.level": { merge: "max" } },                  // furthest level
    "2048":   { "2048.best":      { merge: "max" } },                  // best score
    drop:     { "drop.best":      { merge: "max" } },                  // best score
    ember:    { "ember.level":    { merge: "max" },                    // furthest level
                "ember.meta":     { merge: "maxmap" } },               // {gold} — keep the most money
    sweets:   { "sweets.level":   { merge: "max" },
                "sweets.best":    { merge: "max" } },
    dots:     { "dots.level":     { merge: "max" },
                "dots.best":      { merge: "max" } },
  };

  const enc = (k) => k.replace(/\./g, "__"); // localStorage key -> Firestore field

  const S = {
    ready: false,
    user: null,
    auth: null,
    authMod: null,
    fs: null,
    db: null,
    ref: null,
    targets: [], // [{game, fields, onRemote}]
    buttons: [], // [{el, render}]
    applyingRemote: false,
    startPromise: null,
  };

  /* ---------- merge helpers ---------- */
  function mergeValue(rule, localRaw, cloudVal) {
    if (cloudVal === undefined || cloudVal === null) return localRaw;
    if (localRaw === null || localRaw === undefined) return cloudVal;
    if (rule === "max")
      return String(Math.max(Number(localRaw) || 0, Number(cloudVal) || 0));
    if (rule === "min")
      return String(Math.min(Number(localRaw) || 0, Number(cloudVal) || 0));
    if (rule === "maxmap") {
      let l = {}, c = {};
      try { l = JSON.parse(localRaw) || {}; } catch (_) {}
      try { c = JSON.parse(cloudVal) || {}; } catch (_) {}
      const out = Object.assign({}, l);
      for (const k in c) out[k] = Math.max(Number(out[k]) || 0, Number(c[k]) || 0);
      return JSON.stringify(out);
    }
    return cloudVal; // 'latest' / default
  }

  // Merge one game's cloud fields into localStorage. Returns true if changed.
  function applyGame(game, fields, docData) {
    const mine = (docData && docData[game]) || {};
    let changed = false;
    for (const key in fields) {
      const rule = fields[key].merge || "latest";
      const localRaw = localStorage.getItem(key);
      const winner = mergeValue(rule, localRaw, mine[enc(key)]);
      if (winner !== null && winner !== undefined && String(winner) !== localRaw) {
        localStorage.setItem(key, String(winner));
        changed = true;
      }
    }
    return changed;
  }

  // Build the Firestore payload for the games registered on this page.
  function buildPayload() {
    const payload = {};
    for (const t of S.targets) {
      const out = {};
      for (const key in t.fields) {
        const v = localStorage.getItem(key);
        if (v !== null) out[enc(key)] = v;
      }
      payload[t.game] = out;
    }
    return payload;
  }

  async function push() {
    if (!S.ready || !S.user || !S.ref || !S.targets.length) return;
    try {
      await S.fs.setDoc(
        S.ref,
        Object.assign(buildPayload(), { updatedAt: new Date().toISOString() }),
        { merge: true }
      );
    } catch (e) {
      console.warn("[PlaySync] push failed (will retry on next change)", e);
    }
  }

  /* ---------- buttons ---------- */
  function paintButtons() {
    const on = !!S.user;
    for (const b of S.buttons) {
      try {
        b.render(b.el, on, S.user);
      } catch (_) {}
    }
  }

  /* ---------- auth lifecycle ---------- */
  async function handleAuth(user) {
    S.user = user;
    paintButtons();
    if (!user) {
      S.ref = null;
      return;
    }
    S.ref = S.fs.doc(S.db, "users", user.uid);
    try {
      const snap = await S.fs.getDoc(S.ref);
      const data = snap.exists() ? snap.data() : null;
      const fired = [];
      for (const t of S.targets) {
        if (applyGame(t.game, t.fields, data)) fired.push(t);
      }
      await push(); // upload the merged result so the cloud is current
      for (const t of fired) if (typeof t.onRemote === "function") t.onRemote();
    } catch (e) {
      console.warn("[PlaySync] initial read failed", e);
    }
    // Live updates from other devices.
    S.fs.onSnapshot(S.ref, (snap) => {
      if (!snap.exists() || S.applyingRemote) return;
      S.applyingRemote = true;
      const data = snap.data();
      for (const t of S.targets) {
        if (applyGame(t.game, t.fields, data) && typeof t.onRemote === "function")
          t.onRemote();
      }
      S.applyingRemote = false;
    });
  }

  function start() {
    if (S.startPromise) return S.startPromise;
    S.startPromise = (async () => {
      if (!firebaseConfig.apiKey) return false;
      let appMod, authMod, fsMod;
      try {
        [appMod, authMod, fsMod] = await Promise.all([
          import(`${SDK}/firebase-app.js`),
          import(`${SDK}/firebase-auth.js`),
          import(`${SDK}/firebase-firestore.js`),
        ]);
      } catch (e) {
        console.warn("[PlaySync] SDK unavailable (offline or blocked)", e);
        return false;
      }
      const app = appMod.initializeApp(firebaseConfig);
      S.authMod = authMod;
      S.auth = authMod.getAuth(app);
      S.fs = fsMod;
      S.db = fsMod.getFirestore(app);
      S.ready = true;
      authMod.onAuthStateChanged(S.auth, handleAuth);
      return true;
    })();
    return S.startPromise;
  }

  async function toggle(toast) {
    const ok = await start();
    if (!ok || !S.ready) {
      if (toast) toast("Sync not ready — check your connection and try again.");
      return;
    }
    try {
      if (S.user) {
        await S.authMod.signOut(S.auth);
        if (toast) toast("Signed out. Progress stays on this device.");
      } else {
        await S.authMod.signInWithPopup(
          S.auth,
          new S.authMod.GoogleAuthProvider()
        );
        if (toast) toast("Signed in — progress now syncs across devices.");
      }
    } catch (e) {
      console.warn("[PlaySync] auth error", e);
      if (toast) toast("Sign-in didn’t complete. Please try again.");
    }
  }

  /* ---------- public API ---------- */

  // A game page: sync this one game silently (login inherited from the hub).
  function init(cfg) {
    const fields = cfg.fields || REGISTRY[cfg.game];
    if (!fields) {
      console.warn("[PlaySync] no fields registered for game:", cfg.game);
      return;
    }
    S.targets.push({ game: cfg.game, fields, onRemote: cfg.onRemote });
    start();
  }

  // The hub page: one sign-in button + sync EVERY registered game.
  function initHub(cfg) {
    for (const game in REGISTRY) {
      S.targets.push({ game, fields: REGISTRY[game], onRemote: cfg.onChange });
    }
    if (cfg.btn) {
      const render =
        cfg.render ||
        function (el, on) {
          el.textContent = on ? "✓ synced · sign out" : "☁ sign in to sync";
          el.classList.toggle("on", on);
        };
      S.buttons.push({ el: cfg.btn, render });
      render(cfg.btn, false);
      cfg.btn.addEventListener("click", () => toggle(cfg.toast));
    }
    start();
  }

  return { init, initHub, push, isOn: () => !!S.user };
})();
