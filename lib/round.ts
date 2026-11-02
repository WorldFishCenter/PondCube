import { format, subDays } from "date-fns";
import type { z } from "zod";
import { createDraft, readDraft, type Draft, type NotSaved, type Submitted } from "./draft";
import { periodAt } from "./options";
import type { WaitingRecord } from "./outbox";
import { attempt, browserStorage, removeLocal, writeLocal, type KeyValueStorage } from "./storage";
import { waterQualityForm } from "./validation";

// A Round on this device: where it has got to, and what a tap on Save or Skip comes to. Its marks only say how far the
// Operator got and what a Correction replaces; each Record goes through its Draft and the Outbox like any other.

type Reading = z.output<typeof waterQualityForm>;

/** The latest reading a Pond got in a Round; `at` is its Recorded-at, which a correction of it keeps. */
type Mark = {
  id: string;
  dissolvedOxygen: number;
  temperature: number;
  ph?: number;
  ammonia?: number;
  nitrite?: number;
  nitrate?: number;
  remarks?: string;
  at?: string;
};
type Marks = Record<string, Mark>;

/** What a tap on Save or Skip came to. "ignored": too soon after the Pond showed, or a save is running. */
export type Tap = "ignored" | "skipped" | "recheck" | { invalid: z.ZodError } | { saving: Promise<Submitted> };

/** The seam to time. Adapters: the device's, a settable one in scripts/check-round.ts. */
export type Clock = { date: () => Date; tick: () => number };
const deviceClock: Clock = {
  date: () => new Date(),
  tick: () => performance.now(), // a change of the device clock can't stall it
};

const PREFIX = "pondcube:round:";
const LATEST = "pondcube:latestRound";
const STILL_GOING = 30 * 60_000; // readings this close together are one Round, even past noon
const SETTLE = 1000; // ms a Pond shows before Skip works: a tap before its number is read mustn't skip it

const read = <T>(key: string, storage: KeyValueStorage): T | null =>
  attempt(() => JSON.parse(storage.getItem(key) ?? "null") as T | null, null);

/** A device's local "YYYY-MM-DDTHH:mm". */
export const localTime = (at: Date) => format(at, "yyyy-MM-dd'T'HH:mm");
const roundAt = (local: string) => `${local.slice(0, 10)}:${periodAt(local)}`;

/** Typing from paper: null is off, "" is on with no time yet, else the local time every reading takes. */
export type PaperAt = string | null;

const PAPER = "pondcube:paperAt";
const LEFT = "pondcube:leftApp";
const AWAY = 30 * 60_000; // longer away from the app and its time clears: a later Round can't inherit it

/** What stays of Typing from paper, back at the app after leaving it at `left` (ms). */
export const paperAfterAway = (paperAt: PaperAt, left: number, now: Date): PaperAt =>
  paperAt && now.getTime() - left > AWAY ? "" : paperAt;
export const keepPaperAt = (paperAt: PaperAt, storage: KeyValueStorage = browserStorage) =>
  writeLocal(PAPER, JSON.stringify(paperAt), storage);
export const keepLeftApp = (left: number, storage: KeyValueStorage = browserStorage) =>
  writeLocal(LEFT, String(left), storage);
/** Typing from paper as it was left: a reload, or the browser closing the page, mustn't stamp its readings with now. */
export const restorePaperAt = (now: Date, storage: KeyValueStorage = browserStorage) =>
  paperAfterAway(read<PaperAt>(PAPER, storage), read<number>(LEFT, storage) ?? 0, now);

/** Which Round it is: the day and Period typed from paper; else the latest while its readings keep coming; else now's. */
export function whichRound(paperAt: PaperAt, now: Date, storage: KeyValueStorage = browserStorage) {
  if (paperAt) return roundAt(paperAt);
  const latest = read<{ round: string; at: number }>(LATEST, storage);
  return latest && Math.abs(now.getTime() - latest.at) < STILL_GOING ? latest.round : roundAt(localTime(now));
}

/** Only today's and yesterday's stay: marks must never fill the storage the Outbox needs. */
export function forgetOldRounds(now: Date, storage: KeyValueStorage = browserStorage) {
  const oldest = format(subDays(now, 1), "yyyy-MM-dd");
  for (const key of attempt(() => storage.keys(), [])) {
    if (key.startsWith(PREFIX) && key.slice(PREFIX.length) < oldest) removeLocal(key, storage);
  }
}

const TYPED = waterQualityForm.keyof().exclude(["id", "period", "replaces"]).options;
const unset = (value: unknown) => !String(value ?? "").trim();
/** Nothing typed: no Record comes of it. A 0 is a reading. */
export const isBlank = (values: Record<string, unknown>) => TYPED.every((f) => unset(values[f]));
// What a Correction keeps of the reading it replaces: every field left blank.
const keptFrom = (mark: Mark, values: Record<string, unknown>) =>
  TYPED.filter((f) => unset(values[f]) && mark[f] !== undefined).map((f) => [f, String(mark[f])] as const);

// The Ponds with a reading typed in and not saved, with what their Drafts hold.
function typedDrafts(pondCodes: string[], storage: KeyValueStorage) {
  const typed: Record<string, Record<string, unknown>> = {};
  for (const code of pondCodes) {
    const draft = readDraft("wq", code, storage);
    if (draft && !isBlank(draft)) typed[code] = draft;
  }
  return typed;
}

