// Round self-check (lib/round.ts): every rule of a Round through the taps an Operator makes, with the real Draft, and a
// whole Round through the real Outbox, offline and then online. Run: npm run check
import assert from "node:assert/strict";
import { draftKey, readDraft } from "../lib/draft";
import { areasOf, periodAt, pondNumber } from "../lib/options";
import { createOutbox, type Sent, type WaitingRecord } from "../lib/outbox";
import {
  createRound,
  forgetOldRounds,
  isBlank,
  keepLeftApp,
  keepPaperAt,
  localTime,
  paperAfterAway,
  restorePaperAt,
  whichRound,
  type Tap,
} from "../lib/round";
import type { KeyValueStorage } from "../lib/storage";
import { RECORD_KINDS } from "../lib/validation";
import { broken, memory } from "./fake-storage";

process.env.TZ = "Asia/Kuala_Lumpur"; // a Round's day and Period are local to the device
const at = (local: string) => new Date(`${local}:00+08:00`);
const MORNING = "2026-11-01:morning";
const WALK = ["A", "B", "C", "D", "E"];

// What the Water tab's form holds for a pond, as typed.
const typed = (values: object = {}) => ({
  dissolvedOxygen: "5.2",
  temperature: "28.1",
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  remarks: "",
  ...values,
});
const nothing = typed({ dissolvedOxygen: "", temperature: "" });

// A Round on a phone, with a clock to set; what it keeps lands in `kept`, unless `keep` says otherwise.
function phone({
  storage = memory(),
  pondCodes = WALK,
  round = MORNING,
  time = "2026-11-01T08:00",
  keep,
}: {
  storage?: KeyValueStorage;
  pondCodes?: string[];
  round?: string;
  time?: string;
  keep?: (record: WaitingRecord["record"]) => Promise<boolean>;
} = {}) {
  let date = at(time);
  let tick = 0;
  const kept: WaitingRecord["record"][] = [];
  const moved: string[] = [];
  const r = createRound({
    round,
    pondCodes,
    storage,
    keep: keep ?? (async (record) => (kept.push(record), true)),
    onPond: (pondCode) => moved.push(pondCode),
    clock: { date: () => date, tick: () => tick },
  });
  return {
    r,
    kept,
    moved,
    storage,
    setTime: (local: string) => (date = at(local)),
    wait: (ms = 1000) => (tick += ms),
    /** Types these into the Pond reached and taps Save, as the form does. */
    save: async (values: object = typed(), paperAt: string | null = null) => {
      r.typing();
      r.view().draft.change(values);
      return saving(r.tap(values as Record<string, unknown>, paperAt));
    },
  };
}
const saving = (tap: Tap) => {
  assert.ok(typeof tap === "object" && "saving" in tap, `expected a save, got ${JSON.stringify(tap)}`);
  return tap.saving;
};
// A phone whose Round already has readings at these Ponds, written as a save writes them.
const withMarks = (...codes: string[]) => {
  const storage = memory();
  const marks = Object.fromEntries(
    codes.map((c) => [c, { id: crypto.randomUUID(), dissolvedOxygen: 5, temperature: 28 }]),
  );
  storage.setItem(`pondcube:round:${MORNING}`, JSON.stringify(marks));
  return phone({ storage });
};

