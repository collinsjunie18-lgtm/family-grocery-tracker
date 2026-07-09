/* Family Groceries — tap-only shared grocery list.
   Data lives in Firestore (realtime sync); push goes through /api/notify.
   Build marker: categories = Dairy, Bakery, Pantry, Produce, Drinks, Household,
   Meats, Leftovers. Bump this line to force a fresh Vercel deploy / cache bust. */

const CATEGORIES = [
  { id: "dairy", name: "Dairy", emoji: "🥛" },
  { id: "bakery", name: "Bakery", emoji: "🍞" },
  { id: "pantry", name: "Pantry", emoji: "🥫" },
  { id: "produce", name: "Produce", emoji: "🍌" },
  { id: "drinks", name: "Drinks", emoji: "🧃" },
  { id: "household", name: "Household", emoji: "🧻" },
  { id: "meats", name: "Meats", emoji: "🥩" },
  { id: "leftovers", name: "Leftovers", emoji: "🍱" },
];

const DEFAULT_ITEMS = [
  { name: "Milk", category: "dairy", emoji: "🥛" },
  { name: "Eggs", category: "dairy", emoji: "🥚" },
  { name: "Butter", category: "dairy", emoji: "🧈" },
  { name: "Yogurt", category: "dairy", emoji: "🥣" },
  { name: "Bread", category: "bakery", emoji: "🍞" },
  { name: "Bagels", category: "bakery", emoji: "🥯" },
  { name: "Cereal", category: "pantry", emoji: "🥣" },
  { name: "Rice", category: "pantry", emoji: "🍚" },
  { name: "Pasta", category: "pantry", emoji: "🍝" },
  { name: "Peanut butter", category: "pantry", emoji: "🥜" },
  { name: "Bananas", category: "produce", emoji: "🍌" },
  { name: "Apples", category: "produce", emoji: "🍎" },
  { name: "Lettuce", category: "produce", emoji: "🥬" },
  { name: "Juice", category: "drinks", emoji: "🧃" },
  { name: "Coffee", category: "drinks", emoji: "☕" },
  { name: "Soda", category: "drinks", emoji: "🥤" },
  { name: "Paper towels", category: "household", emoji: "🧻" },
  { name: "Toilet paper", category: "household", emoji: "🚽" },
  { name: "Dish soap", category: "household", emoji: "🧼" },
  { name: "Trash bags", category: "household", emoji: "🗑️" },
  { name: "Chicken", category: "meats", emoji: "🍗" },
  { name: "Ground beef", category: "meats", emoji: "🥩" },
  { name: "Bacon", category: "meats", emoji: "🥓" },
  { name: "Deli meat", category: "meats", emoji: "🍖" },
  { name: "Fish", category: "meats", emoji: "🐟" },
  { name: "Leftovers", category: "leftovers", emoji: "🍲" },
  { name: "Prepared meals", category: "leftovers", emoji: "🍱" },
];

const cfg = window.APP_CONFIG || {};
const configured =
  cfg.firebase &&
  cfg.firebase.projectId &&
  !/^YOUR_/.test(cfg.firebase.projectId) &&
  !/^YOUR_/.test(cfg.firebase.apiKey || "YOUR_");

const $app = document.getElementById("app");
const $title = document.getElementById("title");
const $back = document.getElementById("back-btn");
const $bell = document.getElementById("bell-btn");
const $toastEl = document.getElementById("toast");
const $backdrop = document.getElementById("sheet-backdrop");
const $sheet = document.getElementById("sheet");

let db = null;
let fs = null; // firestore module namespace
let items = new Map(); // id -> data
let view = { name: "home" };
let seeded = false;
// "connecting" while we reach Firestore, "online" once the first snapshot
// lands, "offline" if it fails or is too slow. The UI never blocks on this —
// tiles render immediately regardless.
let dbState = "connecting";

