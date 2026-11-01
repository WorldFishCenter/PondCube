"use client";

import { Controller } from "react-hook-form";
import { mortalityForm } from "@/lib/validation";
import { CAUSES } from "@/lib/options";
import { NotesField, NumberField, RecordCard, SelectField, type RecordFormProps, useRecordForm } from "./record-form";

const blank = () => ({ mortalityCount: "", causeDeath: undefined, noteDeath: "" });

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
      <Controller
        control={control}
        name="causeDeath"
        render={({ field }) => (
          <SelectField
            id="mo-cause"
            label="Cause of death"
            placeholder="Select a cause"
            options={CAUSES}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <NotesField id="mo-r" {...register("noteDeath")} />
    </RecordCard>
  );
}
