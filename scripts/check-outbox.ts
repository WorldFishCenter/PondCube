// Outbox self-check (lib/outbox.ts) with an in-memory storage adapter and a fake send. Run: npm run check
import assert from "node:assert/strict";
import { createOutbox, type Sent, type WaitingRecord } from "../lib/outbox";
import { broken, memory } from "./fake-storage";

// The send seam: records which Records were sent and answers each with `answer`.
const fakeSend = (answer: (w: WaitingRecord) => Sent) => {
  const sent: string[] = [];
  return { sent, send: async (w: WaitingRecord) => (sent.push(w.record.id), answer(w)) };
};
let n = 0;
const saved = (account = "user_ana", person = "Ana"): WaitingRecord => ({
  kind: "mortality",
  account,
  person,
  record: { id: `id-${++n}`, pondCode: "PEN-FT1-001" },
});
const ids = (ws: WaitingRecord[]) => ws.map((w) => w.record.id).sort();

async function main() {
  // No signal: everything stays, sending stops at the first try.
  const store = memory();
  let reply: (w: WaitingRecord) => Sent = () => "offline";
  const net = fakeSend((w) => reply(w));
  const box = createOutbox(net.send, store);
  const [a, b, c] = [saved(), saved(), saved("user_ben", "Ben")];
  for (const w of [a, b, c]) assert.equal(await box.add(w), true);
  assert.equal(store.map.size, 3, "one key per Record");
  assert.equal(await box.flush("user_ana"), "offline");
  assert.equal(net.sent.length, 1);
  assert.equal(box.all().length, 3);

  // Signed out, or no longer on the operator list: also stops and keeps everything.
  reply = () => "signedOut";
  assert.equal(await box.flush("user_ana"), "signedOut");
  reply = () => "notOnList";
  assert.equal(await box.flush("user_ana"), "notOnList");
  assert.equal(box.all().length, 3);

  // Signal: Ana's Records go and are removed; Ben's wait for Ben's account, never sent under Ana's.
  reply = () => "saved";
  net.sent.length = 0;
  assert.equal(await box.flush("user_ana"), undefined);
  assert.deepEqual(net.sent.sort(), ids([a, b]));
  assert.deepEqual(ids(box.all()), ids([c]));
  await box.flush("user_ben");
  assert.deepEqual(box.all(), []);

  // A refused Record stays, with the reason kept in storage (it survives a reload); the ones after it still go.
  const [bad, good] = [saved(), saved()];
  await box.add(bad);
  await box.add(good);
  reply = (w) => (w.record.id === bad.record.id ? { failed: "Dissolved oxygen: expected 0–20" } : "saved");
  assert.equal(await box.flush("user_ana"), undefined);
  const reloaded = createOutbox(net.send, store);
  assert.deepEqual(reloaded.all(), [{ ...bad, problem: "Dissolved oxygen: expected 0–20" }]);
  reply = () => "saved";
  await reloaded.flush("user_ana");
  assert.deepEqual(reloaded.all(), [], "once accepted, it's gone");

  // One send at a time: a second call joins the first, and a Record saved meanwhile goes in it.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slow = fakeSend(() => "saved");
  const joined = createOutbox(async (w) => (await gate, slow.send(w)), memory());
  const [first, late] = [saved(), saved()];
  await joined.add(first);
  const one = joined.flush("user_ana");
  const two = joined.flush("user_ana");
  assert.equal(one, two, "a flush already running is joined");
  await joined.add(late);
  release();
  await one;
  assert.deepEqual(slow.sent.sort(), ids([first, late]), "each sent once, the late one included");
  assert.deepEqual(joined.all(), []);

  // The record survives storage as JSON: Recorded-at goes out as an instant the server accepts.
  const at = new Date("2026-10-09T00:00:00.000Z");
  const timed = saved();
  await box.add({ ...timed, record: { ...timed.record, recordedAt: at } });
  assert.equal(box.all()[0].record.recordedAt, at.toISOString());

  // Storage refuses (full, blocked): the Record is sent there and then; with no signal add says it isn't
  // safe, so the caller keeps the Draft. A corrupt entry is skipped.
  const direct = fakeSend(() => "saved");
  assert.equal(await createOutbox(direct.send, broken).add(saved()), true, "sent straight away");
  assert.equal(direct.sent.length, 1);
  assert.equal(await createOutbox(fakeSend(() => "offline").send, broken).add(saved()), false);
  assert.deepEqual(createOutbox(direct.send, broken).all(), []);
  store.map.set("pondcube:outbox:x", "{not json");
  assert.equal(createOutbox(net.send, store).all().length, 1, "only the corrupt entry is skipped");

  // Saved before 0.8.0: read under the new names, so it still sends and shows who made it.
  const old = memory();
  const record = { id: "id-old", pondCode: "PEN-FT1-001", suspectedCause: "unknown" };
  old.map.set("pondcube:outbox:id-old", JSON.stringify({ kind: "mortality", account: "a", enumerator: "Ana", record }));
  const [read] = createOutbox(net.send, old).all();
  assert.equal(read.person, "Ana");
  assert.equal(read.record.causeDeath, "Unknown");

  console.log("outbox OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