const deviceId = (() => {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
    localStorage.setItem("deviceId", id);
  }
  return id;
})();

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// ── Boot ─────────────────────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

$back.addEventListener("click", () => {
  view = { name: "home" };
  render();
});

$bell.addEventListener("click", onBellTap);
$backdrop.addEventListener("click", (e) => {
  if (e.target === $backdrop) closeSheet();
});

main();

function main() {
  if (!configured) {
    renderSetupNeeded();
    return;
  }
  // Draw the home screen from code IMMEDIATELY. The category tiles live in
  // CATEGORIES and never depend on the database — so they must appear on first
  // paint, before (and independent of) any Firestore connection. This is what
  // guarantees a first-time visitor never sees a frozen "Loading…".
  render();
  updateBell();
  // Then reach the database in the background to overlay live item status.
  connectFirestore();
}

async function connectFirestore() {
  // Watchdog: if we haven't connected in a few seconds (blocked CDN, stalled
  // connection that never errors), fall back to the offline state. The tiles
  // are already interactive, so this only updates the status note.
  const watchdog = setTimeout(() => {
    if (dbState !== "online") {
      dbState = "offline";
      render();
    }
  }, 8000);

  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    fs = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const app = appMod.initializeApp(cfg.firebase);
    try {
      db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
    } catch {
      db = fs.getFirestore(app);
    }
    fs.onSnapshot(
      fs.collection(db, "items"),
      (snap) => {
        clearTimeout(watchdog);
        dbState = "online";
        items = new Map();
        snap.forEach((d) => items.set(d.id, d.data()));
        if (!seeded) seedMissingDefaults();
        render();
      },
      () => {
        // Reads failed (network / rules). Keep the tiles up; just flag offline.
        clearTimeout(watchdog);
        dbState = "offline";
        render();
      }
    );
  } catch (e) {
    // Firebase SDK failed to load (blocked or offline). Tiles stay usable.
    clearTimeout(watchdog);
    dbState = "offline";
    render();
  }
}

// Writes any default item that isn't in the database yet — covers both a brand
// new database and existing ones after new defaults are added in an update.
async function seedMissingDefaults() {
  seeded = true;
  const missing = DEFAULT_ITEMS.map((item, i) => ({ item, i })).filter(
    ({ item }) => !items.has("default-" + slug(item.name))
  );
  if (!missing.length) return;
  const batch = fs.writeBatch(db);
  for (const { item, i } of missing) {
    batch.set(fs.doc(db, "items", "default-" + slug(item.name)), {
      ...item,
      status: "ok",
      custom: false,
      sortOrder: i,
      updatedAt: fs.serverTimestamp(),
    });
  }
  await batch.commit().catch(() => {});
}

// ── Rendering ────────────────────────────────────────────────────────────────

function render() {
  if (view.name === "category") {
    renderCategory(view.id);
  } else {
    renderHome();
  }
}

function activeItems() {
  return [...items.entries()]
    .map(([id, it]) => ({ id, ...it }))
    .filter((it) => it.status === "out" || it.status === "low")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "out" ? -1 : 1;
      return millis(b.updatedAt) - millis(a.updatedAt);
    });
}

function renderHome() {
  $title.textContent = "🛒 Family Groceries";
  $back.hidden = true;

  const list = activeItems();
  const listHtml = list.length
    ? list
        .map(
          (it) => `
      <div class="list-row">
        <span class="emoji">${escapeHtml(it.emoji || "📦")}</span>
        <div class="info">
          <div class="name">${escapeHtml(it.name)}</div>
          <span class="chip ${it.status}">${it.status === "out" ? "ALL GONE" : "RUNNING LOW"}</span>
        </div>
        <button class="got-btn" data-got="${it.id}">Got it ✓</button>
      </div>`
        )
        .join("")
    : `<div class="empty-list">Nothing needed right now 🎉</div>`;

  const catsHtml = CATEGORIES.map((c) => {
    const count = list.filter((it) => it.category === c.id).length;
    return `
      <button class="tile" data-cat="${c.id}">
        ${count ? `<span class="badge">${count}</span>` : ""}
        <span class="emoji">${c.emoji}</span>
        <span>${c.name}</span>
      </button>`;
  }).join("");

  $app.innerHTML = `
    ${connBannerHtml()}
    ${notifBannerHtml()}
    <div class="section-label">Shopping list</div>
    ${listHtml}
    <div class="section-label">Something ran out? Tap its category</div>
    <div class="grid">${catsHtml}</div>
  `;
  wireCommon();
}

