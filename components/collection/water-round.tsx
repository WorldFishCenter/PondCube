"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useWatch } from "react-hook-form";
import { format } from "date-fns";
import { ChevronDownIcon, Info, Pencil } from "lucide-react";
import { areasOf, periodAt, PERIODS, pondNumber } from "@/lib/options";
import { createRound, forgetOldRounds, isBlank, localTime, whichRound, type PaperAt } from "@/lib/round";
import { readLocal, writeLocal } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { noticeShown, OutboxAlert, type Outbox } from "./outbox";
import type { Pond } from "./pond-combobox";
import {
  Choice,
  NotesField,
  notSaved,
  NumberField,
  ResultAlert,
  STATUS,
  StatusBadge,
  type Status,
  useDraftForm,
} from "./record-form";

const AREA_KEY = "pondcube:lastArea";
const COLUMNS = "grid grid-cols-[3.5rem_1fr_1fr_4.5rem] gap-2";
// Saved values, past the 4.5:1 rule on purpose: what's typed has to stand out from them.
const FADED = "placeholder:text-muted-foreground/70";

const REQUIRED = [
  { name: "dissolvedOxygen", label: "Oxygen (mg/L)" }, // the short name, to stay on one line: this is read 245 times
  { name: "temperature", label: "Temperature (°C)" },
] as const;
// In the order of the old log.
const OPTIONAL = [
  { name: "ph", label: "pH" },
  { name: "ammonia", label: "Ammonia (mg/L)" },
  { name: "nitrate", label: "Nitrate (mg/L)" },
  { name: "nitrite", label: "Nitrite (mg/L)" },
] as const;

const blank = () => ({
  dissolvedOxygen: "",
  temperature: "",
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  remarks: "",
});
type Field = keyof ReturnType<typeof blank>;

