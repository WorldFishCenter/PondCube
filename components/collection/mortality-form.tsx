"use client";

import { Controller } from "react-hook-form";
import { mortalityForm } from "@/lib/validation";
import { CAUSES } from "@/lib/options";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NotesField, NumberField, RecordCard, type RecordFormProps, useRecordForm } from "./record-form";

// Base UI Select: the null item is the placeholder (and lets the operator clear the choice).
const CAUSE_ITEMS = [{ value: null, label: "Select a cause" }, ...CAUSES];

const blank = () => ({ mortalityCount: "", suspectedCause: undefined, remarks: "" });

export function MortalityForm(props: RecordFormProps) {
  const { form, card } = useRecordForm({
    kind: "mortality",
    schema: mortalityForm,
    blank,
    savedMessage: () => "Mortality record saved.",
    ...props,
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <RecordCard
      id="mortality-form"
      title="Mortality"
      description="Record dead fish removed from the pond."
      saveLabel="Save mortality"
      {...card}
    >
      <NumberField
        id="mo-c"
        label="Number of dead fish"
        integer
        error={errors.mortalityCount}
        {...register("mortalityCount")}
      />
      <Field>
        <FieldLabel htmlFor="mo-cause">Suspected cause</FieldLabel>
        <Controller
          control={control}
          name="suspectedCause"
          render={({ field }) => (
            <Select
              items={CAUSE_ITEMS}
              value={field.value ?? null}
              onValueChange={(v) => field.onChange(v ?? undefined)}
            >
              <SelectTrigger id="mo-cause">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CAUSE_ITEMS.map((c) => (
                    <SelectItem key={c.value ?? "none"} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        <FieldDescription>Optional.</FieldDescription>
      </Field>
      <NotesField id="mo-r" {...register("remarks")} />
    </RecordCard>
  );
}