// Non-blocking status line shown only while connecting or when offline. It
// never gates the tiles — they're always visible underneath it.
function connBannerHtml() {
  if (dbState === "online") return "";
  if (dbState === "offline") {
    return `<div class="conn-note offline">Offline — showing your list from this device. Changes may not sync until you reconnect.</div>`;
  }
  return `<div class="conn-note">Syncing your list…</div>`;
}

// The default catalog lives in code (DEFAULT_ITEMS), so every default tile
// renders whether or not Firestore has been seeded. Firestore only supplies
// live status and any custom items a family added. This is what makes new
// categories/items appear for everyone the moment the code ships — no
// dependence on what's already in the database.
function categoryItems(catId) {
  const defaults = DEFAULT_ITEMS.map((item, i) => ({ item, i }))
    .filter(({ item }) => item.category === catId)
    .map(({ item, i }) => {
      const id = "default-" + slug(item.name);
      const doc = items.get(id);
      return {
        id,
        name: item.name,
        category: catId,
        emoji: item.emoji,
        custom: false,
        sortOrder: i,
        status: (doc && doc.status) || "ok",
        updatedAt: doc && doc.updatedAt,
      };
    });
  const custom = [...items.entries()]
    .map(([id, it]) => ({ id, ...it }))
    .filter((it) => it.category === catId && it.custom);
  return [...defaults, ...custom].sort((a, b) => {
    if (!!a.custom !== !!b.custom) return a.custom ? 1 : -1;
    if (!a.custom) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return a.name.localeCompare(b.name);
  });
}

// Resolve an item by id from Firestore, falling back to the code default when
// it hasn't been written to the database yet (so its tile still works on tap).
function getItem(itemId) {
  const doc = items.get(itemId);
  if (doc) return { id: itemId, ...doc };
  const i = DEFAULT_ITEMS.findIndex((it) => "default-" + slug(it.name) === itemId);
  if (i !== -1) {
    const def = DEFAULT_ITEMS[i];
    return {
      id: itemId,
      name: def.name,
      category: def.category,
      emoji: def.emoji,
      custom: false,
      sortOrder: i,
      status: "ok",
    };
  }
  return null;
}

function renderCategory(catId) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  if (!cat) {
    view = { name: "home" };
    return renderHome();
  }
  $title.textContent = `${cat.emoji} ${cat.name}`;
  $back.hidden = false;

  const catItems = categoryItems(catId);

  const tiles = catItems
    .map((it) => {
      const state =
        it.status === "out"
          ? `<span class="state out">ALL GONE</span>`
          : it.status === "low"
            ? `<span class="state low">RUNNING LOW</span>`
            : "";
      return `
      <button class="tile ${it.status !== "ok" ? "on-list " + it.status : ""}" data-item="${it.id}">
        <span class="emoji">${escapeHtml(it.emoji || "📦")}</span>
        <span>${escapeHtml(it.name)}</span>
        ${state}
      </button>`;
    })
    .join("");

  $app.innerHTML = `
    <div class="grid">
      ${tiles}
      <button class="tile add" data-add="${catId}">
        <span class="emoji">➕</span>
        <span>Something else…</span>
      </button>
    </div>
  `;
  wireCommon();
}

