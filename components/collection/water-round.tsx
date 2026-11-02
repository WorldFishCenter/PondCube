"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useWatch } from "react-hook-form";
import { format } from "date-fns";
import { CheckCircle2, ChevronDownIcon, Info, Pencil } from "lucide-react";
import { periodAt, PERIODS } from "@/lib/options";
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
  type Marks,
} from "@/lib/round";
import { readLocal, writeLocal } from "@/lib/storage";
import { waterQualityForm } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { noticeShown, OutboxAlert, type Outbox } from "./outbox";
import type { Pond } from "./pond-combobox";
import {
  Choice,
  NotesField,
  NumberField,
  ResultAlert,
  STATUS,
  StatusBadge,
  type Status,
  useRecordForm,
} from "./record-form";

const AREA_KEY = "pondcube:lastArea";
const SETTLE = 1000; // ms a Pond shows before Skip works: a tap before its number is read mustn't skip it
const COLUMNS = "grid grid-cols-[3.5rem_1fr_1fr_4.5rem] gap-2";

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
  period: "morning" as (typeof PERIODS)[number]["value"], // set from Recorded-at on each Save
  dissolvedOxygen: "",
  temperature: "",
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  remarks: "",
  replaces: "", // set on each Save
});

// Keeps the keyboard up: a tap here mustn't take focus away from the input being typed in.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** The Water tab: a Round through one Area's Ponds. `past`: null takes each reading's time from now; "" isn't set yet. */
export function WaterRound({
  ponds,
  past,
  outbox,
  onPond,
}: {
  ponds: Pond[];
  past: string | null;
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
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const area = areas.find((a) => a.value === chosen) ?? areas[0];
  // No bar to put the Outbox notice under.
  const stop = (title: string, text: string) => (
    <div className="flex flex-col gap-2">
      <Alert>
        <Info />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{text}</AlertDescription>
      </Alert>
      <OutboxAlert outbox={outbox} />
    </div>
  );
  if (!area) return stop("No ponds", "There are no ponds on your list yet. Ask your supervisor.");
  // Not set yet, or its time was cleared.
  if (past !== null && Number.isNaN(Date.parse(past)))
    return stop("Set the date & time", "Above, choose when you took the readings you wrote down.");
  const round = past ? roundAt(past) : liveRound(now);
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
      round={round}
      past={past}
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
  round,
  past,
  now,
  outbox,
  onPond,
}: {
  area: ReturnType<typeof areasOf<Pond>>[number];
  areas: { value: string; label: string }[];
  chooseArea: (value: string) => void;
  round: string;
  past: string | null;
  now: Date;
  outbox: Outbox;
  onPond: (pondCode: string) => void;
}) {
  const list = area.items;
  const codes = React.useMemo(() => list.map((p) => p.pondCode), [list]);
  const [marks, setMarks] = React.useState<Marks>(() => readMarks(round));
  const [current, setCurrent] = React.useState(() => resumePond(codes, marks));
  const [moreFor, setMoreFor] = React.useState(""); // the Pond with More readings open: closed on the next one
  const [check, setCheck] = React.useState(""); // the Pond whose values were typed earlier: Save once more keeps them
  const [last, setLast] = React.useState(""); // the Pond saved last, for the bar's confirmation
  const settleUntil = React.useRef(0); // performance.now(), which a change of the device clock can't stall
  const typedNow = React.useRef(new Set<string>()); // Ponds typed at since this Round opened on screen
  const saving = React.useRef(false);
  const top = React.useRef<HTMLDivElement>(null);
  const stamp = React.useRef(""); // set at each Save: a Round lasts over an hour, and each reading keeps its own time
  const recordedAt = {
    get value() {
      return stamp.current;
    },
  };

  React.useLayoutEffect(() => {
    settleUntil.current = performance.now() + SETTLE;
  }, [current]);

  const { form, card, clearResult } = useRecordForm({
    kind: "wq",
    schema: waterQualityForm,
    blank,
    savedMessage: () => "Water-quality reading saved.",
    pondCode: current,
    recordedAt,
    outbox,
    onSaved: ({ id, dissolvedOxygen, temperature }) => {
      const saved = { id, dissolvedOxygen, temperature, at: stamp.current };
      setMarks(keepMark(round, marks, current, saved, past ? null : new Date()));
      setLast(current);
      move(pondAfter(codes, marks, current));
    },
  });
  const {
    register,
    setFocus,
    setValue,
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

  const move = React.useCallback(
    (pondCode: string) => {
      clearResult();
      setCheck("");
      setCurrent(pondCode);
      if (pondCode) onPond(pondCode);
    },
    [clearResult, onPond],
  );

  const next = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (card.pending || performance.now() < settleUntil.current) return;
    setFocus("dissolvedOxygen"); // in the tap itself: iPhones keep the keyboard up only for a focus made there
    if (isBlank(getValues())) {
      move(pondAfter(codes, marks, current));
      return;
    }
    // A Draft from before (another day, another Operator) is never saved as a reading now unseen.
    if (!typedNow.current.has(current) && check !== current) {
      setCheck(current);
      settleUntil.current = performance.now() + SETTLE;
      return;
    }
    // A Pond with a reading in this Round: a correction, the same observation, so it replaces it and keeps its time.
    const corrected = marks[current];
    stamp.current = corrected?.at ?? past ?? localTime(new Date());
    setValue("replaces", corrected?.id ?? "");
    setValue("period", periodAt(stamp.current));
    saving.current = true;
    void card.onSubmit(e).finally(() => {
      saving.current = false;
    });
  };

  const open = React.useCallback(
    (code: string) => {
      if (saving.current) return; // the save finishes on its own Pond
      follow(top.current, code, true);
      flushSync(() => move(code)); // the inputs must exist for the focus, still in the tap
      setFocus("dissolvedOxygen");
    },
    [setFocus, move],
  );
  const notice = noticeShown(outbox);
  // `notice`: it sits above the rows, so they moved when it came or went.
  React.useEffect(() => {
    if (!showMore) follow(top.current, current, false);
  }, [current, showMore, notice]);
  const lift = () => {
    if (!showMore) follow(top.current, current, true);
  };

  const waiting = new Set([...outbox.mine, ...outbox.others].map((w) => w.record.id));
  // Only a Pond the bar has left changes here: read once per move, not on each of a Save's renders.
  const typed = React.useMemo(() => typedDrafts(codes.filter((c) => c !== current)), [codes, current]);
  const statusOf = (code: string): Status | null =>
    code in typed ? "typed" : !marks[code] ? null : waiting.has(marks[code].id) ? "waiting" : "saved";
  const lastStatus = statusOf(last);
  const done = codes.filter((c) => marks[c]).length;
  const mark = marks[current];
  const period = PERIODS.find((p) => p.value === periodAt(past ?? localTime(now)))?.label;
  const failure = card.result && !card.result.ok ? card.result : null;
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
                  <span className="truncate text-muted-foreground">Type to correct this reading</span>
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
              onSubmit={next}
              onInput={() => {
                settleUntil.current = 0;
                typedNow.current.add(current);
                setCheck("");
              }}
              className="flex flex-col gap-2"
            >
              <FieldGroup className="grid grid-cols-[4.5rem_1fr_1fr] items-end gap-2">
                {/* The largest thing here: it's checked against the number painted on the Pond. */}
                <div>
                  <div className="text-xs text-muted-foreground">Pond</div>
                  <div id="round-pond" className="text-4xl leading-12 font-semibold tabular-nums">
                    {pondNumber(current)}
                  </div>
                </div>
                {REQUIRED.map(({ name, label }) => (
                  <Field key={name} data-invalid={!!errors[name]}>
                    <FieldLabel htmlFor={`round-${name}`} className="text-xs">
                      {label}
                    </FieldLabel>
                    <Input
                      id={`round-${name}`}
                      // Faded past the 4.5:1 rule on purpose: its row shows the same reading at full strength.
                      className="h-12 text-xl tabular-nums placeholder:text-muted-foreground/70 md:text-xl"
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint={name === "temperature" ? "go" : "next"}
                      aria-invalid={!!errors[name]}
                      placeholder={mark?.[name]?.toString()} // the reading it has: type over it to correct it
                      readOnly={card.pending}
                      onClick={lift}
                      onKeyDown={(e) => {
                        if (name === "temperature" || e.key !== "Enter") return;
                        e.preventDefault();
                        setFocus("temperature");
                      }}
                      {...register(name)}
                    />
                  </Field>
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
                  disabled={card.pending}
                >
                  {empty ? "Skip" : "Save"}
                </Button>
              </div>
              {wrong.length > 0 && <FieldError errors={wrong} />}
              {check === current && (
                <Alert>
                  <Pencil />
                  <AlertTitle>Typed earlier, not saved</AlertTitle>
                  <AlertDescription>
                    Check these values, then tap Save again to keep them, or type over them.
                  </AlertDescription>
                </Alert>
              )}
              {failure && <ResultAlert result={failure} />}
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
                        readOnly={card.pending}
                        {...register(name)}
                      />
                    ))}
                  </FieldGroup>
                  <NotesField id="round-remarks" readOnly={card.pending} {...register("remarks")} />
                </FieldGroup>
              )}
            </form>
          ) : (
            <Alert>
              <CheckCircle2 />
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
            {period} · {past ? format(new Date(past), "d MMM, HH:mm") : format(now, "d MMM")}
          </CardDescription>
        </CardHeader>
        <div className={cn(COLUMNS, "px-3 pt-2 pb-1 text-xs text-muted-foreground")}>
          <span>Pond</span>
          <span>Oxygen</span>
          <span>Temp.</span>
        </div>
        {codes.map((pondCode) => {
          const reading = typed[pondCode] ?? marks[pondCode];
          return (
            <PondRow
              key={pondCode}
              pondCode={pondCode}
              isCurrent={pondCode === current}
              oxygen={String(reading?.dissolvedOxygen ?? "")}
              temperature={String(reading?.temperature ?? "")}
              status={statusOf(pondCode)}
              open={open}
            />
          );
        })}
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
