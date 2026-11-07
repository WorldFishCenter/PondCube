"use client";

import * as React from "react";
import { Controller } from "react-hook-form";
import { mortalityForm } from "@/lib/validation";
import { CAUSES } from "@/lib/options";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NotesField, NumberField, RecordCard, SelectField, type RecordFormProps, useRecordForm } from "./record-form";

/** A species (DMS SPECIES) the chosen pond holds, or any species when it lists none. */
export type Species = { species: string; speciesCommon: string | null };

export function MortalityForm({ species, ...props }: RecordFormProps & { species: Species[] }) {
  const only = species.length === 1 ? species[0].species : "";
  // A pond's only species comes picked. Stable while the form is open: it's keyed by pond.
  const blank = React.useCallback(
    () => ({ species: only, pit: "", mortalityCount: "", causeDeath: undefined, noteDeath: "" }),
    [only],
  );
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
    <RecordCard id="mortality-form" saveLabel="Save mortality" {...card}>
      <Controller
        control={control}
        name="species"
        render={({ field }) => (
          <SelectField
            id="mo-species"
            label="Species"
            placeholder="Select a species"
            // As the pond book shows it: CC (Catla)
            options={species.map((s) => ({
              value: s.species,
              label: s.speciesCommon ? `${s.species} (${s.speciesCommon})` : s.species,
            }))}
            value={field.value}
            onChange={field.onChange}
            required
            error={errors.species}
          />
        )}
      />
      <Field data-invalid={!!errors.pit}>
        <FieldLabel htmlFor="mo-pit">PIT tag</FieldLabel>
        {/* Plain text, so a tag reader that types into the phone can fill it. */}
        <Input
          id="mo-pit"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={!!errors.pit}
          {...register("pit")}
        />
        {errors.pit ? <FieldError errors={[errors.pit]} /> : <FieldDescription>Optional.</FieldDescription>}
      </Field>
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