function wireCommon() {
  $app.querySelectorAll("[data-cat]").forEach((el) =>
    el.addEventListener("click", () => {
      view = { name: "category", id: el.dataset.cat };
      render();
    })
  );
  $app.querySelectorAll("[data-item]").forEach((el) =>
    el.addEventListener("click", () => openItemSheet(el.dataset.item))
  );
  $app.querySelectorAll("[data-got]").forEach((el) =>
    el.addEventListener("click", () => markItem(el.dataset.got, "ok"))
  );
  $app.querySelectorAll("[data-add]").forEach((el) =>
    el.addEventListener("click", () => openAddSheet(el.dataset.add))
  );
  const enableBtn = $app.querySelector("#enable-notif");
  if (enableBtn) enableBtn.addEventListener("click", onBellTap);
  const dismissBtn = $app.querySelector("#dismiss-notif");
  if (dismissBtn)
    dismissBtn.addEventListener("click", () => {
      localStorage.setItem("notifBannerDismissed", "1");
      render();
    });
}

function renderSetupNeeded() {
  $app.innerHTML = `
    <div class="setup">
      <h2>Almost there — one-time setup needed</h2>
      <p>This app hasn't been connected to its database yet.</p>
      <p>Open <code>config.js</code> and paste in the Firebase config and VAPID
      public key, then redeploy. The full walkthrough is in <code>README.md</code>.</p>
    </div>`;
}

// ── Item actions ─────────────────────────────────────────────────────────────

function openItemSheet(itemId) {
  const it = getItem(itemId);
  if (!it) return;
  const gotBtn =
    it.status !== "ok"
      ? `<button class="sheet-btn got" data-act="ok">✓ &nbsp;Got it — off the list</button>`
      : "";
  openSheet(`
    <h2>${escapeHtml(it.emoji || "📦")} ${escapeHtml(it.name)}</h2>
    <button class="sheet-btn low" data-act="low">🟡 &nbsp;Running low</button>
    <button class="sheet-btn out" data-act="out">🔴 &nbsp;All gone</button>
    ${gotBtn}
    <button class="sheet-btn cancel" data-act="cancel">Cancel</button>
  `);
  $sheet.querySelectorAll("[data-act]").forEach((el) =>
    el.addEventListener("click", () => {
      closeSheet();
      if (el.dataset.act !== "cancel") markItem(itemId, el.dataset.act);
    })
  );
}

function openAddSheet(catId) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  openSheet(`
    <h2>➕ Add to ${escapeHtml(cat.name)}</h2>
    <p class="sheet-note">Type it once — it becomes a permanent button.</p>
    <input type="text" id="new-item-name" maxlength="40" placeholder="e.g. Hot sauce" autocomplete="off">
    <button class="sheet-btn low" data-newact="low">🟡 &nbsp;Running low</button>
    <button class="sheet-btn out" data-newact="out">🔴 &nbsp;All gone</button>
    <button class="sheet-btn cancel" data-newact="cancel">Cancel</button>
  `);
  const input = $sheet.querySelector("#new-item-name");
  input.focus();
  $sheet.querySelectorAll("[data-newact]").forEach((el) =>
    el.addEventListener("click", async () => {
      const act = el.dataset.newact;
      if (act === "cancel") return closeSheet();
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      if (!db || !fs) {
        closeSheet();
        toast("Still connecting — try again in a moment");
        return;
      }
      closeSheet();
      const id = "custom-" + catId + "-" + slug(name);
      await fs
        .setDoc(
          fs.doc(db, "items", id),
          {
            name,
            category: catId,
            emoji: cat.emoji,
            custom: true,
            sortOrder: 999,
            status: act,
            updatedAt: fs.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((e) => toast("Couldn't save: " + e.code));
      toast(act === "out" ? `${name} — on the list` : `${name} — on the list`);
      sendPush(act, name);
    })
  );
}

async function markItem(itemId, status) {
  const it = getItem(itemId);
  if (!it) return;
  if (!db || !fs) {
    toast("Still connecting — try again in a moment");
    return;
  }
  // setDoc+merge so a default tile that was never seeded gets created on first
  // tap (updateDoc would fail on a missing doc); existing docs just get updated.
  await fs
    .setDoc(
      fs.doc(db, "items", itemId),
      {
        name: it.name,
        category: it.category,
        emoji: it.emoji || "📦",
        custom: !!it.custom,
        sortOrder: it.sortOrder ?? 0,
        status,
        updatedAt: fs.serverTimestamp(),
      },
      { merge: true }
    )
    .catch((e) => toast("Couldn't save: " + e.code));
  toast(
    status === "ok" ? `${it.name} — got it ✓` : `${it.name} — on the list`
  );
  sendPush(status === "ok" ? "got" : status, it.name);
}

// ── Push notifications ───────────────────────────────────────────────────────

function sendPush(kind, itemName) {
  // Fire-and-forget: realtime sync already updated everyone's screens.
  fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, item: itemName, senderId: deviceId }),
  }).catch(() => {});
}

