# play. — games hub handoff

A single-domain collection of small, calm, ad-free browser games. One GitHub Pages
deployment, one repo, each game a self-contained `index.html`. This doc is the
catch-up for any new session.

---

## TL;DR

- **Live site:** https://forforever27.github.io/pour/ (the hub / menu)
- **Repo:** https://github.com/forforever27/pour — personal GitHub account `forforever27`
  (owner email `xykoh2012@gmail.com`)
- **Local working copy:** `C:\Users\user\Desktop\AGENT\Others\Games\Pour\`
  (folder is still named `Pour` for historical reasons — it is the **whole-site repo**, not just Pour)
- **Deploy:** push to `main`. GitHub Pages serves `main` at root `/`. No build step.
- **Games:** Pour, Sudoku, Codeword, 2048, Drop, Ember, Sweets, Dots, Bus — 9 total.
- **Cross-device sync:** optional, offline-first, via Firebase (project `play-ee089`). One
  Google sign-in **on the hub** mirrors every game's progress across devices. Signed out,
  the games are unchanged and fully offline. See **Cross-device cloud sync** below.
- **Owner:** Xy Koh — designer, not a developer. Keep explanations plain.

> ⚠️ **Never move the domain or account.** Local player progress lives in browser
> `localStorage`, scoped to the origin `forforever27.github.io`. Moving to a different
> domain or account silently wipes every existing player's local saves and streaks (and
> would also break the Firebase **Authorized domains** allow-list — see sync section).

---

## How it's built

Every game is **one self-contained HTML file** — inline `<style>` and `<script>`, no
build, no dependencies, no framework. Only external resources are Google Fonts
(Fraunces + Outfit). This keeps each game independently editable and instantly deployable.

### Shared design language (copy this for any new game)
- Night/dusk palette defined as CSS variables (`--bg-deep #14101f`, `--ink #f2edf7`,
  `--accent #f0b35e`, `--panel #2b2342`, etc.)
- Fonts: **Fraunces** (serif, headings/numbers) + **Outfit** (sans, UI text)
- `color-scheme: only light` is locked, and **all fills use one-colour gradients**
  (`linear-gradient(#x,#x)`) instead of flat colours. This defeats mobile forced-dark
  browsers (esp. Samsung Internet) which recolour solid fills but skip gradients.
- Atmosphere: fixed `.sky` radial-gradient backdrop, drifting blurred `.orb`s, faint SVG
  noise overlay via `body::after`.
- Common UI: `.icon-btn` (44px header buttons), `.pill` actions, soft synth blips via
  Web Audio (`note()` helper), `navigator.vibrate` haptics, confetti on win, a `#toast`,
  and frosted-glass overlay cards.
- Mobile-first: everything fits a ~375×812 phone with no horizontal scroll;
  `viewport-fit=cover` + `env(safe-area-inset-*)` padding.
- **Favicons are inline SVG data-URIs** (`<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,…">`)
  right after each `<title>` — no separate `.ico`/`.png` files, in keeping with the no-build
  rule. Each is a rounded `#231c3a` tile + the game's motif in palette accents (the hub is a
  play-triangle). `#`→`%23`, `<`→`%3C`, `>`→`%3E`, single-quoted attrs. New games get one too.

### How-to-play tutorial (shared component, all 9 games)
Each game has an **info (ⓘ) button** in the header that opens a `#tut` pop-up: an
**illustration-led, multi-page** how-to (2–4 pages), navigated by ‹back / Next / Got it with
page dots; tap the backdrop to close. It auto-opens **once** on first visit (flag `<game>.tut`
in localStorage). The whole thing is one self-contained block inserted before each game's main
`<script>`: shared `.tut-*` CSS, the `#tut` markup, and an **IIFE** holding a `TUT` array of
`{illo, title, text}` pages + a tiny controller. Illustrations are **inline SVG built in JS**
from small helper fns (`S`, `arrow`, `chk`, `crs`, plus per-game shape helpers like
`tube`/`cdy`/`dt`/`grid9`) on a `0 0 200 130` viewBox — no images, no text-heavy slides.
To edit a game's tutorial, change its `TUT` array; to restyle all, edit the `.tut-*` CSS
(duplicated per file). The IIFE keeps its vars off the global scope so it never collides with
game code.

