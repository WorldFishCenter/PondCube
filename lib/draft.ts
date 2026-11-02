import { attempt, browserStorage, removeLocal, writeLocal, type KeyValueStorage } from "./storage";
import { isFuture, recordedAtLocal, withNewNames } from "./validation";

// Drafts: a Record being filled in, kept per Record kind and Pond until Save puts it somewhere safe.

/** One draft per record type and pond: switching ponds never carries an entry to the wrong pond. */
export const draftKey = (kind: string, pondCode: string) => `pondcube:draft:${kind}:${pondCode}`;

/** The Draft of a Record kind and pond, or null. Saved before 0.8.0, it comes back under the new field names. */
export const readDraft = (kind: string, pondCode: string, storage: KeyValueStorage = browserStorage) =>
  attempt(() => {
    const raw = storage.getItem(draftKey(kind, pondCode));
    return raw ? withNewNames(kind, JSON.parse(raw)) : null;
  }, null);

/** Why a Record wasn't kept: its Draft stays. */
export type NotSaved = "notKept" | "noRecordedAt" | "futureRecordedAt";
/** What a submit led to. Only "kept" (the Record is in the Outbox or on the server) clears the Draft. */
export type Submitted = "kept" | NotSaved;

export type Draft<T = unknown, R extends object = object> = ReturnType<typeof createDraft<T, R>>;

/** A Draft from restore to Save. Edits inside muted() (the form's own resets) are never kept. */
export function createDraft<T, R extends object = object>(
  kind: string,
  pondCode: string,
  keep: (record: R & { recordedAt: Date }) => Promise<boolean>,
  storage: KeyValueStorage = browserStorage,
) {
  const key = draftKey(kind, pondCode);
  let muted = false;
  let unsure: { content: string; record: R } | undefined; // not kept, but a lost reply can hide that the server has it
  return {
    restore: () => readDraft(kind, pondCode, storage) as Partial<T> | null,
    change: (values: unknown) => {
      if (!muted) writeLocal(key, JSON.stringify(values), storage);
    },
    /** The Record kept, or why not. `recordedAt` is the device's local "YYYY-MM-DDTHH:mm" (from the app shell), "" until set. */
    submit: async (fresh: R, recordedAt: string): Promise<R | NotSaved> => {
      const at = recordedAtLocal.safeParse(recordedAt);
      if (!at.success) return "noRecordedAt";
      if (isFuture(at.data)) return "futureRecordedAt";
      // The same values again are the same Record: with the same ids, intake skips it if the first try got there.
      // ponytail: Recorded-at isn't compared (a Round's is each tap's), so a time changed on a retry is lost if it did.
      const content = JSON.stringify(fresh, (field, value) => (field === "id" ? undefined : value));
      const record = unsure?.content === content ? unsure.record : fresh;
      if (!(await keep({ ...record, recordedAt: at.data }))) {
        unsure = { content, record };
        return "notKept";
      }
      unsure = undefined;
      removeLocal(key, storage);
      return record;
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