function notifBannerHtml() {
  if (localStorage.getItem("notifBannerDismissed")) return "";
  if (pushSupported && Notification.permission === "granted") return "";
  if (Notification && Notification.permission === "denied") return "";
  if (isIOS && !isStandalone) {
    return `
      <div class="banner">
        <span>📲</span>
        <div class="text"><b>iPhone tip:</b> tap Share → <b>Add to Home Screen</b>, then open the app from the new icon to turn on notifications.</div>
        <button class="dismiss" id="dismiss-notif" aria-label="Dismiss">✕</button>
      </div>`;
  }
  if (!pushSupported) return "";
  return `
    <div class="banner">
      <span>🔔</span>
      <div class="text">Get a ping when someone marks an item.</div>
      <button class="primary" id="enable-notif">Turn on</button>
      <button class="dismiss" id="dismiss-notif" aria-label="Dismiss">✕</button>
    </div>`;
}

async function onBellTap() {
  if (isIOS && !isStandalone && !pushSupported) {
    openSheet(`
      <h2>📲 One more step on iPhone</h2>
      <div class="sheet-note">
        Notifications on iPhone only work once the app is on your home screen:
        <ol>
          <li>Tap the <b>Share</b> button in Safari</li>
          <li>Tap <b>Add to Home Screen</b></li>
          <li>Open <b>Groceries</b> from the new icon</li>
          <li>Tap the bell again and allow notifications</li>
        </ol>
      </div>
      <button class="sheet-btn cancel" data-act="cancel">OK</button>
    `);
    $sheet.querySelector("[data-act]").addEventListener("click", closeSheet);
    return;
  }
  if (!pushSupported) {
    toast("Notifications aren't supported in this browser");
    return;
  }
  if (Notification.permission === "denied") {
    toast("Notifications are blocked — enable them in your phone's settings");
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("Notifications stay off");
      updateBell();
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
    });
    if (db) {
      await fs.setDoc(fs.doc(db, "subscriptions", deviceId), {
        data: JSON.stringify(sub.toJSON()),
        ua: navigator.userAgent.slice(0, 200),
        updatedAt: fs.serverTimestamp(),
      });
    }
    toast("Notifications on 🔔");
  } catch (e) {
    toast("Couldn't turn on notifications");
  }
  updateBell();
  render();
}

function updateBell() {
  const on = pushSupported && Notification.permission === "granted";
  $bell.textContent = on ? "🔔" : "🔕";
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function openSheet(html) {
  $sheet.innerHTML = html;
  $backdrop.hidden = false;
}

function closeSheet() {
  $backdrop.hidden = true;
  $sheet.innerHTML = "";
}

let toastTimer = null;
function toast(msg) {
  $toastEl.textContent = msg;
  $toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toastEl.classList.remove("show"), 2200);
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
}

function millis(ts) {
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : Date.now();
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
