"use client";

import * as React from "react";
import { useForm, type DefaultValues, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { format, parse } from "date-fns";
import { AlertCircle, CheckCircle2, ChevronDownIcon } from "lucide-react";
import { createDraft, type Submitted } from "@/lib/draft";
import type { RECORD_KINDS, RecordKind } from "@/lib/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Outbox } from "./outbox";

type Result = { ok: boolean; title: string; msg: string } | null;
type Message = { message?: string } | undefined;

/** Recorded-at: local "YYYY-MM-DDTHH:mm", "" until set. `clear` runs after a save, where each Record sets its own. */
export type RecordedAt = { value: string; clear?: () => void };
/** What every record form gets from the app shell. */
export type RecordFormProps = { pondCode: string; recordedAt: RecordedAt; outbox: Outbox };

type Submission = { id: string; msg: string } | Exclude<Submitted, "kept"> | null;
const NOT_SAVED: Record<Exclude<Submitted, "kept">, string> = {
  noRecordedAt: "Set the date & time at the top before saving.",
  futureRecordedAt: "The date & time at the top is later than now: correct it before saving.",
  notKept:
    "This device has no room to keep it and it couldn't be sent. Your entry is still here: try again with signal.",
};

// A record form on this pond's Draft (lib/draft.ts); Save hands it to the Outbox. `blank` must be module-level.
export function useRecordForm<K extends RecordKind, TValues extends FieldValues, TRecord extends { id: string }>({
  kind,
  schema,
  blank,
  savedMessage,
  pondCode,
  recordedAt,
  outbox,
  onSaved,
}: RecordFormProps & {
  kind: K;
  schema: z.ZodType<TRecord, TValues> & (typeof RECORD_KINDS)[K]["form"]; // must be this kind's form schema
  blank: (last?: TRecord) => TValues; // empty number fields are "": reset() with undefined leaves inputs filled
  savedMessage: (record: TRecord) => string;
  onSaved?: (record: TRecord) => void;
}) {
  const [submitted, setSubmitted] = React.useState<Submission>(null);
  const form = useForm<TValues, unknown, TRecord>({
    resolver: zodResolver<TValues, unknown, TRecord>(schema),
    defaultValues: blank() as DefaultValues<TValues>,
  });
  const { reset, watch, handleSubmit, formState } = form;
  const { add } = outbox; // stable across renders, unlike the outbox object
  const draft = React.useMemo(
    () => createDraft<TValues, TRecord>(kind, pondCode, (record) => add(kind, { ...record, pondCode })),
    [kind, pondCode, add],
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
    setSubmitted(null);
    const outcome = await draft.submit(record, recordedAt.value);
    if (outcome !== "kept") {
      setSubmitted(outcome);
      return;
    }
    draft.muted(() => reset(blank(record)));
    recordedAt.clear?.();
    setSubmitted({ id: record.id, msg: savedMessage(record) });
    onSaved?.(record);
  });
  const clearResult = React.useCallback(() => setSubmitted(null), []);

  const result = resultOf(submitted, outbox);
  return { form, card: { onSubmit, result, pending: formState.isSubmitting }, clearResult };
}

// The form's message follows the Record until the server has it.
function resultOf(submitted: Submission, { isWaiting, sending }: Outbox): Result {
  if (!submitted) return null;
  if (typeof submitted === "string") return { ok: false, title: "Not saved", msg: NOT_SAVED[submitted] };
  if (!isWaiting(submitted.id)) return { ok: true, title: "Saved", msg: submitted.msg };
  const next = sending ? "Sending…" : "It will be sent when there's signal.";
  return { ok: true, title: "Saved on this device", msg: `${submitted.msg} ${next}` };
}

export function ResultAlert({ result }: { result: NonNullable<Result> }) {
  return (
    <Alert variant={result.ok ? "default" : "destructive"}>
      {result.ok ? <CheckCircle2 /> : <AlertCircle />}
      <AlertTitle>{result.title}</AlertTitle>
      <AlertDescription>{result.msg}</AlertDescription>
    </Alert>
  );
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
        {result ? <ResultAlert result={result} /> : null}
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
              disabled={{ after: new Date() }}
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

// An optional pick from a list, per Base UI Select: the null item is the placeholder and clears the choice.
export function SelectField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Choice
        id={id}
        items={[{ value: null, label: placeholder }, ...options]}
        value={value ?? null}
        onChange={(v) => onChange(v ?? undefined)}
      />
      <FieldDescription>Optional.</FieldDescription>
    </Field>
  );
}

// A pick from a list, per Base UI Select.
export function Choice({
  id,
  items,
  value,
  onChange,
}: {
  id: string;
  items: readonly { value: string | null; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Select items={items} value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value ?? "none"} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
