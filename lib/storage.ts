// Device storage (Drafts, the Outbox, remembered choices). It can throw, so every call is guarded.

/** The seam to storage. Adapters: browserStorage (the app), a Map (scripts/fake-storage.ts). */
export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
};

// Resolved per call: even reading window.localStorage can throw.
export const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
  keys: () => Object.keys(window.localStorage),
};

export function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const readLocal = (key: string, storage = browserStorage) => attempt(() => storage.getItem(key), null);
/** False when storage refused the write. */
export const writeLocal = (key: string, value: string, storage = browserStorage) =>
  attempt(() => (storage.setItem(key, value), true), false);
export const removeLocal = (key: string, storage = browserStorage) => attempt(() => storage.removeItem(key), undefined);