### Per-game localStorage namespace (critical rule)
Each game uses its **own key prefix** so games never collide and one game's reset never
touches another:

| Game     | Path         | localStorage keys |
|----------|--------------|-------------------|
| Pour     | `/pour/`     | `pour.level`, `pour.sound` |
| Sudoku   | `/sudoku/`   | `sudoku.state`, `sudoku.stats`, `sudoku.sound` |
| Codeword | `/codeword/` | `codeword.level`, `codeword.state`, `codeword.sound` |
| 2048     | `/2048/`     | `2048.state`, `2048.best`, `2048.sound` |
| Drop     | `/drop/`     | `drop.state`, `drop.best`, `drop.sound` |
| Ember    | `/ember/`    | `ember.level`, `ember.meta`, `ember.run`, `ember.sound` |
| Sweets   | `/sweets/`   | `sweets.state`, `sweets.best`, `sweets.level`, `sweets.sound` |
| Dots     | `/dots/`     | `dots.state`, `dots.best`, `dots.level`, `dots.sound` |
| Bus      | `/bus/`      | `bus.state`, `bus.level`, `bus.sound`, `bus.tut` |

The hub (`/index.html`) reads these **read-only** to show a progress chip on each card.

### Adding a new game (the recipe)
1. New folder `gamename/index.html`. Copy the shared `<style>` head + atmosphere + a
   back-to-hub link: `<a class="brand" href="../">‹ gamename.</a>`.
2. Use its own `gamename.*` localStorage keys.
3. Add a `<a class="card" href="gamename/">` to `/index.html` (with an inline-SVG icon)
   and a progress-chip reader in the hub's `renderChips()`.
4. (Optional) wire cross-device sync — add the game to the `REGISTRY` in `sync.js` and
   one `PlaySync.init` call. See the **Cross-device cloud sync** section below.
5. Test on a 375-wide viewport, then push to `main`.

---

## Cross-device cloud sync (Firebase)

Optional, **offline-first**, opt-in. `localStorage` stays the source of truth on each
device; the cloud is an **additive mirror** that does nothing until the player signs in.
Added 2026-06-23, live on all 8 games.

### How it works
- **One shared file, `/sync.js`** (repo root). The hub loads it as `sync.js`; each game
  loads it as `../sync.js`. It exposes `window.PlaySync`.
- **Sign-in lives ONLY on the hub** — a "☁ sign in to sync" button in the hub header.
  Firebase keeps the auth session for the whole origin, so once you sign in on the hub,
  **every game page is already signed in** and syncs itself silently, no per-game button.
- **Google sign-in** (`signInWithPopup`) → data stored in **Firestore** at `users/{uid}`,
  one map field per game. Same pattern as the owner's period-tracker app (`cycle-garden`).
- The Firebase web config in `sync.js` is **committed in plaintext — this is safe**.
  Security is enforced by **Firestore rules** (each player can only read/write their own
  `users/{uid}` doc), not by hiding the keys. SDK is lazy-loaded from the gstatic CDN
  (v10.12.2) so the no-build / no-dependency rule still holds.

### Firebase project (owner's, account `xykoh2012@gmail.com`)
- Project id **`play-ee089`** · console: console.firebase.google.com.
- **Auth → Sign-in method:** Google enabled.
- **Auth → Settings → Authorized domains:** must include `forforever27.github.io`
  (and `localhost` for local testing, which is on by default). If sign-in popups fail
  with "unauthorized domain", this is why.
