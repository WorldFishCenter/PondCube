// Draft lifecycle self-check (lib/draft.ts) with an in-memory storage adapter and a fake save.
// Run: npm run check
import assert from "node:assert/strict";
import { createDraft, draftKey, readLocal, type KeyValueStorage } from "../lib/draft";
import type { SaveOutcome } from "../lib/actions";

process.env.TZ = "Asia/Kuala_Lumpur"; // Recorded-at is read in the device's timezone
const memory = (): KeyValueStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};
// The save seam: records what was sent, answers with the given outcome (or throws, like a lost signal).
const fakeSave = (answer: SaveOutcome | Error) => {
  const sent: object[] = [];
  const save = async (record: object) => {
    sent.push(record);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { sent, save };
};
type Values = { temperature: string };
const AT = "2026-10-09T08:00";

async function main() {
  // Drafts are per record kind and pond.
  assert.notEqual(draftKey("wq", "PEN-FT1-001"), draftKey("wq", "PEN-FT1-002"));
  assert.notEqual(draftKey("wq", "PEN-FT1-001"), draftKey("feeding", "PEN-FT1-001"));

  // Edits are kept and restore; another pond's slot stays empty.
  const store = memory();
  const saved = fakeSave("saved");
  const pondA = createDraft<Values>(draftKey("wq", "A"), saved.save, store);
  const pondB = createDraft<Values>(draftKey("wq", "B"), saved.save, store);
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

  // Not saved, so the Draft is kept: no Recorded-at, signed out, no signal.
  assert.equal(await pondA.submit({ temperature: "28" }, ""), "noRecordedAt");
  assert.equal(saved.sent.length, 0, "nothing is sent without a Recorded-at");
  const locked = createDraft<Values>(draftKey("wq", "A"), fakeSave("locked").save, store);
  assert.equal(await locked.submit({ temperature: "28" }, AT), "locked");
  const offline = createDraft<Values>(draftKey("wq", "A"), fakeSave(new Error("fetch failed")).save, store);
  const quiet = console.error;
  console.error = () => {};
  assert.equal(await offline.submit({ temperature: "28" }, AT), "failed");
  console.error = quiet;
  assert.deepEqual(pondA.restore(), { temperature: "28" }, "a Draft survives every failed save");

  // Saved: the record goes out with its Recorded-at instant, and only then is the Draft cleared.
  assert.equal(await pondA.submit({ temperature: "28" }, AT), "saved");
  assert.deepEqual(saved.sent[0], { temperature: "28", recordedAt: new Date("2026-10-09T00:00:00.000Z") });
  assert.equal(pondA.restore(), null);
  pondA.muted(() => pondA.change({ temperature: "" })); // the form starts the next record
  assert.equal(pondA.restore(), null, "a saved record's draft stays cleared");

  // Broken storage (private mode, quota, corrupt JSON) degrades to "no draft", never a crash.
  const broken: KeyValueStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const fragile = createDraft<Values>(draftKey("wq", "A"), saved.save, broken);
  assert.equal(fragile.restore(), null);
  fragile.change({ temperature: "1" });
  assert.equal(await fragile.submit({ temperature: "1" }, AT), "saved", "saving works without storage");
  assert.equal(readLocal("x", broken), null);
  store.map.set(draftKey("wq", "C"), "{not json");
  assert.equal(createDraft(draftKey("wq", "C"), saved.save, store).restore(), null);

  console.log("draft lifecycle OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
