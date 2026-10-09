// Device-local persistence: in-progress entries survive refresh / signal loss, and the shell
// remembers operator + pond. Storage can throw (private mode, quota, blocked site data), so every
// call is guarded here and failures degrade to "no draft".

/** The seam to storage. Adapters: browserStorage (the app), a Map (scripts/check-draft.ts). */
export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

// Resolved per call: even reading window.localStorage can throw.
export const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};

function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const readLocal = (key: string, storage = browserStorage) => attempt(() => storage.getItem(key), null);
export const writeLocal = (key: string, value: string, storage = browserStorage) =>
  attempt(() => storage.setItem(key, value), undefined);

/** One draft per record type and pond: switching ponds never carries an entry to the wrong pond. */
export const draftKey = (kind: string, pondCode: string) => `pondcube:draft:${kind}:${pondCode}`;

/**
 * A draft slot. save() is what the form calls on every change; changes made inside muted() (the
 * form's own resets: restoring, clearing after a save) are never saved, so a just-cleared draft
 * can't be re-created and an untouched form never leaves a draft behind.
 */
export function createDraft<T>(key: string, storage: KeyValueStorage = browserStorage) {
  let muted = false;
  return {
    load: (): Partial<T> | null =>
      attempt(() => {
        const raw = storage.getItem(key);
        return raw ? (JSON.parse(raw) as Partial<T>) : null;
      }, null),
    save: (values: unknown) => {
      if (!muted) writeLocal(key, JSON.stringify(values), storage);
    },
    clear: () => attempt(() => storage.removeItem(key), undefined),
    muted: (fn: () => void) => {
      muted = true;
      try {
        fn();
      } finally {
        muted = false;
      }
    },
  };
}
