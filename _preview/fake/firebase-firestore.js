// PREVIEW ONLY — in-memory stand-in for the slice of Firestore the app uses.
// Sample data lives in this tab and resets on reload. Add ?scene=fresh to the
// address to start with an empty list and no history.

const DAY = 86400000;
const NOW = Date.now();
const ts = (ms) => ({ toMillis: () => ms });
const daysAgo = (d) => NOW - d * DAY;

const store = { items: new Map(), subscriptions: new Map() };
const listeners = new Set();

function seed() {
  const put = (id, name, category, emoji, status, updatedDaysAgo, flagDays) =>
    store.items.set(id, {
      name,
      category,
      emoji,
      custom: false,
      sortOrder: 0,
      status,
      updatedAt: ts(daysAgo(updatedDaysAgo)),
      ...(flagDays ? { flagLog: flagDays.map(daysAgo) } : {}),
    });

  // 4 all gone (more than 3) and 6 running low (more than 5) → build-up warning
  put("default-milk", "Milk", "dairy", "🥛", "out", 5, [40, 33, 26, 19, 12, 5]);
  put("default-eggs", "Eggs", "dairy", "🥚", "out", 0, [22, 0]);
  put("default-toilet-paper", "Toilet paper", "household", "🚽", "out", 2);
  put("default-chicken", "Chicken", "meats", "🍗", "out", 1);
  put("default-bread", "Bread", "bakery", "🍞", "low", 3);
  put("default-coffee", "Coffee", "drinks", "☕", "low", 1, [43, 29, 15, 1]);
  put("default-bananas", "Bananas", "produce", "🍌", "low", 0);
  put("default-rice", "Rice", "pantry", "🍚", "low", 6);
  put("default-dish-soap", "Dish soap", "household", "🧼", "low", 4);
  put("default-butter", "Butter", "dairy", "🧈", "low", 2);

  // In stock, with history
  put("default-paper-towels", "Paper towels", "household", "🧻", "ok", 12, [40, 26, 12]); // due soon
  put("default-yogurt", "Yogurt", "dairy", "🥣", "ok", 10, [30, 20, 10]); // due now
  put("default-bacon", "Bacon", "meats", "🥓", "ok", 3, [66, 45, 24, 3]); // every 3 weeks, not due
  put("default-juice", "Juice", "drinks", "🧃", "ok", 20, [50, 20]); // 2× lately, no pattern yet
}

if (new URLSearchParams(location.search).get("scene") !== "fresh") seed();

function snapshot(name) {
  const entries = [...store[name].entries()];
  return {
    forEach(cb) {
      for (const [id, data] of entries) cb({ id, data: () => ({ ...data }) });
    },
  };
}

function notify(name) {
  for (const l of listeners) if (l.name === name) l.next(snapshot(name));
}

function resolve(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = v && v.__serverTs ? ts(Date.now()) : v;
  return out;
}

export function initializeFirestore() {
  return {};
}
export function getFirestore() {
  return {};
}
export function persistentLocalCache() {
  return {};
}
export function collection(db, name) {
  return { name };
}
export function doc(db, name, id) {
  return { name, id };
}
export function serverTimestamp() {
  return { __serverTs: true };
}

export async function setDoc(ref, data, opts) {
  const col = store[ref.name] || (store[ref.name] = new Map());
  const prev = opts && opts.merge ? col.get(ref.id) || {} : {};
  col.set(ref.id, { ...prev, ...resolve(data) });
  notify(ref.name);
}

export async function deleteDoc(ref) {
  if (store[ref.name]) store[ref.name].delete(ref.id);
  notify(ref.name);
}

export function writeBatch() {
  const ops = [];
  return {
    set(ref, data) {
      ops.push([ref, data]);
    },
    async commit() {
      for (const [ref, data] of ops) {
        const col = store[ref.name] || (store[ref.name] = new Map());
        col.set(ref.id, resolve(data));
      }
      for (const name of new Set(ops.map(([ref]) => ref.name))) notify(name);
    },
  };
}

export function onSnapshot(colRef, next) {
  const l = { name: colRef.name, next };
  listeners.add(l);
  setTimeout(() => next(snapshot(colRef.name)), 120);
  return () => listeners.delete(l);
}

// Handy when poking at the preview from the console.
window.__previewStore = store;
