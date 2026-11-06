"use client";

import * as React from "react";
import { useForm, type DefaultValues, type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { format, parse } from "date-fns";
import { CheckCircle2, ChevronDownIcon, CloudUpload, Pencil, type LucideIcon } from "lucide-react";
import { createDraft, type Draft, type NotSaved } from "@/lib/draft";
import type { RECORD_KINDS, RecordKind } from "@/lib/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Outbox } from "./outbox";

type Result = { ok: boolean; word: string; msg: string; Icon: LucideIcon } | null;
type Message = { message?: string } | undefined;

// The selected tab is filled with the primary colour. Stock Tabs has no filled variant,
// so this is shadcn's className step with semantic tokens; the dark: ones beat the stock dark style.
export const FILLED_TAB =
  "data-active:bg-primary data-active:text-primary-foreground data-active:hover:text-primary-foreground dark:data-active:border-transparent dark:data-active:bg-primary dark:data-active:text-primary-foreground";

// Where a Record is: one word, icon and colour each, wherever it's shown.
export const STATUS = {
  typed: { Icon: Pencil, word: "Not saved", variant: "destructive" },
  waiting: { Icon: CloudUpload, word: "Waiting", variant: "secondary" },
  saved: { Icon: CheckCircle2, word: "Saved", variant: "default" },
} as const;
export type Status = keyof typeof STATUS;

export function StatusBadge({
  status,
  className,
  children = STATUS[status].word,
}: {
  status: Status;
  className?: string;
  children?: React.ReactNode;
}) {
  const { Icon, variant } = STATUS[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon data-icon="inline-start" />
      {children}
    </Badge>
  );
}

/** Recorded-at: local "YYYY-MM-DDTHH:mm", "" until set. `clear` runs after a save: each Record sets its own. */
export type RecordedAt = { value: string; clear: () => void };
/** What every record form gets from the app shell. */
export type RecordFormProps = { pondCode: string; recordedAt: RecordedAt; outbox: Outbox };

type Submission = { id: string; msg: string } | NotSaved | null;
const NOT_SAVED: Record<NotSaved, string> = {
  noRecordedAt: "Set the date & time at the top before saving.",
  futureRecordedAt: "The date & time at the top is later than now: correct it before saving.",
  notKept:
    "This device has no room to keep it and it couldn't be sent. Your entry is still here: try again with signal.",
};

// A form on a Draft: shows it on mount and on a change of Draft (tabs unmount inactive forms; a Round's form stays), and
// keeps each edit in it. `blank` must be module-level.
export function useDraftForm<TValues extends FieldValues, TRecord = TValues>(
  draft: Pick<Draft, "restore" | "change" | "muted">,
  blank: () => TValues, // empty number fields are "": reset() with undefined leaves inputs filled
  resolver?: Resolver<TValues, unknown, TRecord>,
) {
  const form = useForm<TValues, unknown, TRecord>({ resolver, defaultValues: blank() as DefaultValues<TValues> });
  const { reset, watch } = form;
  React.useEffect(() => {
    draft.muted(() => reset({ ...blank(), ...draft.restore() } as TValues));
  }, [draft, reset, blank]);
  React.useEffect(() => {
    const sub = watch((values) => draft.change(values));
    return () => sub.unsubscribe();
  }, [draft, watch]);
  return form;
}

// A record form on this pond's Draft (lib/draft.ts); Save hands it to the Outbox. `blank` must be module-level.
export function useRecordForm<K extends RecordKind, TValues extends FieldValues, TRecord extends { id: string }>({
  kind,
  schema,
  blank,
  savedMessage,
  pondCode,
  recordedAt,
  outbox,
}: RecordFormProps & {
  kind: K;
  schema: z.ZodType<TRecord, TValues> & (typeof RECORD_KINDS)[K]["form"]; // must be this kind's form schema
  blank: (last?: TRecord) => TValues;
  savedMessage: (record: TRecord) => string;
}) {
  const [submitted, setSubmitted] = React.useState<Submission>(null);
  const { add } = outbox; // stable across renders, unlike the outbox object
  const draft = React.useMemo(
    () => createDraft<TValues, TRecord>(kind, pondCode, (record) => add(kind, { ...record, pondCode })),
    [kind, pondCode, add],
  );
  const form = useDraftForm(draft, blank, zodResolver<TValues, unknown, TRecord>(schema));
  const { reset, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (parsed) => {
    setSubmitted(null);
    const record = await draft.submit(parsed, recordedAt.value);
    if (typeof record === "string") {
      setSubmitted(record);
      return;
    }
    draft.muted(() => reset(blank(record)));
    recordedAt.clear();
    setSubmitted({ id: record.id, msg: savedMessage(record) });
  });

  const result = resultOf(submitted, outbox);
  return { form, card: { onSubmit, result, pending: formState.isSubmitting } };
}

/** The message when a Record couldn't be saved; what's typed stays. */
export const notSaved = (outcome: NotSaved): NonNullable<Result> => ({
  ok: false,
  ...STATUS.typed,
  msg: NOT_SAVED[outcome],
});

// The form's message follows the Record until the server has it.
function resultOf(submitted: Submission, { isWaiting, sending }: Outbox): Result {
  if (!submitted) return null;
  if (typeof submitted === "string") return notSaved(submitted);
  if (!isWaiting(submitted.id)) return { ok: true, ...STATUS.saved, msg: submitted.msg };
  const next = sending ? "Sending…" : "Kept on this device until there's signal.";
  return { ok: true, ...STATUS.waiting, word: `${STATUS.waiting.word} to send`, msg: `${submitted.msg} ${next}` };
}

export function ResultAlert({ result }: { result: NonNullable<Result> }) {
  return (
    <Alert variant={result.ok ? "default" : "destructive"}>
      <result.Icon />
      <AlertTitle>{result.word}</AlertTitle>
      <AlertDescription>{result.msg}</AlertDescription>
    </Alert>
  );
}

export function RecordCard({
  id,
  saveLabel,
  onSubmit,
  result,
  pending,
  children,
}: {
  id: string;
  saveLabel: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  result: Result;
  pending: boolean;
  children: React.ReactNode;
}) {
  const message = React.useRef<HTMLDivElement>(null);
  const hasResult = !!result;
  // Off screen below Save, a tap would seem to do nothing.
  React.useEffect(() => {
    if (hasResult) message.current?.scrollIntoView({ block: "nearest" });
  }, [hasResult]);
  return (
    <Card>
      <CardContent>
        {/* noValidate: zod shows every error in the same place instead of native browser bubbles. */}
        <form id={id} noValidate onSubmit={onSubmit}>
          {/* Locked while saving: an edit made now would be wiped when the next record starts. */}
          <FieldSet disabled={pending}>
            <FieldGroup>{children}</FieldGroup>
          </FieldSet>
        </form>
      </CardContent>
      {/* The message below Save, so Save doesn't move when it comes. */}
      <CardFooter className="flex-col gap-4">
        <Button type="submit" form={id} className="w-full" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {saveLabel}
        </Button>
        {result ? (
          <div ref={message} className="w-full">
            <ResultAlert result={result} />
          </div>
        ) : null}
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
            {date ? format(date, "PPP") : "Select a date"}
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
  hideError = false,
  integer = false,
  ...input
}: React.ComponentProps<"input"> & {
  id: string;
  label: string;
  hint?: string;
  error?: Message;
  hideError?: boolean; // the caller shows it elsewhere
  integer?: boolean;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {/* Text with a number keypad, not type="number": browsers read that per device ("1,500" as 1.5, or as nothing). */}
      <Input id={id} inputMode={integer ? "numeric" : "decimal"} autoComplete="off" aria-invalid={!!error} {...input} />
      {error && !hideError ? (
        <FieldError errors={[error]} />
      ) : hint ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : null}
    </Field>
  );
}

export function NotesField({ id, ...textarea }: React.ComponentProps<"textarea"> & { id: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Remarks</FieldLabel>
      <Textarea id={id} {...textarea} />
      <FieldDescription>Optional.</FieldDescription>
    </Field>
  );
}

// A pick from a list, per Base UI Select: the null item is the placeholder and clears the choice.
export function SelectField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  required = false,
  error,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  required?: boolean;
  error?: Message;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Choice
        id={id}
        items={[{ value: null, label: placeholder }, ...options]}
        value={value || null}
        onChange={(v) => onChange(v ?? undefined)}
        invalid={!!error}
      />
      {error ? <FieldError errors={[error]} /> : required ? null : <FieldDescription>Optional.</FieldDescription>}
    </Field>
  );
}

// A pick from a list, per Base UI Select.
export function Choice({
  id,
  items,
  value,
  onChange,
  invalid = false,
}: {
  id: string;
  items: readonly { value: string | null; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  invalid?: boolean;
}) {
  return (
    <Select items={items} value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid}>
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
