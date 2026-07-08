# 🛒 Family Groceries

A tap-only shared grocery list for one household. When milk runs out, anyone
taps **Dairy → Milk → All gone** — it appears on everyone's list instantly and
the other phones get a push notification. Tap **Got it ✓** after shopping to
clear it.

- **No accounts, no login.** One URL, shared by QR code on the fridge.
- **Works on iPhone and Android** in the regular browser, installable to the
  home screen (PWA).
- **Free to run indefinitely** at family scale: static hosting (Vercel free
  tier) + Firebase Firestore (free Spark plan, no credit card) + free web push
  (VAPID) — no paid APIs anywhere.
- **Zero typing for the 27 default items across 8 categories.** A "Something else…" tile lets you
  type a new item once; after that it's a permanent button.

## How it works

```
Phone taps "Milk → All gone"
   ├─► Firestore write ──► realtime snapshot ──► other phones' screens update
   └─► POST /api/notify ─► reads stored push subscriptions from Firestore
                           and web-pushes "🔴 Milk is all gone" to the other phones
```

| Piece | Tech | Cost |
|---|---|---|
| Frontend | Static PWA (vanilla JS, no build step) | free |
| Hosting + push function | Vercel Hobby (`api/notify.js`) | free |
| Database + realtime sync | Firebase Firestore, Spark plan | free, no card |
| Push notifications | Web Push with VAPID keys | free |

Firestore's Spark plan was chosen over Supabase because Supabase pauses free
projects after a week of inactivity; Spark never pauses and needs no credit
card.

## One-time setup (~20 minutes)

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) →
   **Add project** (any name, Analytics off is fine). Stay on the free **Spark**
   plan.
2. **Build → Firestore Database → Create database** → production mode → pick a
   region near you.
3. Open the **Rules** tab, replace the contents with the rules in
   [`firestore.rules`](firestore.rules), and **Publish**.
4. **Project settings (gear icon) → General → Your apps → Web app (`</>`)** →
   register an app (no hosting needed) → copy the `firebaseConfig` values into
   [`config.js`](config.js).

### 2. Generate push (VAPID) keys

On any machine with Node:

```bash
npx web-push generate-vapid-keys
```

- Put the **public key** into `config.js` (`vapidPublicKey`).
- Keep the **private key** for the next step — it must never go into `config.js`.

### 3. Deploy to Vercel

1. Push this repo to GitHub, then at [vercel.com](https://vercel.com) →
   **Add New → Project** → import the repo. No framework, no build command —
   the defaults work.
2. In the project's **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | public key from step 2 |
   | `VAPID_PRIVATE_KEY` | private key from step 2 |
   | `VAPID_SUBJECT` | `mailto:you@example.com` (your email) |
   | `FIREBASE_PROJECT_ID` | project ID from step 1 |
   | `FIREBASE_API_KEY` | `apiKey` value from step 1 |

3. Redeploy so the variables take effect. Your app is live at
   `https://<project>.vercel.app`.

### 4. Print the QR code

Generate a QR code for the Vercel URL — e.g. `npx qrcode <url>` in a terminal,
or any free online QR generator — print it, and stick it on the fridge.

## Per-phone setup (each family member, ~1 minute)

**iPhone** (order matters — iOS only allows web push from home-screen apps):

1. Scan the QR code, open the link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open **Groceries** from the new home-screen icon.
4. Tap the bell 🔕 (or the "Turn on" banner) and **Allow** notifications.

**Android:**

1. Scan the QR code, open the link in Chrome.
2. Tap the bell 🔕 (or "Turn on") and **Allow** notifications.
3. Optional: menu → **Add to Home screen** for the app icon.

## Using it

- **Report:** tap a category → tap the item → **Running low** or **All gone**.
- **Shop:** the list on the home screen shows **all gone** items first, then
  **running low**, updating live on every phone.
- **Bought it:** tap **Got it ✓** on a list entry to clear it.
- **New item:** in any category, tap **➕ Something else…**, type the name once,
  pick its status. From then on it's a permanent tile — nobody types it again.

## Notes & limits

- **Access control is the URL.** There are no accounts by design; anyone who
  has the link (or the Firebase project ID) can read and edit the list. For a
  household grocery list that trade-off is intentional — don't put anything
  private in it.
- Pushes are informational ("milk is out"), not guaranteed-delivery alerts.
  The list itself always syncs in realtime regardless.
- Firestore free quota (50k reads / 20k writes per day) is thousands of times
  more than three users will ever use.
- To regenerate the app icons: `node scripts/make-icons.js`.
