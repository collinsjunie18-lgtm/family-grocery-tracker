// PREVIEW ONLY — served in place of config.js by _preview/serve.py. Never deployed.
// Points the app at a stand-in database with sample data, and fakes the phone's
// notification plumbing so the on/off switch can be exercised on a desktop.

window.APP_CONFIG = {
  firebase: { apiKey: "preview", projectId: "preview" },
  firebaseSdkBase: "/_preview/fake",
  // Any well-formed key works here; nothing is really subscribed in preview.
  vapidPublicKey: "BNOg3fY7VBJtmPxUlZqK_h-BBnNRe8xHQ69VP-tVm2rE-pdefunhdFT5mlZAzplaGNN2iYreSt-DuMD5SR4if5o",
};

(() => {
  let permission = "default";
  let subscription = null;

  function FakeNotification() {}
  Object.defineProperty(FakeNotification, "permission", { get: () => permission });
  FakeNotification.requestPermission = async () => (permission = "granted");
  window.Notification = FakeNotification;

  const fakePush = {
    subscribe: async () =>
      (subscription = {
        toJSON: () => ({ endpoint: "https://preview.invalid/push", keys: {} }),
        unsubscribe: async () => {
          subscription = null;
          return true;
        },
      }),
    getSubscription: async () => subscription,
  };
  if (!("PushManager" in window)) window.PushManager = function () {};
  if ("ServiceWorkerRegistration" in window) {
    Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
      configurable: true,
      get: () => fakePush,
    });
  }
})();
