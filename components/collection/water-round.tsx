"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useWatch } from "react-hook-form";
import { format } from "date-fns";
import { Check, ChevronDownIcon, CloudUpload, Info, Pencil } from "lucide-react";
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
import { RANGES, waterQualityForm } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { records, type Outbox } from "./outbox";
import type { Pond } from "./pond-combobox";
import { Choice, NotesField, NumberField, ResultAlert, useRecordForm } from "./record-form";

const AREA_KEY = "pondcube:lastArea";
const SETTLE = 1000; // ms a Pond shows before an untyped Next works: a tap before its number is read mustn't skip it
const COLUMNS = "grid grid-cols-[3.5rem_1fr_1fr_4.5rem] gap-2";

const REQUIRED = [
  { name: "dissolvedOxygen", label: "Dissolved oxygen (mg/L)" },
  { name: "temperature", label: "Temperature (°C)" },
] as const;
// In the order of the old log.
const OPTIONAL = [
  { name: "ph", label: "pH", hint: `${RANGES.ph.join("–")}, optional` },
  { name: "ammonia", label: "Ammonia", hint: "mg/L, optional" },
  { name: "nitrate", label: "Nitrate", hint: "mg/L, optional" },
  { name: "nitrite", label: "Nitrite", hint: "mg/L, optional" },
] as const;
const MORE = [...OPTIONAL.map((o) => o.name), "remarks"] as const;

