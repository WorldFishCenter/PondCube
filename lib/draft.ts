import type { SaveOutcome } from "./actions";
import { recordedAtLocal } from "./validation";

// Device-local persistence: in-progress entries survive refresh / signal loss, and the shell
// remembers the pond. Storage can throw (private mode, quota, blocked site data), so every
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

/** What a submit led to. Only "saved" clears the Draft. */
export type Submitted = "saved" | SaveOutcome | "failed" | "noRecordedAt";

/**
 * A Draft from restore to a successful save, the only thing that clears it. change() is what the
 * form calls on every edit; edits inside muted() (the form's own resets: restoring, starting the next
 * record) are never kept, so a cleared Draft can't come back and an untouched form leaves none.
 * `save` sends the record with its Recorded-at instant: the server action, or a fake in check-draft.
 */
export function createDraft<T>(
  key: string,
  save: (record: object) => Promise<SaveOutcome>,
  storage: KeyValueStorage = browserStorage,
) {
  let muted = false;
  return {
    restore: (): Partial<T> | null =>
      attempt(() => {
        const raw = storage.getItem(key);
        return raw ? (JSON.parse(raw) as Partial<T>) : null;
      }, null),
    change: (values: unknown) => {
      if (!muted) writeLocal(key, JSON.stringify(values), storage);
    },
    /** `recordedAt` is the device's local "YYYY-MM-DDTHH:mm" (from the app shell), "" until set. */
    submit: async (record: object, recordedAt: string): Promise<Submitted> => {
      const at = recordedAtLocal.safeParse(recordedAt);
      if (!at.success) return "noRecordedAt";
      try {
        if ((await save({ ...record, recordedAt: at.data })) === "locked") return "locked";
      } catch (err) {
        console.error(err); // server errors are masked in production; the cause goes to the console
        return "failed";
      }
      attempt(() => storage.removeItem(key), undefined);
      return "saved";
    },
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
