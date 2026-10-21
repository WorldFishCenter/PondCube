import type { Access } from "./operators";
import { attempt, browserStorage, removeLocal, writeLocal, type KeyValueStorage } from "./storage";
import type { RecordKind } from "./validation";

// The Outbox: saved Records the server hasn't received yet, one storage key each, removed only once stored.

/** A Record in the Outbox. Only the sign-in `account` that saved it sends it; `problem` is the server's last refusal. */
export type WaitingRecord = {
  kind: RecordKind;
  account: string;
  enumerator: string;
  record: { id: string; pondCode: string; [field: string]: unknown };
  problem?: string;
};
/** How one send went. "offline": no reply, so stop and try later; failed: the server refused this one. */
export type Sent = "saved" | Stopped | { failed: string };
/** Why sending stopped before the last Record: no reply, or the sign-in can't send. */
export type Stopped = "offline" | Exclude<Access, object>;

const PREFIX = "pondcube:outbox:";

/** Every Record waiting on this device, whoever saved it. */
export const waitingRecords = (storage: KeyValueStorage = browserStorage): WaitingRecord[] =>
  attempt(() => storage.keys(), [])
    .filter((key) => key.startsWith(PREFIX))
    .flatMap((key) => attempt(() => [JSON.parse(storage.getItem(key) ?? "") as WaitingRecord], []));

/** `send` posts one Record: to app/api/records in the app, to a fake in scripts/check-outbox.ts. */
export function createOutbox(
  send: (waiting: WaitingRecord) => Promise<Sent>,
  storage: KeyValueStorage = browserStorage,
) {
  let inFlight: Promise<Stopped | undefined> | undefined;

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
    add: async (waiting: WaitingRecord) => put(waiting) || (await send(waiting)) === "saved",
    /** Sends this account's waiting Records one at a time. A call while one runs joins it. */
    flush: (account: string) => (inFlight ??= sendAll(account).finally(() => (inFlight = undefined))),
  };
}
