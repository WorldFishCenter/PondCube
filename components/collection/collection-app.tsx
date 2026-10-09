"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { readLocal, writeLocal } from "@/lib/draft";
import type { RecordKind } from "@/lib/intake";
import type { WhoWhere } from "@/lib/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { PondCubeLogo } from "@/components/pondcube-logo";
import { PondCombobox, type Pond } from "./pond-combobox";
import { RecordedAtField, type RecordedAt } from "./record-form";
import { WaterQualityForm } from "./water-quality-form";
import { FeedingForm } from "./feeding-form";
import { MortalityForm } from "./mortality-form";
import { SamplingForm } from "./sampling-form";

// The person recording is the "enumerator" (schema term), labelled "Operator" in the UI.
const ENUMERATOR_KEY = "pondcube:operator"; // stored value predates the rename; keep it so devices keep their choice
const POND_KEY = "pondcube:lastPond";
const RECORDED_AT_KEY = "pondcube:recordedAt"; // kept so a refresh mid-record doesn't lose it

// The record kinds, in tab order. Each form owns its fields and its kind's draft; adding a kind is
// one entry here plus its form (and its table + schemas in lib/).
const RECORD_KINDS: {
  kind: RecordKind;
  label: string;
  Form: React.ComponentType<{ who: WhoWhere; recordedAt: RecordedAt }>;
}[] = [
  { kind: "wq", label: "Water", Form: WaterQualityForm },
  { kind: "feeding", label: "Feeding", Form: FeedingForm },
  { kind: "mortality", label: "Mortality", Form: MortalityForm },
  { kind: "sampling", label: "Sampling", Form: SamplingForm },
];

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
          <Badge variant="secondary">Penang HQ</Badge>
          <ThemeToggle />
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

export function CollectionApp({ operators, ponds }: { operators: { name: string }[]; ponds: Pond[] }) {
  const [enumerator, setEnumerator] = React.useState("");
  const [pondCode, setPondCode] = React.useState("");
  const [recordedAt, setRecordedAt] = React.useState("");
  const [restored, setRestored] = React.useState(false);
  // Base UI Select: the null item is the placeholder.
  const operatorItems = [
    { value: null, label: "Select your name" },
    ...operators.map((o) => ({ value: o.name, label: o.name })),
  ];
  const who = { pondCode, enumerator };

  // Restore after hydration (server has no localStorage), so setState-in-effect is intended.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnumerator(readLocal(ENUMERATOR_KEY) ?? "");
    setPondCode(readLocal(POND_KEY) ?? "");
    setRecordedAt(readLocal(RECORDED_AT_KEY) ?? "");
    setRestored(true);
  }, []);
  const chooseEnumerator = (name: string) => {
    setEnumerator(name);
    writeLocal(ENUMERATOR_KEY, name);
  };
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
            Operator and pond are remembered on this device. Set the date &amp; time for each record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="operator">Operator</FieldLabel>
              <Select items={operatorItems} value={enumerator || null} onValueChange={(v) => chooseEnumerator(v ?? "")}>
                <SelectTrigger id="operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {operatorItems.map((o) => (
                      <SelectItem key={o.value ?? "none"} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="pond">Pond / tank</FieldLabel>
              <PondCombobox id="pond" ponds={ponds} value={pondCode} onChange={choosePond} />
            </Field>
            <div className="md:col-span-2">
              <RecordedAtField id="recorded-at" value={recordedAt} onChange={chooseRecordedAt} />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {!restored ? (
        <>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </>
      ) : !(enumerator && pondCode) ? (
        <Alert>
          <Info />
          <AlertTitle>Pick operator and pond</AlertTitle>
          <AlertDescription>Choose your name and a pond above to start recording.</AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue={RECORD_KINDS[0].kind}>
          <TabsList className="w-full">
            {RECORD_KINDS.map(({ kind, label }) => (
              <TabsTrigger key={kind} value={kind} className={FILLED_TAB}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {RECORD_KINDS.map(({ kind, Form }) => (
            // Keyed by pond: switching ponds remounts the form with that pond's draft.
            <TabsContent key={kind} value={kind}>
              <Form key={pondCode} who={who} recordedAt={when} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </Shell>
  );
}
