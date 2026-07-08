// ── Fill this in once, then deploy. See README.md for the step-by-step guide. ──
//
// 1. firebase: from Firebase console → Project settings → Your apps → Web app →
//    "SDK setup and configuration" → Config. (These values are safe to commit —
//    they identify the project; access is controlled by Firestore rules.)
// 2. vapidPublicKey: the PUBLIC key from `npx web-push generate-vapid-keys`.
//    (The PRIVATE key goes only into Vercel environment variables — never here.)

window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDLp7W0panpWqj0prpeD5O8LtRhxt7kV5o",
    authDomain: "family-grocery-tracker-1e31b.firebaseapp.com",
    projectId: "family-grocery-tracker-1e31b",
    storageBucket: "family-grocery-tracker-1e31b.firebasestorage.app",
    messagingSenderId: "351883934492",
    appId: "1:351883934492:web:65930a7df192e4ed0458d9",
  },
  vapidPublicKey: "BNOg3fY7VBJtmPxUlZqK_h-BBnNRe8xHQ69VP-tVm2rE-pdefunhdFT5mlZAzplaGNN2iYreSt-DuMD5SR4if5o",
};
