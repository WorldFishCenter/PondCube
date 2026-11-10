"use client";

import { Controller } from "react-hook-form";
import { fertiliserForm } from "@/lib/validation";
import { NotesField, NumberField, RecordCard, SelectField, type RecordFormProps, useRecordForm } from "./record-form";

/** A fertiliser used at the chosen pond's site (DMS FERT). */
export type Fert = { fert: string; noteFert: string | null };

const blank = () => ({ fert: "", fertWeight: "", remarks: "" });

export function FertiliserForm({ ferts, ...props }: RecordFormProps & { ferts: Fert[] }) {
  const { form, card } = useRecordForm({
    kind: "fertiliser",
    schema: fertiliserForm,
    blank,
    savedMessage: () => "Fertiliser event saved.",
    ...props,
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <RecordCard id="fertiliser-form" saveLabel="Save fertiliser" {...card}>
      <Controller
        control={control}
        name="fert"
        render={({ field }) => (
          <SelectField
            id="fe-fert"
            label="Fertiliser"
            placeholder={ferts.length ? "Select a fertiliser" : "No fertilisers for this site"}
            options={ferts.map((f) => ({ value: f.fert, label: f.noteFert ? `${f.fert} · ${f.noteFert}` : f.fert }))}
            value={field.value}
            onChange={field.onChange}
            required
            error={errors.fert}
          />
        )}
      />
      <NumberField id="fe-w" label="Fertiliser weight (g)" error={errors.fertWeight} {...register("fertWeight")} />
      <NotesField id="fe-r" {...register("remarks")} />
    </RecordCard>
  );
}