async function main() {
  // One Round per day and Period; noon is the first afternoon minute.
  const noon = at("2026-11-01T08:00");
  assert.equal(periodAt("2026-11-01T11:59"), "morning");
  assert.equal(periodAt("2026-11-01T12:00"), "afternoon");
  assert.equal(whichRound("2026-11-01T11:59", noon, memory()), MORNING);
  assert.equal(whichRound("2026-11-01T12:00", noon, memory()), "2026-11-01:afternoon");
  assert.equal(localTime(at("2026-11-01T08:05")), "2026-11-01T08:05");

  // A Round that runs past noon stays one Round while readings keep coming, so its marks don't vanish mid-walk.
  const live = phone({ time: "2026-11-01T11:50" });
  assert.equal(whichRound(null, at("2026-11-01T08:00"), live.storage), MORNING, "nothing saved yet: now's Round");
  await live.save();
  assert.equal(whichRound(null, at("2026-11-01T12:10"), live.storage), MORNING, "20 minutes on, past noon: same Round");
  assert.equal(
    whichRound(null, at("2026-11-01T12:30"), live.storage),
    "2026-11-01:afternoon",
    "40 minutes on: a new one",
  );
  assert.equal(whichRound(null, at("2026-11-02T08:00"), live.storage), "2026-11-02:morning", "next day: a new Round");
  // A reading saved with a wrong clock, days ahead of now, doesn't hold the Round open either.
  assert.equal(whichRound(null, at("2026-10-30T14:00"), live.storage), "2026-10-30:afternoon");

  // Recorded-at: a live reading takes the moment of the tap, each its own, and its Period follows.
  const clocked = phone({ time: "2026-11-01T11:59" });
  await clocked.save();
  clocked.setTime("2026-11-01T12:01");
  await clocked.save();
  assert.deepEqual(
    clocked.kept.map((k) => [(k.recordedAt as Date).toISOString(), k.period, k.pondCode]),
    [
      ["2026-11-01T03:59:00.000Z", "morning", "A"],
      ["2026-11-01T04:01:00.000Z", "afternoon", "B"],
    ],
  );

  // Typed from paper: every reading takes the time set, has its own marks, and never makes its Round the live one.
  const paper = phone({ round: "2026-10-31:afternoon", time: "2026-11-01T08:00" });
  await paper.save(typed(), "2026-10-31T14:30");
  assert.equal((paper.kept[0].recordedAt as Date).toISOString(), "2026-10-31T06:30:00.000Z");
  assert.equal(paper.kept[0].period, "afternoon");
  assert.equal(whichRound(null, at("2026-11-01T08:00"), paper.storage), MORNING);
  assert.deepEqual(Object.keys(phone({ storage: paper.storage, round: "2026-10-31:afternoon" }).r.view().marks), ["A"]);

  // Typing from paper survives a reload, so its readings can't take the current time; its time goes after half an hour away.
  const PAPER = "2026-10-31T09:00";
  const device = memory();
  assert.equal(restorePaperAt(at("2026-11-01T08:00"), device), null, "off until it's turned on");
  keepPaperAt(PAPER, device);
  keepLeftApp(at("2026-11-01T08:00").getTime(), device);
  assert.equal(restorePaperAt(at("2026-11-01T08:29"), device), PAPER, "a reload keeps it on, with its time");
  assert.equal(restorePaperAt(at("2026-11-01T08:31"), device), "", "on, and it asks for the time again");
  keepPaperAt("", device);
  assert.equal(restorePaperAt(at("2026-11-01T08:01"), device), "", "on with no time yet stays so");
  keepPaperAt(null, device);
  assert.equal(restorePaperAt(at("2026-11-01T08:01"), device), null, "turned off stays off");
  const neverLeft = memory();
  keepPaperAt(PAPER, neverLeft);
  assert.equal(restorePaperAt(at("2026-11-01T08:01"), neverLeft), "", "no word of when it left: it asks");
  assert.equal(restorePaperAt(at("2026-11-01T08:01"), broken), null);
  keepPaperAt(PAPER, broken);
  const garbledPaper = memory();
  garbledPaper.setItem("pondcube:paperAt", "{not json");
  assert.equal(restorePaperAt(at("2026-11-01T08:01"), garbledPaper), null);
  // Coming back without a reload, the same rule.
  const left = at("2026-11-01T08:00").getTime();
  assert.equal(paperAfterAway(PAPER, left, at("2026-11-01T08:29")), PAPER);
  assert.equal(paperAfterAway(PAPER, left, at("2026-11-01T08:31")), "");
  assert.equal(paperAfterAway(null, left, at("2026-11-01T08:31")), null, "off isn't turned on");
  assert.equal(paperAfterAway(PAPER, Infinity, at("2026-11-01T08:31")), PAPER, "it never left");

  // Marks are per Round, outlive the screen, and the latest reading of a pond is the one shown.
  const reopened = phone({ storage: live.storage });
  assert.deepEqual(Object.keys(reopened.r.view().marks), ["A"]);
  assert.equal(reopened.r.view().current, "B", "it picks up where it got to");
  assert.deepEqual(
    phone({ storage: live.storage, round: "2026-11-01:afternoon" }).r.view().marks,
    {},
    "a new one is empty",
  );

  // A Correction, from the tap to the Record: it names what it replaces, keeps its time, and what's left blank keeps its
  // value, so nothing is lost by correcting one. It's a new Record, at the time of the one it corrects, even past noon.
  const fix = phone({ pondCodes: ["A", "B"], time: "2026-11-01T11:50" });
  await fix.save(typed({ ph: "0", remarks: "cloudy" }));
  const first = fix.kept[0];
  assert.equal(first.replaces, undefined, "a first reading replaces nothing");
  fix.setTime("2026-11-01T12:20");
  fix.r.open("A");
  assert.equal(await fix.save(typed({ dissolvedOxygen: "6", temperature: "" })), "kept");
  const correction = fix.kept[1];
  assert.equal(correction.pondCode, "A");
  assert.equal(correction.replaces, first.id);
  assert.notEqual(correction.id, first.id);
  assert.deepEqual((correction.recordedAt as Date).toISOString(), (first.recordedAt as Date).toISOString());
  assert.equal(correction.period, "morning");
  assert.deepEqual(
    [correction.dissolvedOxygen, correction.temperature, correction.ph, correction.remarks],
    [6, 28.1, 0, "cloudy"],
  );
  assert.equal(RECORD_KINDS.wq.save.parse({ ...correction, person: "Ana" }).replaces, first.id, "as intake accepts it");
  assert.equal(fix.r.view().marks.A.id, correction.id, "the latest reading is the one shown");
  assert.equal(fix.r.view().current, "B", "a correction goes back to where the Operator had got to");
  // What's typed wins, and a correction of a correction replaces the correction.
  fix.r.open("A");
  await fix.save(typed({ temperature: "29", ph: "7", remarks: "clear" }));
  assert.equal(fix.kept[2].replaces, correction.id);
  assert.deepEqual([fix.kept[2].temperature, fix.kept[2].ph, fix.kept[2].remarks], [29, 7, "clear"]);
  // A field the reading never had stays empty.
  assert.equal(fix.kept[1].ammonia, undefined);

  // Blank means nothing typed: it makes no Record. A 0 is a reading.
  assert.ok(isBlank(nothing));
  assert.ok(isBlank(typed({ dissolvedOxygen: "", temperature: "", remarks: "   " })));
  assert.ok(isBlank({}));
  assert.ok(!isBlank(typed({ dissolvedOxygen: "0", temperature: "" })));
  assert.ok(!isBlank({ dissolvedOxygen: 0 }));
  assert.ok(!isBlank(typed({ dissolvedOxygen: "", temperature: "", ph: "7" })));
  assert.ok(!isBlank(typed({ dissolvedOxygen: "", temperature: "", remarks: "dead fish" })));

  // Skip works once a Pond has shown for a second, so a double tap can't skip one; typing lifts the wait.
  const skip = phone();
  assert.equal(skip.r.tap(nothing, null), "ignored");
  assert.equal(skip.r.view().current, "A");
  skip.wait();
  assert.equal(skip.r.tap(nothing, null), "skipped");
  assert.equal(skip.r.view().current, "B");
  assert.equal(skip.r.tap(nothing, null), "ignored", "the wait starts again on each Pond");
  assert.deepEqual(skip.kept, []);
  assert.deepEqual(skip.r.view().marks, {}, "a Pond skipped has no reading");
  assert.equal(await skip.save(), "kept", "typing lifts it");
  assert.deepEqual(skip.moved, ["B", "C"], "the other tabs follow; opening the Round moved nothing");

  // A Draft from before (another day, a reload) is never saved unseen: it takes a second Save, or typing over it.
  const earlier = memory();
  earlier.setItem(draftKey("wq", "A"), JSON.stringify(typed()));
  const before = phone({ storage: earlier });
  before.wait();
  assert.equal(before.r.tap(typed(), null), "recheck");
  assert.equal(before.r.view().rechecking, true);
  assert.equal(before.r.tap(typed(), null), "ignored", "a double tap isn't the second Save");
  before.wait();
  assert.equal(await saving(before.r.tap(typed(), null)), "kept");
  assert.equal(before.kept.length, 1);
  assert.equal(before.r.view().rechecking, false);

  const overType = memory();
  overType.setItem(draftKey("wq", "A"), JSON.stringify(typed()));
  const over = phone({ storage: overType });
  over.wait();
  over.r.tap(typed(), null);
  over.r.typing();
  assert.equal(over.r.view().rechecking, false, "typing over it answers the question");
  assert.equal(await saving(over.r.tap(typed({ temperature: "30" }), null)), "kept");
  assert.equal(over.kept[0].temperature, 30);

  const leave = memory();
  leave.setItem(draftKey("wq", "A"), JSON.stringify(typed()));
  const leaving = phone({ storage: leave });
  leaving.wait();
  leaving.r.tap(typed(), null);
  leaving.r.open("B");
  assert.equal(leaving.r.view().rechecking, false);
  assert.deepEqual(Object.keys(leaving.r.view().typed), ["A"], "what's typed there still shows on its row");

  // What's out of Range is refused with nothing kept, and the Pond stays.
  const wrong = phone();
  wrong.r.typing();
  const refused = wrong.r.tap(typed({ dissolvedOxygen: "50", temperature: "" }), null);
  assert.ok(typeof refused === "object" && "invalid" in refused);
  assert.deepEqual(
    refused.invalid.issues.map((i) => i.path[0]),
    ["dissolvedOxygen", "temperature"],
  );
  assert.deepEqual(wrong.kept, []);
  assert.equal(wrong.r.view().current, "A");

  // No room and no signal, or a time later than now: not saved, the Draft stays, no mark, and the Pond stays.
  const full = phone({ keep: async () => false });
  assert.equal(await full.save(), "notKept");
  assert.equal(full.r.view().failure, "notKept");
  assert.equal(full.r.view().current, "A");
  assert.deepEqual(full.r.view().marks, {});
  assert.deepEqual(readDraft("wq", "A", full.storage), typed());
  const ahead = phone();
  assert.equal(await ahead.save(typed(), "2999-01-01T08:00"), "futureRecordedAt");
  assert.equal(ahead.r.view().failure, "futureRecordedAt");
  assert.deepEqual(ahead.kept, []);
  ahead.r.open("B");
  assert.equal(ahead.r.view().failure, null, "the message goes with the Pond");

  // Not kept, though the server may have it: Save again, even after leaving the Pond, sends the same Record, and its
  // mark has the id the server got, so a Correction replaces the right one.
  const tried: string[] = [];
  let room = false;
  const retrying = phone({ keep: async ({ id }) => (tried.push(id), room) });
  assert.equal(await retrying.save(), "notKept");
  retrying.r.open("B");
  retrying.r.open("A");
  room = true;
  assert.equal(await retrying.save(), "kept");
  assert.deepEqual(tried, [tried[0], tried[0]], "the same id both times");
  assert.equal(retrying.r.view().marks.A.id, tried[0]);
  retrying.r.open("A");
  room = true;
  await retrying.save(typed({ dissolvedOxygen: "6" }));
  assert.notEqual(tried[2], tried[0], "a Correction is a new Record");

  // During a save nothing moves the Round: it finishes on its own Pond.
  let finish: (ok: boolean) => void = () => {};
  const slow = phone({ keep: () => new Promise((resolve) => (finish = resolve)) });
  const pending = slow.save();
  assert.equal(slow.r.view().saving, true);
  assert.equal(slow.r.tap(typed(), null), "ignored");
  assert.equal(slow.r.open("C"), false);
  assert.equal(slow.r.view().current, "A");
  finish(true);
  assert.equal(await pending, "kept");
  assert.equal(slow.r.view().saving, false);
  assert.equal(slow.r.view().current, "B");
  assert.equal(slow.r.view().last, "A", "the Pond saved last, for the bar's confirmation");

  // Where each Pond's reading is; what's typed and not saved comes first, as it's what could be lost.
  const rows = phone();
  await rows.save();
  const id = rows.kept[0].id;
  assert.equal(rows.r.status("A", new Set([id])), "waiting");
  assert.equal(rows.r.status("A", new Set()), "saved");
  assert.equal(rows.r.status("C", new Set()), null);
  rows.r.view().draft.change(typed());
  rows.r.open("A");
  assert.equal(rows.r.status("B", new Set()), "typed");

  // A row typed in and left unsaved is findable; an empty or unreadable Draft, or another kind's, isn't one.
  const drafts = memory();
  drafts.setItem(draftKey("wq", "A"), JSON.stringify(typed()));
  drafts.setItem(draftKey("wq", "B"), JSON.stringify(nothing));
  drafts.setItem(draftKey("wq", "C"), "{not json");
  drafts.setItem(draftKey("feeding", "D"), JSON.stringify(typed()));
  const found = phone({ storage: drafts, pondCodes: ["Z", "A", "B", "C", "D", "E"] });
  assert.deepEqual(Object.keys(found.r.view().typed), ["A"]);

  // Storage refusing changes nothing for the running screen, and never throws.
  const refusing = phone({ storage: broken });
  assert.deepEqual(refusing.r.view().marks, {});
  assert.deepEqual(refusing.r.view().typed, {});
  assert.equal(await refusing.save(), "kept");
  assert.deepEqual(Object.keys(refusing.r.view().marks), ["A"]);
  assert.equal(refusing.r.view().current, "B");
  assert.equal(whichRound(null, at("2026-11-01T08:00"), broken), MORNING);
  forgetOldRounds(at("2026-11-01T08:00"), broken);
  const garbled = memory();
  garbled.setItem(`pondcube:round:${MORNING}`, "{not json");
  garbled.setItem("pondcube:latestRound", "{not json");
  assert.deepEqual(phone({ storage: garbled }).r.view().marks, {});
  assert.equal(whichRound(null, at("2026-11-01T08:00"), garbled), MORNING);

  // Old marks go, so they can't fill the storage the Outbox needs; Drafts and the Outbox aren't touched.
  const old = memory();
  for (const day of ["2026-10-01", "2026-10-30", "2026-10-31", "2026-11-01"])
    await phone({ storage: old, round: `${day}:morning` }).save();
  old.setItem("pondcube:outbox:1", "kept");
  forgetOldRounds(at("2026-11-01T08:00"), old);
  assert.deepEqual(
    old
      .keys()
      .filter((k) => k !== "pondcube:latestRound")
      .sort(),
    ["pondcube:outbox:1", "pondcube:round:2026-10-31:morning", "pondcube:round:2026-11-01:morning"].sort(),
  );
  const keptDraft = memory();
  keptDraft.setItem(draftKey("wq", "A"), "kept");
  forgetOldRounds(at("2026-11-01T08:00"), keptDraft);
  assert.equal(keptDraft.getItem(draftKey("wq", "A")), "kept");

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
  const afterA = withMarks("A", "B", "C");
  afterA.r.open("A");
  await afterA.save(typed({ dissolvedOxygen: "6" }));
  assert.equal(afterA.r.view().current, "D", "correcting A from D goes back to D");
  const afterD = withMarks("E");
  afterD.r.open("D");
  await afterD.save();
  assert.equal(afterD.r.view().current, "", "nothing after D without a reading: the end");
  const afterE = phone();
  afterE.r.open("E");
  await afterE.save();
  assert.equal(afterE.r.view().current, "", "the last pond: the end");
  assert.deepEqual(afterE.moved, ["E"], "past the last Pond the other tabs stay on it");
  // It picks up after the last reading, past empty ponds skipped on the way, and at the end only when nothing's left.
  assert.equal(phone().r.view().current, "A");
  assert.equal(withMarks("A", "C").r.view().current, "D", "B was skipped on purpose");
  assert.equal(withMarks("E").r.view().current, "");
  assert.equal(withMarks("gone").r.view().current, "A", "a mark for a retired pond doesn't count");
  assert.equal(phone({ pondCodes: [] }).r.view().current, "");

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
  const whole = phone({
    storage: store,
    pondCodes: ponds,
    time: "2026-11-01T09:00",
    keep: (record) => outbox.add({ kind: "wq", account: "a", person: "Ana", record }),
  });
  for (const pondCode of ponds) {
    assert.equal(whole.r.view().current, pondCode);
    assert.equal(await whole.save(), "kept");
    assert.equal(readDraft("wq", pondCode, store), null, "the Draft clears once the Record is in the Outbox");
  }
  assert.equal(whole.r.view().current, "", "the end of the list");
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
  assert.equal(Object.keys(phone({ storage: store }).r.view().marks).length, 245, "marks outlive the sending");

  console.log("rounds OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
