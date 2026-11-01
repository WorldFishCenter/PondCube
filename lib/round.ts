import { format, subDays } from "date-fns";
import { readDraft } from "./draft";
import { byArea, periodAt } from "./options";
import { attempt, browserStorage, removeLocal, writeLocal, type KeyValueStorage } from "./storage";
import { waterQualityForm } from "./validation";

// A Round's progress on this device, only to show how far the Operator got: the Records themselves are in the Outbox.

/** The latest reading a Pond got in a Round; `at` is its Recorded-at, which a correction of it keeps. */
export type Mark = { id: string; dissolvedOxygen: number; temperature: number; at?: string };
export type Marks = Record<string, Mark>;

const PREFIX = "pondcube:round:";
const LATEST = "pondcube:latestRound";
const STILL_GOING = 30 * 60_000; // readings this close together are one Round, even past noon

const read = <T>(key: string, storage: KeyValueStorage): T | null =>
  attempt(() => JSON.parse(storage.getItem(key) ?? "null") as T | null, null);

/** A device's local "YYYY-MM-DDTHH:mm". */
export const localTime = (at: Date) => format(at, "yyyy-MM-dd'T'HH:mm");
/** One Round per day and Period; `local` is a local "YYYY-MM-DDTHH:mm". */
export const roundAt = (local: string) => `${local.slice(0, 10)}:${periodAt(local)}`;

/** The Round going on now: the latest one while its readings keep coming, else this day and Period's. */
export function liveRound(now: Date, storage: KeyValueStorage = browserStorage) {
  const latest = read<{ round: string; at: number }>(LATEST, storage);
  return latest && Math.abs(now.getTime() - latest.at) < STILL_GOING ? latest.round : roundAt(localTime(now));
}

export const readMarks = (round: string, storage: KeyValueStorage = browserStorage) =>
  read<Marks>(PREFIX + round, storage) ?? {};

/** The marks with this one added. `liveAt`: when a reading was taken now; null for ones typed from paper. */
export function keepMark(
  round: string,
  marks: Marks,
  pondCode: string,
  mark: Mark,
  liveAt: Date | null,
  storage: KeyValueStorage = browserStorage,
): Marks {
  const kept = { ...marks, [pondCode]: mark };
  writeLocal(PREFIX + round, JSON.stringify(kept), storage);
  if (liveAt) writeLocal(LATEST, JSON.stringify({ round, at: liveAt.getTime() }), storage);
  return kept;
}

/** Only today's and yesterday's stay: marks must never fill the storage the Outbox needs. */
export function forgetOldRounds(now: Date, storage: KeyValueStorage = browserStorage) {
  const oldest = format(subDays(now, 1), "yyyy-MM-dd");
  for (const key of attempt(() => storage.keys(), [])) {
    if (key.startsWith(PREFIX) && key.slice(PREFIX.length) < oldest) removeLocal(key, storage);
  }
}

const TYPED = waterQualityForm.keyof().exclude(["id", "period", "replaces"]).options;
/** Nothing typed: no Record comes of it. A 0 is a reading. */
export const isBlank = (values: Record<string, unknown>) => TYPED.every((f) => !String(values[f] ?? "").trim());

/** The Ponds with a reading typed in and not saved, with what their Drafts hold. */
export function typedDrafts(pondCodes: string[], storage: KeyValueStorage = browserStorage) {
  const typed: Record<string, Record<string, unknown>> = {};
  for (const code of pondCodes) {
    const draft = readDraft("wq", code, storage);
    if (draft && !isBlank(draft)) typed[code] = draft;
  }
  return typed;
}

/** Ponds by Site and Area, Areas in walking order, ponds as given. Named with the Site only when there are several. */
export function areasOf<P extends { site: string; area: string }>(ponds: P[]) {
  const several = new Set(ponds.map((p) => p.site)).size > 1;
  const areas = new Map<string, { value: string; site: string; area: string; label: string; items: P[] }>();
  for (const pond of ponds) {
    const value = `${pond.site}:${pond.area}`;
    const known = areas.get(value);
    if (known) known.items.push(pond);
    else
      areas.set(value, {
        value,
        site: pond.site,
        area: pond.area,
        label: several ? `${pond.site} · ${pond.area}` : pond.area,
        items: [pond],
      });
  }
  return [...areas.values()].sort((a, b) => a.site.localeCompare(b.site) || byArea(a.area, b.area));
}

/** The way through a list: the first Pond after `code` with no reading yet, "" at the end. */
export const pondAfter = (pondCodes: string[], marks: Marks, code?: string) =>
  pondCodes.slice(pondCodes.indexOf(code ?? "") + 1).find((c) => !marks[c]) ?? "";
/** Where a Round picks up again: after the last Pond with a reading, not at an empty one skipped before it. */
export const resumePond = (pondCodes: string[], marks: Marks) =>
  pondAfter(pondCodes, marks, pondCodes.filter((c) => marks[c]).pop());

/** The number a pond code ends in, as painted on the Pond; the whole code if it has none. */
export const pondNumber = (pondCode: string) => Number(pondCode.match(/\d+$/)?.[0] ?? NaN) || pondCode;
