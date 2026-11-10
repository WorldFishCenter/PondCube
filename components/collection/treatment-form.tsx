"use client";

import { Controller } from "react-hook-form";
import { treatmentForm } from "@/lib/validation";
import { NotesField, NumberField, RecordCard, SelectField, type RecordFormProps, useRecordForm } from "./record-form";

/** A treatment used at the chosen pond's site, by the pond book's name (Lime, Salt, …). */
export type Treatment = { treatment: string; noteTreatment: string | null };

const blank = () => ({ treatment: "", treatmentWeight: "", remarks: "" });

export function TreatmentForm({ treatments, ...props }: RecordFormProps & { treatments: Treatment[] }) {
  const { form, card } = useRecordForm({
    kind: "treatment",
    schema: treatmentForm,
    blank,
    savedMessage: () => "Treatment event saved.",
    ...props,
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <RecordCard id="treatment-form" saveLabel="Save treatment" {...card}>
      <Controller
        control={control}
        name="treatment"
        render={({ field }) => (
          <SelectField
            id="tr-treatment"
            label="Treatment"
            placeholder={treatments.length ? "Select a treatment" : "No treatments for this site"}
            options={treatments.map((t) => ({
              value: t.treatment,
              label: t.noteTreatment ? `${t.treatment} · ${t.noteTreatment}` : t.treatment,
            }))}
            value={field.value}
            onChange={field.onChange}
            required
            error={errors.treatment}
          />
        )}
      />
      <NumberField
        id="tr-w"
        label="Treatment weight (g)"
        error={errors.treatmentWeight}
        {...register("treatmentWeight")}
      />
      <NotesField id="tr-r" {...register("remarks")} />
    </RecordCard>
  );
}
