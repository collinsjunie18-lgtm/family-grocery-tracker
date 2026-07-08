// ── Fill this in once, then deploy. See README.md for the step-by-step guide. ──
//
// 1. firebase: from Firebase console → Project settings → Your apps → Web app →
//    "SDK setup and configuration" → Config. (These values are safe to commit —
//    they identify the project; access is controlled by Firestore rules.)
// 2. vapidPublicKey: the PUBLIC key from `npx web-push generate-vapid-keys`.
//    (The PRIVATE key goes only into Vercel environment variables — never here.)

window.APP_CONFIG = {
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  },
  vapidPublicKey: "YOUR_VAPID_PUBLIC_KEY",
};
