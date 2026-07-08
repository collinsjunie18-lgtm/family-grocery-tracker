/* Vercel serverless function: sends a web push to every stored subscription
   except the device that made the change. Free-tier friendly — the only
   dependency is `web-push`, and Firestore is reached over its public REST API
   (access is governed by the Firestore security rules). */

const webpush = require("web-push");

const FIRESTORE_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const MESSAGES = {
  out: (item) => ({ title: `🔴 ${item} is all gone`, body: "Added to the family grocery list." }),
  low: (item) => ({ title: `🟡 ${item} is running low`, body: "Added to the family grocery list." }),
  got: (item) => ({ title: `✅ ${item} — got it!`, body: "Crossed off the family grocery list." }),
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const missing = [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_API_KEY",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    res.status(500).json({ error: "Server not configured: missing " + missing.join(", ") });
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const { kind, item, senderId } = req.body || {};
  if (!MESSAGES[kind] || typeof item !== "string" || !item.trim()) {
    res.status(400).json({ error: "Expected { kind: out|low|got, item, senderId }" });
    return;
  }
  const payload = JSON.stringify(MESSAGES[kind](item.trim().slice(0, 60)));

  // List stored push subscriptions from Firestore.
  const listUrl = `${FIRESTORE_BASE()}/subscriptions?pageSize=300&key=${process.env.FIREBASE_API_KEY}`;
  const listRes = await fetch(listUrl);
  if (!listRes.ok) {
    res.status(502).json({ error: "Could not read subscriptions: " + listRes.status });
    return;
  }
  const { documents = [] } = await listRes.json();

  let sent = 0;
  let stale = 0;
  await Promise.all(
    documents.map(async (docEntry) => {
      const id = docEntry.name.split("/").pop();
      if (id === senderId) return; // don't notify the device that tapped
      let sub;
      try {
        sub = JSON.parse(docEntry.fields?.data?.stringValue || "");
      } catch {
        return;
      }
      if (!sub || !sub.endpoint) return;
      try {
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (err) {
        // 404/410 mean the subscription is dead (app removed, permission
        // revoked) — clean it up so we stop trying.
        if (err.statusCode === 404 || err.statusCode === 410) {
          stale++;
          await fetch(
            `${FIRESTORE_BASE()}/subscriptions/${encodeURIComponent(id)}?key=${process.env.FIREBASE_API_KEY}`,
            { method: "DELETE" }
          ).catch(() => {});
        }
      }
    })
  );

  res.status(200).json({ sent, stale });
};