- **Firestore rules** (each user owns only their doc):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{uid} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
  ```

### What syncs (the REGISTRY in sync.js — single source of truth)
**Only monotonic progress markers sync.** Deliberately NOT the in-progress board blobs
(`*.state`) so two devices never clobber each other's live game, and NOT `*.sound`
(a device preference). Merge rules: `max` = highest wins; `maxmap` = per-key max of a
JSON object.

| Game     | Synced key(s)                  | Merge            |
|----------|--------------------------------|------------------|
| Pour     | `pour.level`                   | max              |
| Sudoku   | `sudoku.stats`                 | maxmap (counts)  |
| Codeword | `codeword.level`               | max              |
| 2048     | `2048.best`                    | max              |
| Drop     | `drop.best`                    | max              |
| Ember    | `ember.level`, `ember.meta`    | max, maxmap (gold)|
| Sweets   | `sweets.level`, `sweets.best`  | max, max         |
| Dots     | `dots.level`, `dots.best`      | max, max         |
| Bus      | `bus.level`                    | max              |

### Wiring a game (what each game does)
- Loads `../sync.js` before its main `<script>`.
- Calls `PlaySync.init({ game:'name', onRemote: fn })` at the end of its boot script.
  Fields + merge come from the REGISTRY; `onRemote` updates in-memory vars + repaints
  **without rebuilding the active board/run** (e.g. Pour/Codeword/Ember just bump the
  furthest-level var; Sudoku re-reads `stats` + refreshes the picker if open; 2048/Drop
  bump `best` + `paintHud()`; Sweets/Dots bump level+best + `paint()`).
- Calls `PlaySync.push()` at its progress milestone only (not every frame): 2048/Drop
  when `best` grows; Sweets/Dots at level-up; Codeword/Sudoku/Pour on win; Ember on
  `winLevel`.
- The hub calls `PlaySync.initHub({ btn, toast, onChange, render })`: manages the one
  sign-in button and, on login, pulls **every** registered game's progress, writes
  localStorage, and repaints the menu chips via `renderChips()`.

### Known cosmetic quirk (acceptable, no data loss)
Endless level games (Sweets, Dots) store the current level inside `*.state`, which isn't
synced — only the `*.level` counter is. So on a *fresh* second device the level **number**
follows you, but the board starts at its normal opening layout and scales up to the synced
level on the next level-up. To make the board jump straight to the synced level you'd need
to also sync `*.state` (with a "higher level wins" merge) — not done, to avoid clobbering.

---

## The games

### Pour — `/pour/` (the original)
Calm colour water-sort puzzle. Seeded generator (level number = seed) builds endless
unique levels, each **verified solvable** by a built-in DFS solver before display.
Generation runs in a blob Web Worker with next-level prefetch + a "mixing colours…" veil.
Difficulty curve ramps colours 3→9, then taller tubes, then a double-height centre "big
tube", then MEGA tiers (double-piece colours that only assemble in the big tube), then
twin big tubes at level 200+. Unlimited solver-powered Hint + free Skip. Level-select
replays any unlocked level; replays never shrink progress. Engine uses per-colour
`totals[]` and per-tube `caps[]`. **Only change for the hub:** a back-to-hub link on the
brand. `pour.level` key was preserved exactly, so pre-hub players kept their streak.

### Sudoku — `/sudoku/`
Classic 9×9. Boards generated by digging holes from a full solution while keeping the
solution **unique at every step** (`countSolutions` with cap 2, MRV backtracking — ~3ms).
Four difficulties by clue count: gentle 40 / classic 32 / tricky 27 / fiendish 23.
Pencil notes (bitmask per cell, auto-cleared from peers on placement), undo (300
snapshots), conflict highlighting. **Hint reveals ONLY the selected empty cell** (no
random fallback) — select an empty square first, else it toasts; refuses givens and
already-correct cells. `sudoku.state` = in-progress board (cleared on win),
`sudoku.stats` = solved counts per difficulty.

### Codeword — `/codeword/`
Every white cell shows a number 1–26; each number is a letter; crack the code. **60
pre-generated 13×13 grids are embedded** in the file (array `GRIDS`). The number↔letter
code is **re-seeded per level** (mulberry32), so the 60 grids replay fresh forever. A few
starter letters are revealed; A–Z keyboard; the number key-strip tracks placements; undo
button (header) steps back through place/erase/hint; erase key on the keyboard.
- **Puzzles built offline by `tools/gen_codeword.py`** → writes `tools/codeword_data.json`
  → injected into `codeword/index.html` replacing the `__PUZZLES__` placeholder.
  Backtracking dictionary fill, every grid uses all 26 letters, curated 3-letter
  whitelist + JUNK/brand blocklist so no "WAV"/"IDS"/brand-name junk.
  Re-run: `py tools/gen_codeword.py` then re-inject (see git history of the inject step).
- Known minor: occasional common proper noun (e.g. MAINE). Real codewords do this too;
  tighten the word list + regen if zero proper nouns is wanted.

### 2048 — `/2048/`
Classic slide-and-merge, site palette, animated tiles keyed by id. Swipe (pointer) +
arrows/WASD. **Multi-level undo** (header) — `undoStack` of up to `UNDO_CAP` (50)
snapshots `{b,s}`, pushed each move, popped on undo. The whole stack is persisted in
`2048.state` (`u` field) so undos survive a reload; `restore()` tolerates the old
single-snapshot `{b,s}` format (wraps it as a 1-item stack). **Out-of-moves overlay
offers "↩ undo last move"** because the overlay covers the header button — clicking it
undoes one and dismisses the overlay, then the header undo continues back through the
stack. `2048.best` tracked.

### Drop — `/drop/`
Suika-style merge: drop "moons", two equal merge into the next of 11 tiers, up to a sun.
Canvas circle physics (gravity, collisions, restitution). Lose if the pile overstacks the
top line. **Save quirks to remember:** coordinates stored in `BASE_W` units with y
measured **from the floor** so a saved pile survives any screen-size change; and the save
must **filter `dead` (just-merged) circles** or they resurrect on reload. `drop.best`.

### Ember — `/ember/` (the big one, most iterated)
**Genre: the arcade-idle game from the Whiteout Survival / 无尽冬日 fake ads** — NOT the
real strategy game. Owner explicitly wants the *ad-version* mechanics, and it's a
**stress-relief game — keep it easy to win.**

History worth knowing: v1 was a literal survival game (day/night, player HP, monster
waves, shop modal). Owner rejected it — the ad mechanics are the spec. It was fully
rewritten. Don't reintroduce day/night or a player HP bar.

**Core loop (all physical, like the ads):**
- Walk into pines → auto-chop via **orbiting axes** → **logs stack into a tall swaying
  pile on your back** (no capacity, no "FULL" state; >34 items shows ×count).
- Walk to the **SELL stall** → pile pours off one item per tick, money counts up.
  Money bills then stack on top of the pile too.
- **Buying = standing on dashed floor pads** that drain your wallet with a fill animation.
- Bears raid the **circular fence** on an escalating clock. **No player HP** — a bear
  swipe just knocks items off your pile (re-pickup-able). **Lose only when the fence
  breaks** (and money survives into the retry).
- **Win = build all 9 camp structures** (sequential reveal): banner → watchtower →
  storehouse (+wood price) → strong fence → watchtower II → **meat line** → great fence →
  watchtower III → great hall (completes camp + level).
- The **meat line** is the automation: once built, killed-bear meat **flies itself to the
  stall and auto-sells**.

**Pads / upgrades:**
- `axe` (+1 orbiting axe, cap grows w/ level), `boots` (speed, cap grows w/ level),
  `repair` (fence), `struct` (next camp structure — its position follows the next unbuilt
  one), `twr` (TOWERS+ damage, appears once first watchtower built), `mkt` (PRICES+ wood &
  meat sale price, appears once storehouse built).
- **Pad payments are STICKY** (owner-requested, explicitly NOT refund-on-walk-away):
  partial money poured stays on the pad, continues next visit, and **persists in the
  checkpoint** (`pp` array). Money only refunds when a pad has nothing left to sell.
- Upgrade **caps rise with level** (`axeMax()`=min(8,5+lv), `bootMax()`=min(6,3+lv)) so
  higher levels have more to buy.

**Camp expansion:** the two fence structures **physically grow the camp ring**
(`CAMP.r` 185 → 245 → 305, +60 each). `applyFenceTier()` resizes the ring, slides the
watchtowers out onto the new wall, and re-renders the ground. Some pines end up safely
inside the walls.

**Difficulty (tuned for stress-relief):** fence 500 HP, bears soft (`4+lv` dmg) and slow,
first raid at 30s, calm escalation. Towers hit 18 base × 1.3^(lv-1) × 1.35^twrUp, fire
every .5s. Costs scale ×1.4 per level. Forest is **350 dense pines** in tight clumps
(~43px avg nearest-neighbour — next tree is a step away).

**Saves:** `ember.meta` = money (persists forever, even through failed runs);
`ember.level` = furthest level; `ember.run` = mid-level checkpoint (v2 format: counts,
tiers, pad pours, elapsed — world is re-genned from the level seed, not stored). The menu
shows a "Continue" button when a run checkpoint exists.
- **Bug class to avoid:** anything calling `saveRun()` *after* `winLevel()`/`failLevel()`
  recreates a stale "Continue". Guard saves with `mode==='play'`.

> **Both Sweets and Dots use "gentle levels" (owner-chosen): no timers, no fail, ever.**
> A level counter + a small goal that always eventually succeeds, then a celebratory card and
> the next level. Goal type rotates by `(level-1)%4`: `color, color, score, special`
> (`special` = "make a big match (4+)" in Sweets / "close a loop" in Dots). `makeGoal(lv)`
> builds it; needs scale gently with level. They share the **same high-contrast 5-colour
> palette** `['#ff6f69','#ffc857','#5fc97e','#5b8def','#c07ce8']` (red/amber/green/blue/purple)
> — distinct by hue alone, **no inner shapes** (an earlier shapes-for-colour-blindness version
> was dropped; owner found it visually noisy). Hub chips read `*.level`.

### Sweets — `/sweets/`
Match-three (the Candy-Crush concept). **7×7 board, 5 colours, GAP 10** — deliberately roomy
and calm (an earlier 8×8-with-shapes build felt too tight/busy). Each colour is a plump, candy-like
SVG silhouette — gumball (circle) / toffee (squircle) / chubby triangle / gumdrop / heart —
with a gloss highlight and `filter:drop-shadow`; no symbols. Swap two adjacent gems (drag
*or* tap-then-tap); the swap reverts if it makes no match. Matches of 3+ clear, gravity pulls
gems down, new ones fall from the top, cascades chain with a rising combo multiplier.
**Special candies (full Candy-Crush set).** Created in `computeCreations(groups)`:
4-in-a-row → **striped** (clears its row/column), L/T crossing of one colour → **wrapped**
(3×3 blast), 5-straight → **colour bomb** (a *colourless* sprinkle ball — excluded from colour
runs in `findGroups`; `hasMove` always treats a bomb as a live move). Striped/wrapped activate
by being matched again and **chain** via `detonate()` (stripe→line, wrap→3×3, bomb-caught→a
colour). The colour bomb activates on **swap**: `specialCombo(A,B,a,b)` (called in `trySwap`
before the match check) fires special-vs-special / bomb-vs-anything moves without needing a
match — bomb+plain = clear that colour, bomb+bomb = whole board, bomb+striped/wrapped =
convert that colour to stripes/wraps then detonate all, stripe+stripe = cross, stripe+wrap =
3-row+3-col, wrap+wrap = 5×5. All clears funnel through one `applyClear(set, combo, creations)`
(detonate → score/goal → remove → promote new specials → collapse), shared by `settle()` and
combos. Specials persist through saves/undo (`packGrid`/`buildGrid` store `[colour, special]`).
Engine: `findGroups()` returns each run `{cells, orient, len}`; `findMatches()` derives
`{cells, maxRun}`; `collapse()` does per-column gravity+refill; `settle()` runs the cascade. Auto-reshuffles if no move; manual **Shuffle** pill. **One-step undo** (header) reverts the
last swap + its whole cascade — snapshot captured before the swap, committed only if it
sticks, persisted in `sweets.state.u` so it survives a reload.
`sweets.state` = {board (each cell a
colour, or `[colour,special]`), score, level, goal, undo snapshot}.

### Dots — `/dots/`
Connect-the-dots (the *Two Dots* concept). **6×6 grid, 5 colours**, solid glossy circles
(`dotPx = cellPx*0.7`). Drag through adjacent same-colour dots — **8-directional, diagonals
included** (`adjacent()` = Chebyshev distance 1; `hasMove()` checks all 8 neighbours) — release
with 2+ to clear. **Closing a loop** (touch a dot already in the path) clears **every dot of
that colour** — the doomed dots throb, bigger payout. The loop only counts when the closed path
is a **true axis-aligned rectangle/square outline** (`isRectangleLoop()`: orthogonal edges only,
returns to the start, traces the full bounding-box perimeter). With diagonals on, a 3-dot
triangle (or any non-rectangular shape) would otherwise be a trivial instant-win — those just
clear their dots as a normal line instead. An SVG `<polyline>` over the board draws
the live connecting line in the dot's colour. Cleared dots fall, new ones drop
(`collapse()`, same pattern as Sweets). **One-step undo** (header) reverts the last
connect/clear, persisted in `dots.state.u`. `dots.state` = {colours, score, level, goal,
undo snapshot}. Path/loop logic lives in the `pointerdown/move/up` handlers + `resolve()`.

---

## Tech / workflow notes

- **Preview server:** `.claude/launch.json` defines `games-static` (`py -m http.server 8642`).
  Use the preview tooling; serve from the repo root so paths like `/pour/`, `/ember/` work.
- **Testing canvas games (Ember, Drop):** the preview browser tab is usually backgrounded,
  so `requestAnimationFrame` is throttled and wall-clock waits don't advance the game.
  Drive tests by calling **`update(1/60)` in a loop** from `preview_eval` instead. Watch
  for leftover state between eval blocks (clear `bears`/`ground`, reset `wallet`).
- **Deploy + verify:**
  ```
  git add -A && git commit -m "..." && git push origin main
  # wait for Pages, then confirm:
  gh api repos/forforever27/pour/pages/builds/latest --jq '.status'   # -> "built"
  curl -s "https://forforever27.github.io/pour/ember/?v=$(date +%s)" | grep -c "some-new-token"
  ```
  Note: the Pages build-status API often lags (`"building"` for a minute or two) even
  after the new content is already serving. Don't trust it alone — confirm by `curl`-ing
  the live file for a token from your change (with a `?v=timestamp` cache-buster).
- **gh CLI:** two accounts exist — `forforever27` (personal, must be active for this repo)
  and `xinyee-a28` (work). The Pour repo's local git config uses `gh auth git-credential`,
  so pushes work as long as gh's active account is `forforever27` (`gh auth switch` if not).
- **Line endings:** Git warns LF→CRLF on commit (Windows). Harmless.

---

## Likely next steps / open ideas
- Ember balance is all single constants near the top of its `<script>` — easy to tune
  (bear pacing, prices, expansion sizes, forest density, caps). Owner iterates on feel.
- Possible future games mentioned in passing: more merge/idle variants. Same recipe.
- If ever zero-proper-noun codewords are wanted: tighten `gen_codeword.py` word list, regen.

---

_Last updated after (2026-07-12, second pass): **full-site audit — every game + sync.js
reviewed end-to-end, all confirmed bugs fixed** (verified by driving each game in a browser).
**sync.js (affects everything):** (1) account-switch leak — sign-out never cleared
localStorage, so the NEXT Google account to sign in on a shared device inherited and
uploaded the previous account's progress; now a stored `playsync.uid` detects an account
CHANGE and clears all synced keys first (sign-out / first sign-in unchanged, still
offline-first). (2) Firestore `onSnapshot` listeners stacked on every re-auth/token refresh
and survived sign-out; now unsubscribed via `S.unsub`. (3) one throwing `onRemote` froze
sync until reload (`applyingRemote` stuck true); now try/finally. (4) **ember gold dup
exploit**: spendable gold was max-merged, so buy→refresh refunded the money while keeping
the upgrade; `maxmap` now supports `localWins:["gold"]` — the device's own wallet stands,
cloud only seeds fresh devices. (5) when local was ahead of cloud, nothing pushed — snapshot
handler now pushes back if local won. **Per game:** 2048 — best pushed BEFORE saved (cloud
best lagged one improvement forever; reordered), win overlay could be swallowed by a
same-move game-over (keep-going now hands over), moves accepted in the 600ms pre-overlay
win gap (winPending flag). Drop — same stale-best push (reordered); resize/rotate rescaled
radii but not positions → spurious mass-merges (positions now rescale); restart during the
420ms drop cooldown left the first drop dead (canDrop reset). Dots — `pointercancel`
COMMITTED a half-drawn path as a move (now aborts); a second finger corrupted the active
path (pointerId ownership); levelUp/remote-level-adopt now clear undo + regenerate the
goal (undo fought the cloud's monotonic level; goal used to lag the adopted level). Pour —
Skip pushed stale `pour.level` (the same bug Bus inherited; reordered), NaN guard on a
corrupt saved level (empty soft-locked board). Ember — `gold|0` 32-bit coercion (wallet
>2.1B would wrap to 0; now Number()), sub-$1 wallet remainder unspendable (`>=1`→`>0`).
Codeword — hardware keyboard typed onto the board under the Levels/How-to-play modals and
during the 500ms post-win gap (shared `uiLocked()` guard + `won` flag), Ctrl/Cmd/Alt
shortcuts consumed as letters. Sudoku — no already-won guard: double-tapping the winning
digit within the 500ms pre-overlay gap counted the solve twice into synced stats (`solved`
flag, board locks instantly); `n` notes-toggle worked under modals. Sweets — a cascade
kept crediting the NEXT level's goal after a mid-cascade level-up (`goalFrozen` until the
cascade drains); remote level adopt kept the old goal (regenerated + undo cleared); stale
tap-selection survived undo/restart/shuffle (unintended swaps; `clearSel()`); `busy` could
stick on a throw (try/finally in trySwap + shuffle). NOT fixed (accepted): best-score only
pushed on level-up in dots/sweets (max-merge reconciles on next login), drop's game-over
jitter threshold, sweets packGrid null/color-0 latent collision, pour deep-level generator
fallback. All changes local, NOT yet pushed to GitHub Pages.
Prior: **Bus bug-fix pass** — three gameplay bugs found and fixed
in `bus/index.html`, verified by playing through in a browser: (1) **false "Bays clogged"
race** — a bus tapped out of the lot spends ~330ms animating before it lands in a bay; the
background boarding loop could run its stuck-check in that window, see the needed bus in
neither lot nor bay, and wrongly end the level. Now a `driving` counter defers stuck/win
checks until in-flight buses park. (2) **Restart could land mid-game** — restart rewound to
`history[0]`, but saves trim undo history to 150 entries, so after a reload on a long level
"restart" restored a mid-game state. Now a pristine `startSnap` (level-start snapshot) is
kept and persisted in `bus.state` (`start` field); Restart AND the jam dialog's "Retry
level" both restore the SAME board from its true start (retry previously regenerated a
different board, contradicting its label). (3) **Skip synced stale progress** — `skip()`
called `PlaySync.push()` before `startLevel()` saved the new `bus.level`, so the cloud got
the old value; reordered. Also added `Others/Games/.claude/launch.json` (`games-static`,
`py -m http.server 8642`) for local browser testing.
Prior: added **Bus** (`/bus/`) — a drive-out jam + boarding game (the "bus
fever" loop: a packed lot of buses each facing a direction; tap a bus to drive it straight
out IF the lane to the edge is clear; it pulls into one of 3 boarding bays; clear the lot to
win). **Spatial jam is always solvable by construction** (buses are "driven in" from the
edges, so reversing that order is a valid clear), and generation **rejection-samples for a
tangled layout** — keeps regenerating until ~45%+ of buses block each other, so it takes
thought, not mindless tapping. **Big dense lot** (5×5 → 7×7, ~62-80% filled). **Buses are
rectangular; seats = length** (mostly length-2; up to 4 at high levels). **Each colour maps
to ONE length and is shared by ≥2 buses** — so a colour's line-count is a sum across buses
(never a single bus's seats), AND a colour's front run always fills a same-colour bus exactly
(no half-loaded clog). **Boarding is STRICT front-of-queue (FIFO)**: only the rider at the
front boards, into a matching bay; if their bus isn't at a bay the whole line waits — the
queue is meaningful. It runs in the **background (non-blocking)** so you can keep driving
buses while riders load (a `gen` token cancels in-flight boarding on undo/restart). **Lose
state**: clog all 3 bays with non-front buses and you jam ("Bays clogged." → **↩ Undo last
move** to step back the bad move and keep the board, or **Retry level** for a fresh one).
**Isometric/2.5D look** (CSS `perspective` + `rotateX/rotateZ`; each bus is a real extruded
cuboid — bright roof with a direction arrow, window bands only on the two LONG sides, a
windshield on the driving end; boarding-bay buses drawn side-on, width scaled to seats).
Blocked buses are NOT dimmed — tapping a jammed one plays a shudder (`.jam` keyframe lunging
in its facing direction). **Pour-style controls**: **Hint** (highlights the lowest-`ord` bus
still in the lot — always the next correct move, and always movable), **free Skip**, **Levels**
(replay any unlocked level), **unlimited undo** (history stack) + **Restart** (back to the
level's start). Like Pour, `bus.level` stores `progress` (furthest unlocked, synced max); a
separate `level` is what's in play, so replaying earlier levels never lowers progress.
Prior: cross-device cloud sync (Firebase `play-ee089`), Sweets, Dots. 9 games live._
