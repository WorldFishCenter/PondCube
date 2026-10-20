import "server-only";
import pkg from "@/package.json";

// Server-only, so the rest of package.json never reaches the browser.
export const APP_VERSION = pkg.version;
