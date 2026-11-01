// Round self-check (lib/round.ts): where a Round starts and ends, its marks, and a whole Round through the real Draft
// and Outbox, offline and then online. Run: npm run check
import assert from "node:assert/strict";
import { createDraft, draftKey } from "../lib/draft";
import { periodAt } from "../lib/options";
import { createOutbox, type Sent, type WaitingRecord } from "../lib/outbox";
import {
  areasOf,
  forgetOldRounds,
  isBlank,
  keepMark,
  liveRound,
  localTime,
  pondAfter,
  pondNumber,
  readMarks,
  resumePond,
  roundAt,
  typedDrafts,
} from "../lib/round";
import { RECORD_KINDS, waterQualityForm } from "../lib/validation";
import { broken, memory } from "./fake-storage";

process.env.TZ = "Asia/Kuala_Lumpur"; // a Round's day and Period are local to the device
const at = (local: string) => new Date(`${local}:00+08:00`);
const mark = (id: string) => ({ id, dissolvedOxygen: 5, temperature: 28 });
// What the Water tab's form holds for a pond, as typed.
const typed = (values: object = {}) => ({
  period: "morning",
  dissolvedOxygen: "5.2",
  temperature: "28.1",
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  remarks: "",
  ...values,
});

async function main() {
  // One Round per day and Period; noon is the first afternoon minute.
  assert.equal(periodAt("2026-11-01T11:59"), "morning");
  assert.equal(periodAt("2026-11-01T12:00"), "afternoon");
  assert.equal(roundAt("2026-11-01T11:59"), "2026-11-01:morning");
  assert.equal(roundAt("2026-11-01T12:00"), "2026-11-01:afternoon");
  assert.equal(localTime(at("2026-11-01T08:05")), "2026-11-01T08:05");

  // A Round that runs past noon stays one Round while readings keep coming, so its marks don't vanish mid-walk.
  const live = memory();
  assert.equal(liveRound(at("2026-11-01T08:00"), live), "2026-11-01:morning", "nothing saved yet: now's Round");
  const morning = keepMark("2026-11-01:morning", {}, "A", mark("1"), at("2026-11-01T11:50"), live);
  assert.equal(liveRound(at("2026-11-01T12:10"), live), "2026-11-01:morning", "20 minutes on, past noon: same Round");
  assert.equal(liveRound(at("2026-11-01T12:30"), live), "2026-11-01:afternoon", "30 minutes on: a new Round");
  assert.equal(liveRound(at("2026-11-02T08:00"), live), "2026-11-02:morning", "next day: a new Round");
  // A reading saved with a wrong clock, days ahead, doesn't hold the Round open either.
  keepMark("2026-11-01:morning", morning, "B", mark("2"), at("2026-11-03T08:00"), live);
  assert.equal(liveRound(at("2026-11-01T14:00"), live), "2026-11-01:afternoon");

  // Past readings have their own marks and never make their Round the live one.
  const past = memory();
  keepMark("2026-10-31:morning", {}, "A", mark("1"), null, past);
  assert.equal(liveRound(at("2026-11-01T08:00"), past), "2026-11-01:morning");
  assert.deepEqual(readMarks("2026-10-31:morning", past), { A: mark("1") });

  // Marks are per Round, and the latest reading of a pond is the one shown.
  assert.deepEqual(readMarks("2026-11-01:afternoon", live), {}, "a new Round starts empty");
  const corrected = keepMark("2026-11-01:morning", readMarks("2026-11-01:morning", live), "A", mark("9"), null, live);
  assert.equal(corrected.A.id, "9");
  assert.equal(readMarks("2026-11-01:morning", live).A.id, "9");

  // Marks are for showing only: storage refusing them changes nothing for the running screen, and never throws.
  assert.deepEqual(keepMark("r", {}, "A", mark("1"), at("2026-11-01T08:00"), broken), { A: mark("1") });
  assert.deepEqual(readMarks("r", broken), {});
  assert.equal(liveRound(at("2026-11-01T08:00"), broken), "2026-11-01:morning");
  forgetOldRounds(at("2026-11-01T08:00"), broken);
  const garbled = memory();
  garbled.setItem("pondcube:round:r", "{not json");
  garbled.setItem("pondcube:latestRound", "{not json");
  assert.deepEqual(readMarks("r", garbled), {});
  assert.equal(liveRound(at("2026-11-01T08:00"), garbled), "2026-11-01:morning");

  // Old marks go, so they can't fill the storage the Outbox needs; Drafts and the Outbox aren't touched.
  const old = memory();
  for (const day of ["2026-10-01", "2026-10-30", "2026-10-31", "2026-11-01"])
    keepMark(`${day}:morning`, {}, "A", mark("1"), null, old);
  old.setItem(draftKey("wq", "A"), "kept");
  old.setItem("pondcube:outbox:1", "kept");
  forgetOldRounds(at("2026-11-01T08:00"), old);
  assert.deepEqual(
    old.keys().sort(),
    [
      "pondcube:outbox:1",
      draftKey("wq", "A"),
      "pondcube:round:2026-10-31:morning",
      "pondcube:round:2026-11-01:morning",
    ].sort(),
  );

  // Blank means nothing typed: it makes no Record. A 0 is a reading, and the Period doesn't count.
  assert.ok(isBlank(typed({ dissolvedOxygen: "", temperature: "" })));
  assert.ok(isBlank(typed({ dissolvedOxygen: "", temperature: "", remarks: "   " })));
  assert.ok(isBlank({}));
  assert.ok(!isBlank(typed({ dissolvedOxygen: "0", temperature: "" })));
  assert.ok(!isBlank({ dissolvedOxygen: 0 }));
  assert.ok(!isBlank(typed({ dissolvedOxygen: "", temperature: "", ph: "7" })));
  assert.ok(!isBlank(typed({ dissolvedOxygen: "", temperature: "", remarks: "dead fish" })));

  // A row typed in and left unsaved is findable; an empty or unreadable Draft isn't one.
  const drafts = memory();
  drafts.setItem(draftKey("wq", "A"), JSON.stringify(typed()));
  drafts.setItem(draftKey("wq", "B"), JSON.stringify(typed({ dissolvedOxygen: "", temperature: "" })));
  drafts.setItem(draftKey("wq", "C"), "{not json");
  drafts.setItem(draftKey("feeding", "D"), JSON.stringify(typed()));
  assert.deepEqual(Object.keys(typedDrafts(["A", "B", "C", "D", "E"], drafts)), ["A"]);
  assert.deepEqual(typedDrafts(["A"], broken), {});

  // Areas in Penang's walking order, ponds as given; the same area name at two Sites stays two.
  const pond = (site: string, area: string, n: number) => ({ pondCode: `${site}-${n}`, site, area });
  const one = areasOf([
    pond("PEN", "Aqua", 1),
    pond("PEN", "Hatchery", 2),
    pond("PEN", "Zebra", 3),
    pond("PEN", "Hatchery", 4),
  ]);
  assert.deepEqual(
    one.map((a) => [a.label, a.items.map((p) => p.pondCode)]),
    [
      ["Hatchery", ["PEN-2", "PEN-4"]],
      ["Aqua", ["PEN-1"]],
      ["Zebra", ["PEN-3"]],
    ],
  );
  const two = areasOf([pond("TAL", "Pond", 1), pond("PEN", "Pond", 2)]);
  assert.deepEqual(
    two.map((a) => [a.label, a.items.length]),
    [
      ["PEN · Pond", 1],
      ["TAL · Pond", 1],
    ],
  );
  assert.equal(new Set(two.map((a) => a.value)).size, 2);
  assert.deepEqual(areasOf([]), []);
  assert.equal(pondNumber("PEN-FT3-091"), 91);
  assert.equal(pondNumber("TAL_01"), 1);
  assert.equal(pondNumber("PEN-X"), "PEN-X");

  // Save walks on through the ponds without a reading, so a correction goes back to where the Operator had got to.
  const walk = ["A", "B", "C", "D", "E"];
  const m = (...codes: string[]) => Object.fromEntries(codes.map((c) => [c, mark(c)]));
  assert.equal(pondAfter(walk, {}, "A"), "B");
  assert.equal(pondAfter(walk, m("A", "B", "C"), "A"), "D", "correcting A from D goes back to D");
  assert.equal(pondAfter(walk, m("E"), "D"), "", "nothing after D without a reading: the end");
  assert.equal(pondAfter(walk, {}, "E"), "", "the last pond: the end");
  // It picks up after the last reading, past empty ponds skipped on the way, and at the end only when nothing's left.
  assert.equal(resumePond(walk, {}), "A");
  assert.equal(resumePond(walk, m("A", "C")), "D", "B was skipped on purpose");
  assert.equal(resumePond(walk, m("E")), "");
  assert.equal(resumePond(walk, m("gone")), "A", "a mark for a retired pond doesn't count");
  assert.equal(resumePond([], {}), "");

  // A whole Round of 245 ponds, with no signal: each row is one Record of its own pond, kept, its Draft cleared.
  const store = memory();
  const received: WaitingRecord[] = [];
  let signal = false;
  const send = async (w: WaitingRecord): Promise<Sent> => {
    if (!signal) return "offline";
    received.push(w);
    return "saved";
  };
  const outbox = createOutbox(send, store);
  const ponds = Array.from({ length: 245 }, (_, i) => `PEN-FT3-${String(i + 1).padStart(3, "0")}`);
  let marks = {};
  for (const pondCode of ponds) {
    const draft = createDraft<ReturnType<typeof typed>, { id: string }>(
      "wq",
      pondCode,
      (record) => outbox.add({ kind: "wq", account: "a", person: "Ana", record: { ...record, pondCode } }),
      store,
    );
    draft.change(typed());
    const record = waterQualityForm.parse(typed()); // a new id each time, as on Save
    assert.equal(await draft.submit(record, "2026-11-01T09:00"), "kept");
    assert.equal(draft.restore(), null, "the Draft clears once the Record is in the Outbox");
    marks = keepMark(
      "2026-11-01:morning",
      marks,
      pondCode,
      { id: record.id, dissolvedOxygen: record.dissolvedOxygen, temperature: record.temperature },
      at("2026-11-01T09:00"),
      store,
    );
  }
  assert.equal(outbox.all().length, 245);
  assert.equal(await outbox.flush("a"), "offline", "no signal: they all wait");
  assert.equal(outbox.all().length, 245);

  // Signal returns: each is sent once, and intake's save schema accepts it as the device sends it.
  signal = true;
  assert.equal(await outbox.flush("a"), undefined);
  assert.equal(outbox.all().length, 0);
  assert.deepEqual(received.map((w) => w.record.pondCode).sort(), ponds);
  assert.equal(new Set(received.map((w) => w.record.id)).size, 245);
  for (const { record, person } of received) {
    const saved = RECORD_KINDS.wq.save.parse({ ...JSON.parse(JSON.stringify(record)), person });
    assert.equal(saved.recordedAt.toISOString(), "2026-11-01T01:00:00.000Z");
    assert.deepEqual(
      [saved.period, saved.dissolvedOxygen, saved.temperature, saved.ph, saved.remarks],
      ["morning", 5.2, 28.1, undefined, undefined],
    );
  }
  assert.equal(Object.keys(readMarks("2026-11-01:morning", store)).length, 245, "marks outlive the sending");

  // No room on the device and no signal: not saved, the Draft stays, and so the row gets no mark.
  const full = memory();
  const typedOnly = createDraft<ReturnType<typeof typed>, object>("wq", "A", async () => false, full);
  typedOnly.change(typed());
  assert.equal(await typedOnly.submit(waterQualityForm.parse(typed()), "2026-11-01T09:00"), "notKept");
  assert.deepEqual(typedOnly.restore(), typed());

  console.log("rounds OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
