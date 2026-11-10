"use client";

import * as React from "react";
import { Show, UserButton } from "@clerk/nextjs";
import { Info } from "lucide-react";
import { keepLeftApp, keepPaperAt, paperAfterAway, restorePaperAt, type PaperAt } from "@/lib/round";
import { readLocal, writeLocal } from "@/lib/storage";
import type { RecordKind } from "@/lib/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { FILLED_TAB, RecordedAtField, type RecordFormProps } from "./record-form";
import { WaterRound } from "./water-round";
import { FeedingForm, type Feed } from "./feeding-form";
import { FertiliserForm, type Fert } from "./fertiliser-form";
import { TreatmentForm, type Treatment } from "./treatment-form";
import { MortalityForm, type Species } from "./mortality-form";
import { SamplingForm } from "./sampling-form";

const POND_KEY = "pondcube:lastPond";
const RECORDED_AT_KEY = "pondcube:recordedAt"; // kept so a refresh mid-record doesn't lose it

// One tab per Record kind (lib/validation.ts RECORD_KINDS; the compiler flags a missing one), in tab order. Each form
// owns its fields and its kind's draft, and takes only its own list (Feeding `feeds`, …). Water is a Round.
type Lists = { feeds: Feed[]; ferts: Fert[]; treatments: Treatment[]; species: Species[] };
const FORMS = {
  feeding: { label: "Feeding", Form: FeedingForm },
  fertiliser: { label: "Fertiliser", Form: FertiliserForm },
  treatment: { label: "Treatment", Form: TreatmentForm },
  mortality: { label: "Mortality", Form: MortalityForm },
  sampling: { label: "Sampling", Form: SamplingForm },
} satisfies Record<Exclude<RecordKind, "wq">, { label: string; Form: React.ComponentType<RecordFormProps & Lists> }>;
const TABS = { wq: { label: "Water" }, ...FORMS } satisfies Record<RecordKind, { label: string }>;

export function Shell({ person, children }: { person?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6 md:max-w-2xl md:py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <PondCubeLogo />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">PondCube Collect</h1>
            {person && <p className="truncate text-xs text-muted-foreground">Recording as {person}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Show when="signed-in">
            <UserButton appearance={{ elements: { userButtonTrigger: "size-11" } }} />
          </Show>
        </div>
      </header>
      {children}
    </main>
  );
}

// Same footprint as the Water tab, so nothing jumps when data and saved choices arrive.
function TabsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-12.5 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-51 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

export function CollectionSkeleton() {
  return (
    <Shell>
      <TabsSkeleton />
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
  ferts,
  treatments,
  species,
  version,
}: {
  person: string;
  account: string;
  sites: string[];
  ponds: (Pond & { species: string[] })[];
  feeds: (Feed & { sites: string[] })[];
  ferts: (Fert & { sites: string[] })[];
  treatments: (Treatment & { sites: string[] })[];
  species: Species[];
  version: string;
}) {
  const [chosenPond, setPondCode] = React.useState("");
  // Only a pond on this Operator's list: a remembered one may since be retired, or at a Site they've left.
  const pond = ponds.find((p) => p.pondCode === chosenPond);
  const pondCode = pond?.pondCode ?? "";
  const site = pond?.site;
  const here = <T extends { sites: string[] }>(list: T[]) => list.filter((i) => site && i.sites.includes(site));
  // A Fertiliser or Treatment tab only for an Operator whose sites have that list (Penang has neither).
  const unlisted: Partial<Record<RecordKind, boolean>> = { fertiliser: !ferts.length, treatment: !treatments.length };
  const tabs = Object.entries(TABS).filter(([kind]) => !unlisted[kind as RecordKind]);
  const forms = Object.entries(FORMS).filter(([kind]) => !unlisted[kind as RecordKind]);
  const speciesHere = pond?.species.length ? species.filter((s) => pond.species.includes(s.species)) : species;
  const [recordedAt, setRecordedAt] = React.useState("");
  const [restored, setRestored] = React.useState(false);
  const [kind, setKind] = React.useState<RecordKind>("wq");
  const [paperAt, setPaperAt] = React.useState<PaperAt>(null);
  const outbox = useOutbox(account, person);
  React.useEffect(() => {
    let hiddenAt = Infinity;
    const onVisibility = () => {
      if (document.hidden) keepLeftApp((hiddenAt = Date.now()));
      else setPaperAt((p) => paperAfterAway(p, hiddenAt, new Date()));
    };
    const onLeave = () => keepLeftApp(Date.now()); // Safari may not say it's hidden when a page reloads
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  // Restore after hydration (server has no localStorage), so setState-in-effect is intended.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPondCode(readLocal(POND_KEY) ?? "");
    setRecordedAt(readLocal(RECORDED_AT_KEY) ?? "");
    setPaperAt(restorePaperAt(new Date()));
    setRestored(true);
  }, []);
  React.useEffect(() => {
    if (restored) keepPaperAt(paperAt);
  }, [paperAt, restored]);
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
    <Shell person={person}>
      {!restored ? (
        <TabsSkeleton />
      ) : (
        <Tabs value={kind} onValueChange={setKind}>
          {/* Six tabs don't fit a phone's width: they wrap. */}
          <TabsList className="w-full flex-wrap group-data-horizontal/tabs:h-auto">
            {tabs.map(([value, { label }]) => (
              <TabsTrigger key={value} value={value} className={FILLED_TAB}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="wq" className="flex flex-col gap-2">
            <FieldGroup className="gap-2 px-1">
              <Field orientation="horizontal" className="min-h-11 items-center">
                <FieldContent>
                  <FieldLabel htmlFor="typing-from-paper">Typing from paper</FieldLabel>
                </FieldContent>
                <Switch
                  id="typing-from-paper"
                  checked={paperAt !== null}
                  onCheckedChange={(on) => setPaperAt(on ? "" : null)}
                />
              </Field>
              {paperAt !== null && <RecordedAtField id="paper-at" value={paperAt} onChange={setPaperAt} />}
            </FieldGroup>
            <WaterRound ponds={ponds} paperAt={paperAt} outbox={outbox} onPond={choosePond} />
          </TabsContent>
          {forms.map(([value, { Form }]) => (
            <TabsContent key={value} value={value} className="flex flex-col gap-2">
              <Card>
                <CardContent>
                  <FieldGroup className="gap-4">
                    <Field>
                      <FieldLabel htmlFor="pond">Pond</FieldLabel>
                      <PondCombobox id="pond" ponds={ponds} value={pondCode} onChange={choosePond} />
                    </Field>
                    <RecordedAtField id="recorded-at" value={recordedAt} onChange={chooseRecordedAt} />
                  </FieldGroup>
                </CardContent>
              </Card>
              {pondCode ? (
                // Keyed by pond: switching ponds remounts the form with that pond's draft.
                <Form
                  key={pondCode}
                  pondCode={pondCode}
                  recordedAt={when}
                  outbox={outbox}
                  feeds={here(feeds)}
                  ferts={here(ferts)}
                  treatments={here(treatments)}
                  species={speciesHere}
                />
              ) : (
                <Alert>
                  <Info />
                  <AlertTitle>Pick a pond</AlertTitle>
                  <AlertDescription>Choose a pond above to start recording.</AlertDescription>
                </Alert>
              )}
              <OutboxAlert outbox={outbox} />
            </TabsContent>
          ))}
        </Tabs>
      )}
      <div className="flex flex-wrap justify-center">
        <DataSheet sites={sites} kinds={Object.fromEntries(tabs)} />
        <FeedbackSheet operator={person} version={version} />
      </div>
    </Shell>
  );
}
