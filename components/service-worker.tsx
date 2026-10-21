"use client";

import * as React from "react";

// Registers public/sw.js, which lets the installed app open with no signal.
export function ServiceWorker() {
  React.useEffect(() => {
    navigator.serviceWorker?.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(console.error);
  }, []);
  return null;
}

const noSubscribe = () => () => {};

/** For the signed-in app: has the worker keep this page and its build files, unless it saw this load already. */
export function useKeepForOffline() {
  // True when this page load rendered the app (hydration); false when a sign-in brought it in later.
  const hydrating = React.useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  );
  const loadedHere = React.useRef(hydrating);
  React.useEffect(() => {
    if (loadedHere.current && navigator.serviceWorker?.controller) return; // kept on the way in
    const loaded = performance.getEntriesByType("resource").map((entry) => entry.name);
    navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage({ keep: loaded }));
  }, []);
}