// The way through a list: the first Pond after `code` with no reading yet, "" at the end.
const pondAfter = (pondCodes: string[], marks: Marks, code?: string) =>
  pondCodes.slice(pondCodes.indexOf(code ?? "") + 1).find((c) => !marks[c]) ?? "";
// Where a Round picks up again: after the last Pond with a reading, not at an empty one skipped before it.
const resumePond = (pondCodes: string[], marks: Marks) =>
  pondAfter(pondCodes, marks, pondCodes.filter((c) => marks[c]).pop());

/** A Round on screen. Hold one per Area and Round; `view` is what it shows, and changes only through these calls. */
export function createRound({
  round,
  pondCodes,
  keep,
  onPond,
  storage = browserStorage,
  clock = deviceClock,
}: {
  round: string;
  pondCodes: string[];
  keep: (record: WaitingRecord["record"]) => Promise<boolean>; // into the Outbox
  onPond?: (pondCode: string) => void; // the Pond it moved to, for the other tabs
  storage?: KeyValueStorage;
  clock?: Clock;
}) {
  const drafts = new Map<string, Draft<unknown, Reading>>(); // one per Pond: a retry after leaving it is still a retry
  const draftOf = (pondCode: string) => {
    const draft =
      drafts.get(pondCode) ??
      createDraft<unknown, Reading>("wq", pondCode, (record) => keep({ ...record, pondCode }), storage);
    drafts.set(pondCode, draft);
    return draft;
  };
  // Only a Pond the bar has left changes `typed`: read once per move, not on each render.
  const reach = (pondCode: string) => ({
    current: pondCode, // "" past the last Pond
    draft: draftOf(pondCode),
    typed: typedDrafts(
      pondCodes.filter((c) => c !== pondCode),
      storage,
    ),
    rechecking: false,
    failure: null as NotSaved | null,
  });

  const marks = read<Marks>(PREFIX + round, storage) ?? {};
  let view = { marks, last: "", saving: false, ...reach(resumePond(pondCodes, marks)) };
  let settleUntil = clock.tick() + SETTLE;
  const typedHere = new Set<string>(); // Ponds typed at since this Round opened on screen
  const listeners = new Set<() => void>();

  const update = (change: Partial<typeof view>) => {
    view = { ...view, ...change };
    listeners.forEach((listener) => listener());
  };
  const move = (pondCode: string) => {
    settleUntil = clock.tick() + SETTLE;
    update(reach(pondCode));
    if (pondCode) onPond?.(pondCode);
  };

  async function save(reading: Reading, at: string, live: boolean): Promise<Submitted> {
    const { current, marks, draft } = view;
    update({ saving: true, failure: null });
    const record = await draft.submit(reading, at).catch(() => "notKept" as const);
    if (typeof record === "string") {
      update({ saving: false, failure: record });
      return record;
    }
    const kept = { ...marks, [current]: { ...record, at } };
    writeLocal(PREFIX + round, JSON.stringify(kept), storage);
    if (live) writeLocal(LATEST, JSON.stringify({ round, at: clock.date().getTime() }), storage);
    update({ saving: false, marks: kept, last: current });
    move(pondAfter(pondCodes, kept, current));
    return "kept";
  }

  return {
    view: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The Operator typed at the Pond reached. */
    typing: () => {
      settleUntil = 0;
      typedHere.add(view.current);
      if (view.rechecking) update({ rechecking: false });
    },
    /** A tap on a Pond's row. False during a save: it finishes on its own Pond. */
    open: (pondCode: string) => {
      if (view.saving) return false;
      if (pondCode === view.current) update({ rechecking: false, failure: null });
      else move(pondCode);
      return true;
    },
    /** A tap on Save or Skip, with what the form holds. `paperAt`: the local time set with Typing from paper. */
    tap: (values: Record<string, unknown>, paperAt: PaperAt): Tap => {
      const { current, marks, saving, rechecking } = view;
      if (saving || clock.tick() < settleUntil) return "ignored";
      if (isBlank(values)) {
        move(pondAfter(pondCodes, marks, current));
        return "skipped";
      }
      // A Draft from before (another day, a reload) is never saved as a reading now unseen.
      if (!typedHere.has(current) && !rechecking) {
        settleUntil = clock.tick() + SETTLE;
        update({ rechecking: true });
        return "recheck";
      }
      // A Pond with a reading in this Round: a Correction, the same observation. It replaces it, whole, and keeps its time.
      const mark = marks[current];
      const at = mark?.at ?? paperAt ?? localTime(clock.date());
      const parsed = waterQualityForm.safeParse({
        ...values,
        ...(mark && Object.fromEntries(keptFrom(mark, values))),
        replaces: mark?.id ?? "",
        period: periodAt(at),
      });
      return parsed.success ? { saving: save(parsed.data, at, !paperAt) } : { invalid: parsed.error };
    },
    /** Where a Pond's reading is; `waiting` holds the ids in the Outbox. */
    status: (pondCode: string, waiting: Set<string>) => {
      const mark = view.marks[pondCode];
      if (pondCode in view.typed) return "typed" as const;
      return !mark ? null : waiting.has(mark.id) ? ("waiting" as const) : ("saved" as const);
    },
  };
}
