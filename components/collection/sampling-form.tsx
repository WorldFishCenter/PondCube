"use client";

import { useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { samplingForm } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { NotesField, NumberField, RecordCard, type RecordFormProps, useRecordForm } from "./record-form";

const NO_FISH = { weightG: "", lengthCm: "" };
const blank = () => ({ notes: "", fish: [NO_FISH] });

export function SamplingForm(props: RecordFormProps) {
  const { form, card } = useRecordForm({
    kind: "sampling",
    schema: samplingForm,
    blank,
    savedMessage: (record) => `Sampling event saved (${record.fish.length} fish).`,
    ...props,
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "fish" });
  // A schema-level fish error lands on `root` for field arrays.
  const fishError = errors.fish?.root ?? (errors.fish?.message ? errors.fish : undefined);

  return (
    <RecordCard
      id="sampling-form"
      title="Sampling"
      description="Weigh and measure a sample of fish."
      saveLabel="Save sampling"
      {...card}
    >
      <NotesField id="sa-n" label="Notes" placeholder="Purpose, batch, etc." {...register("notes")} />
      <FieldSet>
        <FieldLegend>Fish measurements</FieldLegend>
        <FieldDescription>{fields.length} fish · fill weight, length or both.</FieldDescription>
        <FieldError errors={[fishError]} />
        <FieldGroup>
          {fields.map((f, i) => (
            <FieldGroup key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <NumberField
                id={`w-${i}`}
                label={`#${i + 1} weight (g)`}
                error={errors.fish?.[i]?.weightG}
                {...register(`fish.${i}.weightG`)}
              />
              <NumberField
                id={`l-${i}`}
                label="Length (cm)"
                error={errors.fish?.[i]?.lengthCm}
                {...register(`fish.${i}.lengthCm`)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                disabled={fields.length === 1}
                aria-label={`Remove fish ${i + 1}`}
              >
                <Trash2 />
              </Button>
            </FieldGroup>
          ))}
        </FieldGroup>
        <Button type="button" variant="outline" onClick={() => append(NO_FISH)}>
          <Plus data-icon="inline-start" />
          Add fish
        </Button>
      </FieldSet>
    </RecordCard>
  );
}
