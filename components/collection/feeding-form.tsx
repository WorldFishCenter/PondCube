"use client";

import { Controller } from "react-hook-form";
import { feedingForm } from "@/lib/validation";
import { FEED_TYPES } from "@/lib/options";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChoiceField, NotesField, NumberField, RecordCard, type RecordFormProps, useRecordForm } from "./record-form";

const blank = () => ({ feedType: undefined, feedTypeOther: "", feedAmountKg: "", feedingsCount: "", remarks: "" });

export function FeedingForm(props: RecordFormProps) {
  const { form, card } = useRecordForm({
    kind: "feeding",
    schema: feedingForm,
    blank,
    savedMessage: () => "Feeding event saved.",
    ...props,
  });
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = form;

  return (
    <RecordCard
      id="feeding-form"
      title="Feeding"
      description="Amount fed is required."
      saveLabel="Save feeding"
      {...card}
    >
      <Controller
        control={control}
        name="feedType"
        render={({ field }) => (
          <ChoiceField
            id="fd-type"
            label="Feed type"
            options={FEED_TYPES}
            value={field.value}
            onChange={field.onChange}
            error={errors.feedType}
            hint="Optional. Tap again to clear."
          />
        )}
      />
      {watch("feedType") === "other" ? (
        <Field>
          <FieldLabel htmlFor="fd-o">Other feed type</FieldLabel>
          <Input id="fd-o" {...register("feedTypeOther")} />
        </Field>
      ) : null}
      <FieldGroup className="grid grid-cols-2 gap-4">
        <NumberField id="fd-a" label="Amount fed" hint="kg" error={errors.feedAmountKg} {...register("feedAmountKg")} />
        <NumberField
          id="fd-n"
          label="Feedings"
          hint="times, optional"
          integer
          error={errors.feedingsCount}
          {...register("feedingsCount")}
        />
      </FieldGroup>
      <NotesField id="fd-r" {...register("remarks")} />
    </RecordCard>
  );
}