const blank = () => ({
  period: "morning" as (typeof PERIODS)[number]["value"], // set from Recorded-at on each Next
  dissolvedOxygen: "",
  temperature: "",
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  remarks: "",
  replaces: "", // set on each Next
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
  if (!area)
    return (
      <Alert>
        <Info />
        <AlertTitle>No ponds</AlertTitle>
        <AlertDescription>There are no ponds on your list yet. Ask your supervisor.</AlertDescription>
      </Alert>
    );
  // Not set yet, or its time was cleared.
  if (past !== null && Number.isNaN(Date.parse(past)))
    return (
      <Alert>
        <Info />
        <AlertTitle>Set the date &amp; time</AlertTitle>
        <AlertDescription>Above, choose when you took the readings you wrote down.</AlertDescription>
      </Alert>
    );
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
  const [check, setCheck] = React.useState(""); // the Pond whose values were typed earlier: Next once more saves them
  const settleUntil = React.useRef(0); // performance.now(), which a change of the device clock can't stall
  const typedNow = React.useRef(new Set<string>()); // Ponds typed at since this Round opened on screen
  const saving = React.useRef(false);
  const top = React.useRef<HTMLDivElement>(null);
  const stamp = React.useRef(""); // set at each Next: a Round lasts over an hour, and each reading keeps its own time
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
  const typedMore = useWatch({ control, name: MORE }).some((v) => String(v ?? "").trim());
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
    if (isBlank(getValues()) && !e.currentTarget.matches(":invalid")) {
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
  React.useEffect(() => {
    if (!showMore) follow(top.current, current, false);
  }, [current, showMore]);
  const lift = () => {
    if (!showMore) follow(top.current, current, true);
  };

  const waiting = new Set([...outbox.mine, ...outbox.others].map((w) => w.record.id));
  // Only a Pond the bar has left changes here: read once per move, not on each of a Next's renders.
  const typed = React.useMemo(() => typedDrafts(codes.filter((c) => c !== current)), [codes, current]);
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
          <div className="flex flex-wrap items-center gap-2">
            <FieldLabel htmlFor="round-area" className="sr-only">
              Area
            </FieldLabel>
            <Choice id="round-area" items={areas} value={area.value} onChange={(v) => v && chooseArea(v)} />
            <Badge variant="secondary">{period}</Badge>
            <Badge variant="outline">{past ? format(new Date(past), "d MMM, HH:mm") : format(now, "d MMM")}</Badge>
          </div>
          {/* Its own line, so the bar doesn't change height when something starts waiting: Next must stay put. */}
          <p className="text-xs text-muted-foreground tabular-nums">
            {done} of {list.length}
            {waiting.size > 0 && ` · ${records(waiting.size)} waiting to send`}
          </p>
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
              <div className={cn(COLUMNS, "items-end")}>
                <div>
                  <div className="text-xs text-muted-foreground">Pond</div>
                  <div id="round-pond" className="text-2xl font-semibold tabular-nums">
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
                      type="number"
                      inputMode="decimal"
                      step="any"
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
                <Button type="submit" onMouseDown={keepFocus} disabled={card.pending}>
                  Next
                </Button>
              </div>
              {wrong.length > 0 && <FieldError errors={wrong} />}
              {check === current && (
                <Alert>
                  <Info />
                  <AlertTitle>Typed earlier, not saved</AlertTitle>
                  <AlertDescription>
                    Check these values, then tap Next again to save them, or type over them.
                  </AlertDescription>
                </Alert>
              )}
              {failure && <ResultAlert result={failure} />}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                aria-expanded={showMore}
                onClick={() => setMoreFor((was) => (was === current ? "" : current))}
              >
                <ChevronDownIcon data-icon="inline-start" className={cn(showMore && "rotate-180")} />
                More readings
              </Button>
              {showMore && (
                <FieldGroup>
                  <FieldGroup className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {OPTIONAL.map(({ name, label, hint }) => (
                      <NumberField
                        key={name}
                        id={`round-${name}`}
                        label={label}
                        hint={hint}
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
              <Check />
              <AlertTitle>End of {area.label}</AlertTitle>
              <AlertDescription>
                {done} of {list.length} ponds have a reading in this round. Tap a pond to add or correct one, or pick
                another area above.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <Card size="sm" className="gap-0 py-0">
        {codes.map((pondCode) => {
          const isTyped = pondCode in typed;
          const reading = isTyped ? typed[pondCode] : marks[pondCode];
          return (
            <PondRow
              key={pondCode}
              pondCode={pondCode}
              isCurrent={pondCode === current}
              oxygen={String(reading?.dissolvedOxygen ?? "")}
              temperature={String(reading?.temperature ?? "")}
              status={
                isTyped ? "typed" : !marks[pondCode] ? "none" : waiting.has(marks[pondCode].id) ? "waiting" : "saved"
              }
              open={open}
            />
          );
        })}
      </Card>
    </div>
  );
}

// The list follows the bar once it's at the top; only a tap other than Next (`lift`) takes it there.
function follow(bar: HTMLElement | null, pondCode: string, lift: boolean) {
  const barTop = bar?.getBoundingClientRect().top;
  const row = document.getElementById(`round-${pondCode}`)?.getBoundingClientRect();
  if (barTop === undefined || !row || (barTop > 1 && !lift)) return;
  window.scrollTo({ top: window.scrollY + Math.max(barTop, row.top + row.height / 2 - window.innerHeight / 2) });
}

const STATUS = {
  none: null,
  typed: { Icon: Pencil, label: "Typed, not saved: tap to finish" },
  waiting: { Icon: CloudUpload, label: "Saved on this device, waiting to send" },
  saved: { Icon: Check, label: "Saved" },
};

// Memo: an Area can have 120 rows, and each Next changes two of them.
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
  status: keyof typeof STATUS;
  open: (code: string) => void;
}) {
  const shown = STATUS[status];
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
        "h-auto w-full items-center justify-items-start rounded-none px-3 font-normal tabular-nums",
      )}
    >
      <span className="font-medium">{pondNumber(pondCode)}</span>
      <span>{oxygen}</span>
      <span>{temperature}</span>
      {shown && (
        <span className="justify-self-end text-muted-foreground" title={shown.label}>
          <shown.Icon aria-label={shown.label} />
        </span>
      )}
    </Button>
  );
});
