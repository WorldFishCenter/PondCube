"use client";

import * as React from "react";

// Registers public/sw.js, which lets the installed app open with no signal.
export function ServiceWorker() {
  React.useEffect(() => {
    navigator.serviceWorker?.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(console.error);
  }, []);
  return null;
}
