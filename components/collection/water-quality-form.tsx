"use client";

import { Controller } from "react-hook-form";
import { RANGES, waterQualityForm } from "@/lib/validation";
import { PERIODS } from "@/lib/options";
import { FieldGroup } from "@/components/ui/field";
import { ChoiceField, NotesField, NumberField, RecordCard, type RecordFormProps, useRecordForm } from "./record-form";

const range = (name: keyof typeof RANGES) => RANGES[name].join("–");
const READINGS = [
  { name: "dissolvedOxygen", label: "Dissolved oxygen", hint: `mg/L, ${range("dissolvedOxygen")}` },
  { name: "temperature", label: "Temperature", hint: `°C, ${range("temperature")}` },
  { name: "ph", label: "pH", hint: `${range("ph")}, optional` },
  { name: "ammonia", label: "Ammonia", hint: "mg/L, optional" },
  { name: "nitrite", label: "Nitrite", hint: "mg/L, optional" },
  { name: "nitrate", label: "Nitrate", hint: "mg/L, optional" },
] as const;

// Keeps the time of day between readings.
const blank = (last?: { period: "morning" | "afternoon" }) => ({
  period: last?.period ?? "morning",
  dissolvedOxygen: "",
  temperature: "",
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  remarks: "",
});

export function WaterQualityForm({ pondCode, recordedAt }: RecordFormProps) {
  const { form, card } = useRecordForm({
    kind: "wq",
    schema: waterQualityForm,
    blank,
    savedMessage: () => "Water-quality reading saved.",
    pondCode,
    recordedAt,
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <RecordCard
      id="wq-form"
      title="Water quality"
      description="Dissolved oxygen and temperature are required."
      saveLabel="Save reading"
      {...card}
    >
      <Controller
        control={control}
        name="period"
        render={({ field }) => (
          <ChoiceField
            id="wq-period"
            label="Time of day"
            options={PERIODS}
            value={field.value}
            onChange={(v) => {
              if (v) field.onChange(v);
            }}
            error={errors.period}
          />
        )}
      />
      <FieldGroup className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {READINGS.map(({ name, label, hint }) => (
          <NumberField
            key={name}
            id={`wq-${name}`}
            label={label}
            hint={hint}
            error={errors[name]}
            {...register(name)}
          />
        ))}
      </FieldGroup>
      <NotesField id="wq-r" {...register("remarks")} />
    </RecordCard>
  );
}
