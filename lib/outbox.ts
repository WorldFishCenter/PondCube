import type { Access } from "./operators";
import { attempt, browserStorage, removeLocal, writeLocal, type KeyValueStorage } from "./storage";
import { withNewNames, type RecordKind } from "./validation";

// The Outbox: saved Records the server hasn't received yet, one storage key each, removed only once stored.

/** A Record in the Outbox. Only the sign-in `account` that saved it sends it; `problem` is the server's last refusal. */
export type WaitingRecord = {
  kind: RecordKind;
  account: string;
  person: string;
  record: { id: string; pondCode: string; [field: string]: unknown };
  problem?: string;
  savedAt?: number; // the sending order; absent before 0.11.0
};
/** How one send went. "offline": no reply, so stop and try later; failed: the server refused this one. */
export type Sent = "saved" | Stopped | { failed: string };
/** Why sending stopped before the last Record: no reply, or the sign-in can't send. */
export type Stopped = "offline" | Exclude<Access, object>;

const PREFIX = "pondcube:outbox:";

// Saved before 0.8.0: the Person was `enumerator`, and some fields had other names.
const withNewNamesWaiting = ({ enumerator, ...w }: WaitingRecord & { enumerator?: string }): WaitingRecord => ({
  ...w,
  person: w.person ?? enumerator,
  record: withNewNames(w.kind, w.record) as WaitingRecord["record"],
});

/** Every Record waiting on this device, whoever saved it, oldest first: a correction never overtakes its reading. */
export const waitingRecords = (storage: KeyValueStorage = browserStorage): WaitingRecord[] =>
  attempt(() => storage.keys(), [])
    .filter((key) => key.startsWith(PREFIX))
    .flatMap((key) => attempt(() => [withNewNamesWaiting(JSON.parse(storage.getItem(key) ?? ""))], []))
    .sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));

/** `send` posts one Record: to app/api/records in the app, to a fake in scripts/check-outbox.ts. */
export function createOutbox(
  send: (waiting: WaitingRecord) => Promise<Sent>,
  storage: KeyValueStorage = browserStorage,
) {
  let inFlight: Promise<Stopped | undefined> | undefined;
  let lastSaved = 0; // two Records saved in the same millisecond still keep their order

  const all = () => waitingRecords(storage);
  const put = (waiting: WaitingRecord) => writeLocal(PREFIX + waiting.record.id, JSON.stringify(waiting), storage);

  async function sendAll(account: string): Promise<Stopped | undefined> {
    const tried = new Set<string>();
    for (;;) {
      // Looked up afresh each time, so a Record saved while this runs is sent too.
      const next = all().find((w) => w.account === account && !tried.has(w.record.id));
      if (!next) return undefined;
      tried.add(next.record.id);
      const sent = await send(next);
      if (sent === "saved") removeLocal(PREFIX + next.record.id, storage);
      else if (typeof sent === "object") put({ ...next, problem: sent.failed });
      else return sent;
    }
  }

  return {
    all,
    /** True once the Record is safe: in the Outbox or, when storage refuses it, sent there and then. */
    add: async (waiting: WaitingRecord) =>
      put({ ...waiting, savedAt: (lastSaved = Math.max(Date.now(), lastSaved + 1)) }) ||
      (await send(waiting)) === "saved",
    /** Sends this account's waiting Records one at a time. A call while one runs joins it. */
    flush: (account: string) => (inFlight ??= sendAll(account).finally(() => (inFlight = undefined))),
  };
}
