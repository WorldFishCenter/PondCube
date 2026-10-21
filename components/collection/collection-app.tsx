"use client";

import * as React from "react";
import { Show, UserButton } from "@clerk/nextjs";
import { Info } from "lucide-react";
import { readLocal, writeLocal } from "@/lib/storage";
import type { RecordKind } from "@/lib/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { PondCubeLogo } from "@/components/pondcube-logo";
import { useKeepForOffline } from "@/components/service-worker";
import { FeedbackSheet } from "./feedback-sheet";
import { OutboxAlert, useOutbox } from "./outbox";
import { PondCombobox, type Pond } from "./pond-combobox";
import { RecordedAtField, type RecordFormProps } from "./record-form";
import { WaterQualityForm } from "./water-quality-form";
import { FeedingForm } from "./feeding-form";
import { MortalityForm } from "./mortality-form";
import { SamplingForm } from "./sampling-form";

const POND_KEY = "pondcube:lastPond";
const RECORDED_AT_KEY = "pondcube:recordedAt"; // kept so a refresh mid-record doesn't lose it

// One tab per Record kind (lib/validation.ts RECORD_KINDS; the compiler flags a missing one), in tab
// order. Each form owns its fields and its kind's draft.
const TABS = {
  wq: { label: "Water", Form: WaterQualityForm },
  feeding: { label: "Feeding", Form: FeedingForm },
  mortality: { label: "Mortality", Form: MortalityForm },
  sampling: { label: "Sampling", Form: SamplingForm },
} satisfies Record<RecordKind, { label: string; Form: React.ComponentType<RecordFormProps> }>;

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

// The person recording is the "enumerator" (schema term): the signed-in Operator, matched on the server.
export function CollectionApp({
  enumerator,
  account,
  ponds,
  version,
}: {
  enumerator: string;
  account: string;
  ponds: Pond[];
  version: string;
}) {
  const [pondCode, setPondCode] = React.useState("");
  const [recordedAt, setRecordedAt] = React.useState("");
  const [restored, setRestored] = React.useState(false);
  const outbox = useOutbox(account, enumerator);

  // Restore after hydration (server has no localStorage), so setState-in-effect is intended.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPondCode(readLocal(POND_KEY) ?? "");
    setRecordedAt(readLocal(RECORDED_AT_KEY) ?? "");
    setRestored(true);
  }, []);
  useKeepForOffline(); // the page that opens with no signal is this one, signed in
  const choosePond = (code: string) => {
    setPondCode(code);
    writeLocal(POND_KEY, code);
  };
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
            You&apos;re recording as the signed-in operator. The pond is remembered on this device. Set the date &amp;
            time for each record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="operator">Operator</FieldLabel>
              <Input id="operator" value={enumerator} readOnly />
            </Field>
            <Field>
              <FieldLabel htmlFor="pond">Pond / tank</FieldLabel>
              <PondCombobox id="pond" ponds={ponds} value={pondCode} onChange={choosePond} />
            </Field>
            <div className="md:col-span-2">
              <RecordedAtField id="recorded-at" value={recordedAt} onChange={chooseRecordedAt} />
            </div>
            <OutboxAlert outbox={outbox} className="md:col-span-2" />
          </FieldGroup>
        </CardContent>
      </Card>

      {!restored ? (
        <>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </>
      ) : !pondCode ? (
        <Alert>
          <Info />
          <AlertTitle>Pick a pond</AlertTitle>
          <AlertDescription>Choose a pond above to start recording.</AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue={Object.keys(TABS)[0]}>
          <TabsList className="w-full">
            {Object.entries(TABS).map(([kind, { label }]) => (
              <TabsTrigger key={kind} value={kind} className={FILLED_TAB}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(TABS).map(([kind, { Form }]) => (
            // Keyed by pond: switching ponds remounts the form with that pond's draft.
            <TabsContent key={kind} value={kind}>
              <Form key={pondCode} pondCode={pondCode} recordedAt={when} outbox={outbox} />
            </TabsContent>
          ))}
        </Tabs>
      )}
      <FeedbackSheet operator={enumerator} version={version} />
    </Shell>
  );
}
