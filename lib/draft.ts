import { attempt, browserStorage, removeLocal, writeLocal, type KeyValueStorage } from "./storage";
import { isFuture, recordedAtLocal, withNewNames } from "./validation";

// Drafts: a Record being filled in, kept per Record kind and Pond until Save puts it somewhere safe.

/** One draft per record type and pond: switching ponds never carries an entry to the wrong pond. */
export const draftKey = (kind: string, pondCode: string) => `pondcube:draft:${kind}:${pondCode}`;

/** The Draft of a record type and pond, or null. Saved before 0.8.0, it comes back under the new field names. */
export const readDraft = (kind: string, pondCode: string, storage: KeyValueStorage = browserStorage) =>
  attempt(() => {
    const raw = storage.getItem(draftKey(kind, pondCode));
    return raw ? withNewNames(kind, JSON.parse(raw)) : null;
  }, null);

/** What a submit led to. Only "kept" (the Record is in the Outbox or on the server) clears the Draft. */
export type Submitted = "kept" | "notKept" | "noRecordedAt" | "futureRecordedAt";

/** A Draft from restore to Save. Edits inside muted() (the form's own resets) are never kept. */
export function createDraft<T, R extends object = object>(
  kind: string,
  pondCode: string,
  keep: (record: R & { recordedAt: Date }) => Promise<boolean>,
  storage: KeyValueStorage = browserStorage,
) {
  const key = draftKey(kind, pondCode);
  let muted = false;
  return {
    restore: () => readDraft(kind, pondCode, storage) as Partial<T> | null,
    change: (values: unknown) => {
      if (!muted) writeLocal(key, JSON.stringify(values), storage);
    },
    /** `recordedAt` is the device's local "YYYY-MM-DDTHH:mm" (from the app shell), "" until set. */
    submit: async (record: R, recordedAt: string): Promise<Submitted> => {
      const at = recordedAtLocal.safeParse(recordedAt);
      if (!at.success) return "noRecordedAt";
      if (isFuture(at.data)) return "futureRecordedAt";
      if (!(await keep({ ...record, recordedAt: at.data }))) return "notKept";
      removeLocal(key, storage);
      return "kept";
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