// Keeps the keyboard up: a tap here mustn't take focus away from the input being typed in.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** The Water tab: a Round through one Area's Ponds. */
export function WaterRound({
  ponds,
  paperAt,
  outbox,
  onPond,
}: {
  ponds: Pond[];
  paperAt: PaperAt;
  outbox: Outbox;
  onPond: (pondCode: string) => void; // the Pond the Round moved to, for the other tabs
}) {
  const areas = React.useMemo(() => areasOf(ponds), [ponds]);
  // Only these two: Base UI's Select takes an object with `items` for a group.
  const choices = React.useMemo(() => areas.map(({ value, label }) => ({ value, label })), [areas]);
  const [chosen, setChosen] = React.useState(() => readLocal(AREA_KEY) ?? "");
  const [now, setNow] = React.useState(() => new Date());
  // The app can stay open from one Round to the next (a phone only sleeps).
  React.useEffect(() => {
    forgetOldRounds(new Date());
    const tick = () => setNow(new Date());
    const back = () => {
      forgetOldRounds(new Date());
      tick();
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);

  const area = areas.find((a) => a.value === chosen) ?? areas[0];
  // No bar to put the Outbox notice under.
  const blocked = (title: string, text: string) => (
    <>
      <Alert>
        <Info />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{text}</AlertDescription>
      </Alert>
      <OutboxAlert outbox={outbox} />
    </>
  );
  if (!area) return blocked("No ponds", "There are no ponds on your list yet. Ask your supervisor.");
  // Not set yet, or its time was cleared.
  if (paperAt !== null && Number.isNaN(Date.parse(paperAt)))
    return blocked("Set the date & time", "Above, choose when you took the readings you wrote down.");
  const round = whichRound(paperAt, now);
  return (
    // Keyed: another Area or Round picks up where it got to, with its own marks.
    <AreaRound
      key={`${area.value}|${round}`}
      area={area}
      areas={choices}
      chooseArea={(value) => {
        setChosen(value);
        writeLocal(AREA_KEY, value);
      }}
      roundId={round}
      paperAt={paperAt}
      now={now}
      outbox={outbox}
      onPond={onPond}
    />
  );
}

function AreaRound({
  area,
  areas,
  chooseArea,
  roundId,
  paperAt,
  now,
  outbox,
  onPond,
}: {
  area: ReturnType<typeof areasOf<Pond>>[number];
  areas: { value: string; label: string }[];
  chooseArea: (value: string) => void;
  roundId: string;
  paperAt: PaperAt;
  now: Date;
  outbox: Outbox;
  onPond: (pondCode: string) => void;
}) {
  const list = area.items;
  const codes = React.useMemo(() => list.map((p) => p.pondCode), [list]);
  const { add } = outbox; // stable across renders, unlike the outbox object
  const round = React.useMemo(
    () => createRound({ round: roundId, pondCodes: codes, keep: (record) => add("wq", record), onPond }),
    [roundId, codes, add, onPond],
  );
  const { current, draft, marks, last, rechecking, saving, failure } = React.useSyncExternalStore(
    round.subscribe,
    round.view,
    round.view,
  );
  const [moreFor, setMoreFor] = React.useState(""); // the Pond with More readings open: closed on the next one
  const top = React.useRef<HTMLDivElement>(null);

  const form = useDraftForm(draft, blank);
  const {
    register,
    setFocus,
    setError,
    clearErrors,
    getValues,
    control,
    formState: { errors },
  } = form;
  // Renders only when one of these flips, not on each keystroke: 120 rows hang off this.
  const { empty, typedMore } = useWatch({
    control,
    compute: (v) => ({ empty: isBlank(v), typedMore: !isBlank({ ...v, dissolvedOxygen: "", temperature: "" }) }),
  });
  const showMore = moreFor === current || typedMore; // never hides a value, or an error on one

  const saveOrSkip = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const tap = round.tap(getValues(), paperAt);
    if (tap === "ignored") return;
    setFocus("dissolvedOxygen"); // in the tap itself: iPhones keep the keyboard up only for a focus made there
    if (typeof tap === "object" && "invalid" in tap)
      tap.invalid.issues.forEach(({ path, message }, i) =>
        setError(path[0] as Field, { message }, { shouldFocus: i === 0 }),
      );
  };

  const open = React.useCallback(
    (code: string) => {
      if (round.view().saving) return; // the save finishes on its own Pond
      follow(top.current, code, true);
      flushSync(() => round.open(code)); // the inputs must exist for the focus, still in the tap
      setFocus("dissolvedOxygen");
    },
    [round, setFocus],
  );
  const notice = noticeShown(outbox);
  // `notice`: it sits above the rows, so they moved when it came or went.
  React.useEffect(() => {
    if (!showMore) follow(top.current, current, false);
  }, [current, showMore, notice]);
  // Unstuck, the bar is far above once deep in a list: back to it, so it stays where it was on screen.
  React.useLayoutEffect(() => {
    const barTop = top.current?.getBoundingClientRect().top ?? 0;
    if (showMore && barTop < 0) window.scrollBy(0, barTop);
  }, [showMore]);
  const lift = () => {
    if (!showMore) follow(top.current, current, true);
  };

  const waiting = new Set([...outbox.mine, ...outbox.others].map((w) => w.record.id));
  const lastStatus = round.status(last, waiting);
  const done = codes.filter((c) => marks[c]).length;
  const mark = marks[current];
  const period = PERIODS.find((p) => p.value === periodAt(paperAt ?? localTime(now)))?.label;
  const wrong = REQUIRED.map(({ name }) => errors[name]).filter(Boolean);

  return (
    <div ref={top} className="flex flex-col gap-2">
      {/* Stays on screen while the rows scroll, unless its optional readings make it too tall to. */}
      <Card size="sm" className={cn("z-10", !showMore && "sticky top-0")}>
        <CardContent className="flex flex-col gap-3">
          {/* Where, how far, and the last save. A fixed height, so nothing here moves the bar: Save must stay put. */}
          <div className="flex min-h-11 items-center justify-between gap-2">
            <FieldLabel htmlFor="round-area" className="sr-only">
              Area
            </FieldLabel>
            <Choice id="round-area" items={areas} value={area.value} onChange={(v) => v && chooseArea(v)} />
            <div className="flex min-w-0 flex-col items-end gap-1 text-xs">
              <span className="tabular-nums">
                {done} of {list.length} ponds
              </span>
              <span role="status" className="flex min-w-0 justify-end">
                {mark && empty ? (
                  <span className="truncate text-muted-foreground">Empty boxes stay the same</span>
                ) : (
                  lastStatus && (
                    // Keyed: from one Pond to the next only a number changes, and each save must show.
                    <StatusBadge key={last} status={lastStatus} className="animate-in zoom-in-95 fade-in">
                      Pond {pondNumber(last)} {STATUS[lastStatus].word.toLowerCase()}
                    </StatusBadge>
                  )
                )}
              </span>
            </div>
          </div>
          {current ? (
            <form
              noValidate
              onSubmit={saveOrSkip}
              onInput={() => {
                round.typing();
                if (Object.keys(errors).length) clearErrors(); // checked again on the next Save
              }}
              className="flex flex-col gap-2"
            >
              <FieldGroup className="grid grid-cols-[4.5rem_1fr_1fr] items-end gap-2 [&_label]:text-xs">
                {/* The largest thing here: it's checked against the number painted on the Pond. */}
                <div>
                  <div className="text-xs text-muted-foreground">Pond</div>
                  <div id="round-pond" className="text-4xl leading-12 font-semibold tabular-nums">
                    {pondNumber(current)}
                  </div>
                </div>
                {REQUIRED.map(({ name, label }) => (
                  <NumberField
                    key={name}
                    id={`round-${name}`}
                    label={label}
                    error={errors[name]}
                    hideError // shown under Save, where it can't move it
                    className={cn("h-12 text-xl tabular-nums md:text-xl", FADED)}
                    aria-describedby="round-pond"
                    enterKeyHint={name === "temperature" ? "go" : "next"}
                    placeholder={mark?.[name]?.toString()} // the reading it has: left blank, it's kept
                    readOnly={saving}
                    onClick={lift}
                    onKeyDown={(e) => {
                      if (name === "temperature" || e.key !== "Enter") return;
                      e.preventDefault();
                      setFocus("temperature");
                    }}
                    {...register(name)}
                  />
                ))}
              </FieldGroup>
              {/* Anything that comes and goes stays below this row, so Save doesn't move. */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  aria-expanded={showMore}
                  onClick={() => setMoreFor((was) => (was === current ? "" : current))}
                >
                  <ChevronDownIcon data-icon="inline-start" className={cn(showMore && "rotate-180")} />
                  More readings
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  variant={empty ? "outline" : "default"}
                  onMouseDown={keepFocus}
                  disabled={saving}
                >
                  {empty ? (mark ? "No change" : "Skip") : "Save"}
                </Button>
              </div>
              {wrong.length > 0 && <FieldError errors={wrong} />}
              {rechecking && (
                <Alert>
                  <Pencil />
                  <AlertTitle>Typed earlier, not saved</AlertTitle>
                  <AlertDescription>
                    Check these values, then tap Save again to keep them, or type over them.
                  </AlertDescription>
                </Alert>
              )}
              {failure && <ResultAlert result={notSaved(failure)} />}
              {showMore && (
                <FieldGroup>
                  <FieldGroup className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {OPTIONAL.map(({ name, label }) => (
                      <NumberField
                        key={name}
                        id={`round-${name}`}
                        label={label}
                        hint="Optional."
                        error={errors[name]}
                        className={FADED}
                        placeholder={mark?.[name]?.toString()}
                        readOnly={saving}
                        {...register(name)}
                      />
                    ))}
                  </FieldGroup>
                  <NotesField
                    id="round-remarks"
                    className={FADED}
                    placeholder={mark?.remarks}
                    readOnly={saving}
                    {...register("remarks")}
                  />
                </FieldGroup>
              )}
            </form>
          ) : (
            <Alert>
              <Info />
              <AlertTitle>End of {area.label}</AlertTitle>
              <AlertDescription>
                {done} of {list.length} ponds have a reading in this round. Tap a pond to add or correct one, or pick
                another area above.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <OutboxAlert outbox={outbox} />
      <Card size="sm" className="gap-0 py-0">
        {/* The Round's when: it never changes during a walk, so it's out of the bar. */}
        <CardHeader className="pt-3">
          <CardDescription>
            {period} · {paperAt ? format(new Date(paperAt), "d MMM, HH:mm") : format(now, "d MMM")}
          </CardDescription>
        </CardHeader>
        <div className={cn(COLUMNS, "items-end px-3 pt-2 pb-1 text-xs text-muted-foreground")}>
          <span>Pond</span>
          {REQUIRED.map(({ name, label }) => (
            <span key={name}>{label}</span>
          ))}
        </div>
        {codes.map((pondCode) => (
          <PondRow
            key={pondCode}
            pondCode={pondCode}
            isCurrent={pondCode === current}
            oxygen={round.shown(pondCode, "dissolvedOxygen")}
            temperature={round.shown(pondCode, "temperature")}
            status={round.status(pondCode, waiting)}
            open={open}
          />
        ))}
      </Card>
    </div>
  );
}

// The list follows the bar once it's at the top; only a tap other than Save (`lift`) takes it there.
function follow(bar: HTMLElement | null, pondCode: string, lift: boolean) {
  const barTop = bar?.getBoundingClientRect().top;
  const row = document.getElementById(`round-${pondCode}`)?.getBoundingClientRect();
  if (barTop === undefined || !row || (barTop > 1 && !lift)) return;
  window.scrollTo({ top: window.scrollY + Math.max(barTop, row.top + row.height / 2 - window.innerHeight / 2) });
}

// Memo: an Area can have 120 rows, and each Save changes two of them.
const PondRow = React.memo(function PondRow({
  pondCode,
  isCurrent,
  oxygen,
  temperature,
  status,
  open,
}: {
  pondCode: string;
  isCurrent: boolean;
  oxygen: string;
  temperature: string;
  status: Status | null;
  open: (code: string) => void;
}) {
  return (
    <Button
      type="button"
      variant={isCurrent ? "secondary" : "ghost"}
      id={`round-${pondCode}`}
      aria-current={isCurrent || undefined}
      onMouseDown={keepFocus}
      onClick={() => open(pondCode)}
      className={cn(
        COLUMNS,
        // The has-data one: Button narrows its padding for an icon, here the Badge's, which would shift this row's columns.
        "h-auto w-full items-center justify-items-start rounded-none px-3 font-normal tabular-nums has-data-[icon=inline-start]:pl-3",
      )}
    >
      <span className="font-medium">{pondNumber(pondCode)}</span>
      <span>{oxygen}</span>
      <span>{temperature}</span>
      {status && <StatusBadge status={status} className="justify-self-end" />}
    </Button>
  );
});
