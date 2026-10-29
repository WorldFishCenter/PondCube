"use client";

import * as React from "react";
import { RANGES, waterQualityForm } from "@/lib/validation";
import { PERIODS } from "@/lib/options";
import { Badge } from "@/components/ui/badge";
import { FieldGroup } from "@/components/ui/field";
import { NotesField, NumberField, RecordCard, type RecordFormProps, useRecordForm } from "./record-form";

const range = (name: keyof typeof RANGES) => RANGES[name].join("–");
const READINGS = [
  { name: "dissolvedOxygen", label: "Dissolved oxygen", hint: `mg/L, ${range("dissolvedOxygen")}` },
  { name: "temperature", label: "Temperature", hint: `°C, ${range("temperature")}` },
  { name: "ph", label: "pH", hint: `${range("ph")}, optional` },
  { name: "ammonia", label: "Ammonia", hint: "mg/L, optional" },
  { name: "nitrite", label: "Nitrite", hint: "mg/L, optional" },
  { name: "nitrate", label: "Nitrate", hint: "mg/L, optional" },
] as const;

const blank = () => ({
  period: "morning" as (typeof PERIODS)[number]["value"], // set from Recorded-at before any save
  dissolvedOxygen: "",
  temperature: "",
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  remarks: "",
});

export function WaterQualityForm(props: RecordFormProps) {
  const { form, card } = useRecordForm({
    kind: "wq",
    schema: waterQualityForm,
    blank,
    savedMessage: () => "Water-quality reading saved.",
    ...props,
  });
  const {
    register,
    setValue,
    formState: { errors },
  } = form;
  // The Period is Recorded-at's (before noon: morning), never picked by hand: shown beside the title.
  const time = props.recordedAt.value.split("T")[1];
  const period = time ? (time < "12:00" ? "morning" : "afternoon") : undefined;
  React.useEffect(() => {
    if (period) setValue("period", period);
  }, [period, setValue]);

  return (
    <RecordCard
      id="wq-form"
      title="Water quality"
      description="Dissolved oxygen and temperature are required."
      saveLabel="Save reading"
      action={period && <Badge variant="secondary">{PERIODS.find((p) => p.value === period)?.label}</Badge>}
      {...card}
    >
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
