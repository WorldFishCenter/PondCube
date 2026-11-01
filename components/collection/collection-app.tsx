"use client";

import * as React from "react";
import { Show, UserButton } from "@clerk/nextjs";
import { Info } from "lucide-react";
import { readLocal, writeLocal } from "@/lib/storage";
import type { RecordKind } from "@/lib/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { PondCubeLogo } from "@/components/pondcube-logo";
import { useKeepForOffline } from "@/components/service-worker";
import { DataSheet } from "./data-sheet";
import { FeedbackSheet } from "./feedback-sheet";
import { OutboxAlert, useOutbox } from "./outbox";
import { PondCombobox, type Pond } from "./pond-combobox";
import { RecordedAtField, type RecordFormProps } from "./record-form";
import { WaterRound } from "./water-round";
import { FeedingForm, type Feed } from "./feeding-form";
import { MortalityForm } from "./mortality-form";
import { SamplingForm } from "./sampling-form";

const POND_KEY = "pondcube:lastPond";
const RECORDED_AT_KEY = "pondcube:recordedAt"; // kept so a refresh mid-record doesn't lose it
const AWAY = 30 * 60_000; // ms away from the app after which Past readings' time is cleared

// One tab per Record kind (lib/validation.ts RECORD_KINDS; the compiler flags a missing one), in tab
// order. Each form owns its fields and its kind's draft; only the Feeding form uses `feeds`. Water is a Round: no Form.
const TABS = {
  wq: { label: "Water" },
  feeding: { label: "Feeding", Form: FeedingForm },
  mortality: { label: "Mortality", Form: MortalityForm },
  sampling: { label: "Sampling", Form: SamplingForm },
} satisfies Record<RecordKind, { label: string; Form?: React.ComponentType<RecordFormProps & { feeds: Feed[] }> }>;

// The selected record kind is filled with the primary colour. Stock Tabs has no filled variant,
// so this is shadcn's className step with semantic tokens; the dark: ones beat the stock dark style.
const FILLED_TAB =
  "data-active:bg-primary data-active:text-primary-foreground data-active:hover:text-primary-foreground dark:data-active:border-transparent dark:data-active:bg-primary dark:data-active:text-primary-foreground";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6 md:max-w-2xl md:py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <PondCubeLogo />
          PondCube Collect
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>
      {children}
    </main>
  );
}

// Same footprint as the loaded app, so nothing jumps when data and saved choices arrive.
export function CollectionSkeleton() {
  return (
    <Shell>
      <Skeleton className="h-56 w-full rounded-xl md:h-40" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </Shell>
  );
}

// The Person (schema term) is the signed-in Operator who records, matched on the server.
export function CollectionApp({
  person,
  account,
  sites,
  ponds,
  feeds,
  version,
}: {
  person: string;
  account: string;
  sites: string[];
  ponds: Pond[];
  feeds: (Feed & { sites: string[] })[];
  version: string;
}) {
  const [chosenPond, setPondCode] = React.useState("");
  // Only a pond on this Operator's list: a remembered one may since be retired, or another Operator's.
  const pond = ponds.find((p) => p.pondCode === chosenPond);
  const pondCode = pond?.pondCode ?? "";
  const site = pond?.site;
  const feedsHere = feeds.filter((f) => site && f.sites.includes(site)); // the chosen pond's site's feeds
  const [recordedAt, setRecordedAt] = React.useState("");
  const [restored, setRestored] = React.useState(false);
  const [kind, setKind] = React.useState<RecordKind>("wq");
  // A Round's Past readings: null is off; "" is on with no time, so a later Round can't inherit an old one.
  const [past, setPast] = React.useState<string | null>(null);
  const outbox = useOutbox(account, person);
  React.useEffect(() => {
    let hiddenAt = Infinity;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (Date.now() - hiddenAt > AWAY) setPast((p) => (p === null ? p : ""));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Restore after hydration (server has no localStorage), so setState-in-effect is intended.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPondCode(readLocal(POND_KEY) ?? "");
    setRecordedAt(readLocal(RECORDED_AT_KEY) ?? "");
    setRestored(true);
  }, []);
  useKeepForOffline(); // the page that opens with no signal is this one, signed in
  const choosePond = React.useCallback((code: string) => {
    setPondCode(code);
    writeLocal(POND_KEY, code);
  }, []);
  // Empty until the operator sets it; a successful save clears it, so each record gets its own.
  const chooseRecordedAt = (value: string) => {
    setRecordedAt(value);
    writeLocal(RECORDED_AT_KEY, value);
  };
  const when = { value: recordedAt, clear: () => chooseRecordedAt("") };

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle>Who, where &amp; when</CardTitle>
          <CardDescription>
            You&apos;re recording as the signed-in operator.{" "}
            {kind === "wq"
              ? "Each reading takes the time you tap Next."
              : "The pond is remembered on this device. Set the date & time for each record."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="operator">Person</FieldLabel>
              <Input id="operator" value={person} readOnly />
            </Field>
            {kind === "wq" ? (
              <>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="past-readings">Typing from paper</FieldLabel>
                    <FieldDescription>
                      Turn on to type in readings you wrote down earlier. Set when you took them, and every reading gets
                      that time.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="past-readings"
                    checked={past !== null}
                    onCheckedChange={(on) => setPast(on ? "" : null)}
                  />
                </Field>
                {past !== null && (
                  <div className="md:col-span-2">
                    <RecordedAtField id="past-at" value={past} onChange={setPast} />
                  </div>
                )}
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="pond">Pond</FieldLabel>
                  <PondCombobox id="pond" ponds={ponds} value={pondCode} onChange={choosePond} />
                </Field>
                <div className="md:col-span-2">
                  <RecordedAtField id="recorded-at" value={recordedAt} onChange={chooseRecordedAt} />
                </div>
              </>
            )}
            <OutboxAlert outbox={outbox} className="md:col-span-2" />
          </FieldGroup>
        </CardContent>
      </Card>

      {!restored ? (
        <>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </>
      ) : (
        <Tabs value={kind} onValueChange={setKind}>
          <TabsList className="w-full">
            {Object.entries(TABS).map(([value, { label }]) => (
              <TabsTrigger key={value} value={value} className={FILLED_TAB}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(TABS).map(([value, tab]) => (
            <TabsContent key={value} value={value}>
              {!("Form" in tab) ? (
                <WaterRound ponds={ponds} past={past} outbox={outbox} onPond={choosePond} />
              ) : pondCode ? (
                // Keyed by pond: switching ponds remounts the form with that pond's draft.
                <tab.Form key={pondCode} pondCode={pondCode} recordedAt={when} outbox={outbox} feeds={feedsHere} />
              ) : (
                <Alert>
                  <Info />
                  <AlertTitle>Pick a pond</AlertTitle>
                  <AlertDescription>Choose a pond above to start recording.</AlertDescription>
                </Alert>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
      <div className="flex flex-wrap justify-center">
        <DataSheet sites={sites} kinds={TABS} />
        <FeedbackSheet operator={person} version={version} />
      </div>
    </Shell>
  );
}
