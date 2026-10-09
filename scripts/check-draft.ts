// Draft lifecycle self-check (lib/draft.ts) with an in-memory storage adapter. Run: npm run check
import assert from "node:assert/strict";
import { createDraft, draftKey, readLocal, type KeyValueStorage } from "../lib/draft";

const memory = (): KeyValueStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

// Drafts are per record type and pond.
assert.notEqual(draftKey("wq", "PEN-FT1-001"), draftKey("wq", "PEN-FT1-002"));
assert.notEqual(draftKey("wq", "PEN-FT1-001"), draftKey("feeding", "PEN-FT1-001"));

// Edits are saved and load back; another pond's slot stays empty.
const store = memory();
const pondA = createDraft<{ temperature: string }>(draftKey("wq", "A"), store);
const pondB = createDraft<{ temperature: string }>(draftKey("wq", "B"), store);
assert.equal(pondA.load(), null);
pondA.save({ temperature: "28" });
assert.deepEqual(pondA.load(), { temperature: "28" });
assert.equal(pondB.load(), null);

// The form's own resets (inside muted) never become drafts: restoring an empty slot leaves none,
// and clearing after a save isn't undone by the reset's change notification.
pondB.muted(() => pondB.save({ temperature: "" }));
assert.equal(pondB.load(), null, "restoring an empty form must not create a draft");
pondA.muted(() => pondA.save({ temperature: "" }));
pondA.clear();
assert.equal(pondA.load(), null, "a saved record's draft stays cleared");
pondA.save({ temperature: "29" }); // saving resumes after muted()
assert.deepEqual(pondA.load(), { temperature: "29" });

// muted() always restores saving, even if the reset throws.
assert.throws(() =>
  pondA.muted(() => {
    throw new Error("boom");
  }),
);
pondA.save({ temperature: "30" });
assert.deepEqual(pondA.load(), { temperature: "30" });

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
const fragile = createDraft(draftKey("wq", "A"), broken);
assert.equal(fragile.load(), null);
fragile.save({ temperature: "1" });
fragile.clear();
assert.equal(readLocal("x", broken), null);
store.map.set(draftKey("wq", "C"), "{not json");
assert.equal(createDraft(draftKey("wq", "C"), store).load(), null);

console.log("draft lifecycle OK");
