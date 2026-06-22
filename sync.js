/* ============================================================================
   sync.js — shared cross-device cloud sync for the "play." games hub
   ----------------------------------------------------------------------------
   Offline-first by design: localStorage stays the source of truth on each
   device. The cloud (Firebase / Firestore) is an ADDITIVE mirror that only
   does anything once a player taps the ☁ button and signs in with Google.
   Signed out = the game behaves exactly as before, fully offline, no account.

   The Firebase web config below is NOT secret — it is safe to commit to a
   public repo. Security is enforced by Firestore rules (each player can only
   touch their own users/{uid} document), not by hiding these values.

   Usage from a game (one <script> tag in <head> or before the game script):
       <script src="../sync.js"></script>
   then, after the game's own state + a toast() helper exist:
       PlaySync.init({
         game: 'pour',
         mount: '.controls',                       // where the ☁ button goes
         fields: { 'pour.level': { merge: 'max' } },// keys to sync + merge rule
         toast: toast,                             // optional toast(msg) fn
         onRemote: () => location.reload()         // called when cloud changes
       });

   Data shape in Firestore:  users/{uid} = { pour: { "pour__level": 42 },
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

  const enc = (k) => k.replace(/\./g, "__"); // localStorage key -> Firestore field
  const SVG_OUT =
    '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.3-8A5.5 5.5 0 0 1 17.5 9.5 3.75 3.75 0 0 1 17 18H7z"/></svg>';
  const SVG_IN =
    '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1-.3-8A5.5 5.5 0 0 1 17.5 9.5 3.75 3.75 0 0 1 17 18H7z"/><path d="M9.3 13.6l1.9 1.9 3.6-4"/></svg>';

  const S = {
    cfg: null,
    ready: false,
    user: null,
    auth: null,
    authMod: null,
    fs: null,
    db: null,
    ref: null,
    btn: null,
    applyingRemote: false, // guard so a remote pull doesn't echo back up
  };

  function toast(msg) {
    if (S.cfg && typeof S.cfg.toast === "function") S.cfg.toast(msg);
  }

  function makeButton() {
    if (!S.cfg.mount) return;
    const host =
      typeof S.cfg.mount === "string"
        ? document.querySelector(S.cfg.mount)
        : S.cfg.mount;
    if (!host) return;
    const b = document.createElement("button");
    b.className = "icon-btn";
    b.id = "syncBtn";
    b.setAttribute("aria-label", "Sync progress");
    b.title = "Sync across devices";
    b.innerHTML = SVG_OUT;
    b.addEventListener("click", toggle);
    host.appendChild(b);
    S.btn = b;
    paintButton();
  }

  function paintButton() {
    if (!S.btn) return;
    const on = !!S.user;
    S.btn.innerHTML = on ? SVG_IN : SVG_OUT;
    S.btn.style.color = on ? "var(--accent, #f0b35e)" : "";
    S.btn.title = on
      ? "Synced — tap to sign out"
      : "Sync across devices (sign in)";
  }

  // Merge one field: returns the value that should win locally.
  function mergeValue(rule, localRaw, cloudVal) {
    if (cloudVal === undefined || cloudVal === null) return localRaw;
    if (localRaw === null || localRaw === undefined) return cloudVal;
    if (rule === "max")
      return String(Math.max(Number(localRaw) || 0, Number(cloudVal) || 0));
    if (rule === "min")
      return String(Math.min(Number(localRaw) || 0, Number(cloudVal) || 0));
    return cloudVal; // 'latest' / default: trust the cloud copy
  }

  // Pull cloud doc, merge into localStorage. Returns true if anything changed.
  function applyRemote(data) {
    const mine = (data && data[S.cfg.game]) || {};
    let changed = false;
    for (const key in S.cfg.fields) {
      const rule = S.cfg.fields[key].merge || "latest";
      const localRaw = localStorage.getItem(key);
      const cloudVal = mine[enc(key)];
      const winner = mergeValue(rule, localRaw, cloudVal);
      if (winner !== null && winner !== undefined && String(winner) !== localRaw) {
        localStorage.setItem(key, String(winner));
        changed = true;
      }
    }
    return changed;
  }

  function localPayload() {
    const out = {};
    for (const key in S.cfg.fields) {
      const v = localStorage.getItem(key);
      if (v !== null) out[enc(key)] = v;
    }
    return out;
  }

  async function push() {
    if (!S.ready || !S.user || !S.ref) return;
    try {
      await S.fs.setDoc(
        S.ref,
        { [S.cfg.game]: localPayload(), updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (e) {
      console.warn("[PlaySync] push failed (will retry next change)", e);
    }
  }

  async function init(cfg) {
    S.cfg = cfg;
    makeButton();
    if (!firebaseConfig.apiKey) return; // not configured yet -> local-only
    let appMod, authMod, fsMod;
    try {
      [appMod, authMod, fsMod] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
    } catch (e) {
      console.warn("[PlaySync] SDK unavailable (offline or blocked)", e);
      return; // game keeps working offline; button shows an error on tap
    }
    const app = appMod.initializeApp(firebaseConfig);
    S.authMod = authMod;
    S.auth = authMod.getAuth(app);
    S.fs = fsMod;
    S.db = fsMod.getFirestore(app);
    S.ready = true;

    authMod.onAuthStateChanged(S.auth, async (user) => {
      S.user = user;
      paintButton();
      if (!user) {
        S.ref = null;
        return;
      }
      S.ref = fsMod.doc(S.db, "users", user.uid);
      try {
        const snap = await fsMod.getDoc(S.ref);
        const changed = snap.exists() ? applyRemote(snap.data()) : false;
        await push(); // upload the merged result so the cloud is current
        if (changed && typeof S.cfg.onRemote === "function") S.cfg.onRemote();
      } catch (e) {
        console.warn("[PlaySync] initial read failed", e);
      }
      // Live updates from other devices.
      fsMod.onSnapshot(S.ref, (snap) => {
        if (!snap.exists() || S.applyingRemote) return;
        S.applyingRemote = true;
        const changed = applyRemote(snap.data());
        S.applyingRemote = false;
        if (changed && typeof S.cfg.onRemote === "function") S.cfg.onRemote();
      });
    });
  }

  async function toggle() {
    if (!S.ready) {
      toast("Sync not ready yet — try again in a moment.");
      return;
    }
    try {
      if (S.user) {
        await S.authMod.signOut(S.auth);
        toast("Signed out. Your progress stays on this device.");
      } else {
        await S.authMod.signInWithPopup(
          S.auth,
          new S.authMod.GoogleAuthProvider()
        );
        toast("Signed in — progress now syncs across devices.");
      }
    } catch (e) {
      console.warn("[PlaySync] auth error", e);
      toast("Sign-in didn’t complete. Please try again.");
    }
  }

  return { init, push, isOn: () => !!S.user };
})();
