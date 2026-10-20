"use client";

import * as React from "react";
import { useForm, type DefaultValues, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { format, parse } from "date-fns";
import { AlertCircle, CheckCircle2, ChevronDownIcon } from "lucide-react";
import { saveRecord } from "@/lib/actions";
import { createDraft, draftKey, type Submitted } from "@/lib/draft";
import type { RECORD_KINDS, RecordKind } from "@/lib/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; msg: string } | null;
type Message = { message?: string } | undefined;

/** Recorded-at, held by the app shell for every record kind: local "YYYY-MM-DDTHH:mm", "" until set. */
export type RecordedAt = { value: string; clear: () => void };
/** What every record form gets from the app shell. */
export type RecordFormProps = { pondCode: string; recordedAt: RecordedAt };

const NOT_SAVED: Record<Exclude<Submitted, "saved">, string> = {
  noRecordedAt: "Set the date & time at the top before saving.",
  locked: "Sign in again. Your entry is kept as a draft.",
  failed: "Could not save. Your entry is kept as a draft; check your connection and try again.",
};

// Binds a record form to this pond's Draft (lib/draft.ts): restore it, keep every edit, submit; once
// saved, start the next record (recorded-at too, so it needs its own). `blank` must be module-level (stable).
export function useRecordForm<K extends RecordKind, TValues extends FieldValues, TRecord extends object>({
  kind,
  schema,
  blank,
  savedMessage,
  pondCode,
  recordedAt,
}: RecordFormProps & {
  kind: K;
  schema: z.ZodType<TRecord, TValues> & (typeof RECORD_KINDS)[K]["form"]; // must be this kind's form schema
  blank: (last?: TRecord) => TValues; // empty number fields are "": reset() with undefined leaves inputs filled
  savedMessage: (record: TRecord) => string;
}) {
  const [result, setResult] = React.useState<Result>(null);
  const form = useForm<TValues, unknown, TRecord>({
    resolver: zodResolver<TValues, unknown, TRecord>(schema),
    defaultValues: blank() as DefaultValues<TValues>,
  });
  const { reset, watch, handleSubmit, formState } = form;
  const draft = React.useMemo(
    () => createDraft<TValues>(draftKey(kind, pondCode), (record) => saveRecord(kind, { ...record, pondCode })),
    [kind, pondCode],
  );

  // Show this pond's draft on mount (tabs unmount inactive forms; the shell remounts forms per pond).
  React.useEffect(() => {
    draft.muted(() => reset({ ...blank(), ...draft.restore() } as TValues));
  }, [draft, reset, blank]);
  React.useEffect(() => {
    const sub = watch((values) => draft.change(values));
    return () => sub.unsubscribe();
  }, [draft, watch]);

  const onSubmit = handleSubmit(async (record) => {
    setResult(null);
    const outcome = await draft.submit(record, recordedAt.value);
    if (outcome !== "saved") {
      setResult({ ok: false, msg: NOT_SAVED[outcome] });
      return;
    }
    draft.muted(() => reset(blank(record)));
    recordedAt.clear();
    setResult({ ok: true, msg: savedMessage(record) });
  });

  return { form, card: { onSubmit, result, pending: formState.isSubmitting } };
}

export function RecordCard({
  id,
  title,
  description,
  saveLabel,
  onSubmit,
  result,
  pending,
  children,
}: {
  id: string;
  title: string;
  description: string;
  saveLabel: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  result: Result;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* noValidate: zod shows every error in the same place instead of native browser bubbles. */}
        <form id={id} noValidate onSubmit={onSubmit}>
          {/* Locked while saving: an edit made now would be wiped when the next record starts. */}
          <FieldSet disabled={pending}>
            <FieldGroup>{children}</FieldGroup>
          </FieldSet>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-4">
        {result ? (
          <Alert variant={result.ok ? "default" : "destructive"}>
            {result.ok ? <CheckCircle2 /> : <AlertCircle />}
            <AlertTitle>{result.ok ? "Saved" : "Not saved"}</AlertTitle>
            <AlertDescription>{result.msg}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" form={id} className="w-full" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {saveLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}

// shadcn's Date Picker "Time Picker" example: a Calendar in a Popover for the day, a time Input
// for the hour. Starts empty so the operator sets it for each record; setting either half fills
// the other with now (the calendar opens on today).
export function RecordedAtField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [day = "", time = ""] = value.split("T");
  const date = day ? parse(day, "yyyy-MM-dd", new Date()) : undefined;

  return (
    <FieldGroup className="flex-row">
      <Field>
        <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                id={`${id}-date`}
                data-empty={!date}
                className="justify-between font-normal data-[empty=true]:text-muted-foreground"
              />
            }
          >
            {date ? format(date, "PPP") : "Select date"}
            <ChevronDownIcon data-icon="inline-end" />
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              required
              className="[--cell-size:--spacing(11)]" // 44px days: the app's touch-target size
              selected={date}
              defaultMonth={date}
              onSelect={(d) => {
                onChange(`${format(d, "yyyy-MM-dd")}T${time || format(new Date(), "HH:mm")}`);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>
      <Field className="w-32">
        <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
        <Input
          type="time"
          id={`${id}-time`}
          value={time}
          onChange={(e) => onChange(`${day || format(new Date(), "yyyy-MM-dd")}T${e.target.value}`)}
          className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        />
      </Field>
    </FieldGroup>
  );
}

export function NumberField({
  id,
  label,
  hint,
  error,
  integer = false,
  ...input
}: React.ComponentProps<"input"> & { id: string; label: string; hint?: string; error?: Message; integer?: boolean }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        step={integer ? 1 : "any"}
        aria-invalid={!!error}
        {...input}
      />
      {error ? <FieldError errors={[error]} /> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

export function NotesField({
  id,
  label = "Remarks",
  ...textarea
}: React.ComponentProps<"textarea"> & { id: string; label?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} {...textarea} />
    </Field>
  );
}

// The chosen option gets a primary border and a light primary tint (lighter than the filled
// record-kind tab); the stock pressed state (bg-muted) is the same grey as hover and hard to see.
const SELECTED_CHOICE =
  "aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:hover:bg-primary/15 dark:aria-pressed:bg-primary/30 dark:aria-pressed:hover:bg-primary/40";

// Single-choice row of toggles, labelled per the shadcn Field + ToggleGroup pattern.
export function ChoiceField({
  id,
  label,
  options,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: Message;
  hint?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldTitle id={id}>{label}</FieldTitle>
      <ToggleGroup
        aria-labelledby={id}
        aria-invalid={!!error}
        variant="outline"
        className="w-full"
        value={value ? [value] : []}
        onValueChange={(v) => onChange(v[0])}
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className={cn("flex-1", SELECTED_CHOICE)}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {error ? <FieldError errors={[error]} /> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}
