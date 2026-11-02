// Draft lifecycle self-check (lib/draft.ts) with an in-memory storage adapter and a fake keep.
// Run: npm run check
import assert from "node:assert/strict";
import { createDraft, draftKey } from "../lib/draft";
import { createOutbox } from "../lib/outbox";
import { readLocal } from "../lib/storage";
import { broken, memory } from "./fake-storage";

process.env.TZ = "Asia/Kuala_Lumpur"; // Recorded-at is read in the device's timezone
// The keep seam (the Outbox in the app): records what was handed over, answers whether it's safe.
const fakeKeep = (safe = true) => {
  const kept: object[] = [];
  return { kept, keep: async (record: object) => (kept.push(record), safe) };
};
type Values = { temperature: string };
const AT = "2026-10-09T08:00";

async function main() {
  // Drafts are per record kind and pond.
  assert.notEqual(draftKey("wq", "PEN-FT1-001"), draftKey("wq", "PEN-FT1-002"));
  assert.notEqual(draftKey("wq", "PEN-FT1-001"), draftKey("feeding", "PEN-FT1-001"));

  // Edits are kept and restore; another pond's slot stays empty.
  const store = memory();
  const outbox = fakeKeep();
  const pondA = createDraft<Values>("wq", "A", outbox.keep, store);
  const pondB = createDraft<Values>("wq", "B", outbox.keep, store);
  assert.equal(pondA.restore(), null);
  pondA.change({ temperature: "28" });
  assert.deepEqual(pondA.restore(), { temperature: "28" });
  assert.equal(pondB.restore(), null);

  // The form's own resets (inside muted) never become drafts.
  pondB.muted(() => pondB.change({ temperature: "" }));
  assert.equal(pondB.restore(), null, "restoring an empty form must not create a draft");
  assert.throws(() =>
    pondB.muted(() => {
      throw new Error("boom");
    }),
  );
  pondB.change({ temperature: "30" });
  assert.deepEqual(pondB.restore(), { temperature: "30" }, "muted() always resumes keeping, even if the reset throws");

  // No Recorded-at: not saved, so the Draft is kept and nothing reaches the Outbox.
  assert.equal(await pondA.submit({ temperature: "28" }, ""), "noRecordedAt");
  assert.equal(outbox.kept.length, 0, "nothing is kept without a Recorded-at");
  assert.deepEqual(pondA.restore(), { temperature: "28" });
  // Recorded-at later than now: not saved either.
  assert.equal(await pondA.submit({ temperature: "28" }, "2999-01-01T08:00"), "futureRecordedAt");
  assert.equal(outbox.kept.length, 0, "nothing is kept with a future Recorded-at");
  assert.deepEqual(pondA.restore(), { temperature: "28" });

  // Neither in the Outbox nor on the server (no room on the device, no signal): the Draft stays.
  const nowhere = createDraft<Values>("wq", "A", fakeKeep(false).keep, store);
  assert.equal(await nowhere.submit({ temperature: "28" }, AT), "notKept");
  assert.deepEqual(pondA.restore(), { temperature: "28" }, "a Draft stays until its Record is safe");

  // Saved: the record goes to the Outbox with its Recorded-at instant, and only then is the Draft cleared.
  assert.deepEqual(
    await pondA.submit({ temperature: "28" }, AT),
    { temperature: "28" },
    "it answers with what it kept",
  );
  assert.deepEqual(outbox.kept[0], { temperature: "28", recordedAt: new Date("2026-10-09T00:00:00.000Z") });
  assert.equal(pondA.restore(), null);
  pondA.muted(() => pondA.change({ temperature: "" })); // the form starts the next record
  assert.equal(pondA.restore(), null, "a saved record's draft stays cleared");

  // Broken storage (private mode, quota, corrupt JSON) degrades to "no draft", never a crash.
  const fragile = createDraft<Values>("wq", "A", outbox.keep, broken);
  assert.equal(fragile.restore(), null);
  fragile.change({ temperature: "1" });
  assert.deepEqual(
    await fragile.submit({ temperature: "1" }, AT),
    { temperature: "1" },
    "saving works without storage",
  );
  assert.equal(readLocal("x", broken), null);
  store.map.set(draftKey("wq", "C"), "{not json");
  assert.equal(createDraft("wq", "C", outbox.keep, store).restore(), null);

  // No room on the device, and the server's reply is lost: not kept, though the server has it. Save again, with the
  // real Outbox: the same values are the same Record, its ids and its fish's, so the server stores it once.
  type Fish = { id: string; temperature: string; fish: { id: string }[] };
  const server = new Map<string, unknown>();
  let replyLost = true;
  const noRoom = createOutbox(async ({ record }) => {
    if (!server.has(record.id)) server.set(record.id, record); // as intake skips a stored id
    return replyLost ? "offline" : "saved";
  }, broken);
  const retry = createDraft<Values, Fish>(
    "sampling",
    "A",
    (record) => noRoom.add({ kind: "sampling", account: "a", person: "Ana", record: { ...record, pondCode: "A" } }),
    store,
  );
  // New ids each time, as each Save's validation makes them.
  const parsed = (temperature: string): Fish => ({
    id: crypto.randomUUID(),
    temperature,
    fish: [{ id: crypto.randomUUID() }],
  });
  const first = parsed("28");
  assert.equal(await retry.submit(first, AT), "notKept");
  assert.equal(server.size, 1, "it got there; the reply didn't");
  replyLost = false;
  assert.deepEqual(await retry.submit(parsed("28"), AT), first, "the Record kept is the first one, ids and all");
  assert.equal(server.size, 1, "stored once");

  // Other values are another Record, and once kept, the same values later are a new observation.
  replyLost = true;
  const other = parsed("29");
  assert.equal(await retry.submit(parsed("28"), AT), "notKept");
  assert.equal(await retry.submit(other, AT), "notKept");
  replyLost = false;
  assert.deepEqual(await retry.submit(parsed("29"), AT), other, "the latest try is the one remembered");
  const later = parsed("29");
  assert.deepEqual(await retry.submit(later, AT), later);

  // Saved before 0.8.0: restored under the new field names.
  store.map.set(draftKey("mortality", "A"), JSON.stringify({ mortalityCount: "3", remarks: "net" }));
  assert.deepEqual(createDraft("mortality", "A", outbox.keep, store).restore(), {
    mortalityCount: "3",
    causeDeath: undefined,
    noteDeath: "net",
  });

  console.log("draft lifecycle OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
