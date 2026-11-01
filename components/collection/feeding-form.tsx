"use client";

import { Controller } from "react-hook-form";
import { feedingForm } from "@/lib/validation";
import { FieldGroup } from "@/components/ui/field";
import { NotesField, NumberField, RecordCard, SelectField, type RecordFormProps, useRecordForm } from "./record-form";

/** A feed used at the chosen pond's site (DMS FEED). */
export type Feed = { feed: string; noteFeed: string | null };

const blank = () => ({ feed: undefined, feedAmountKg: "", feedingsCount: "", remarks: "" });

export function FeedingForm({ feeds, ...props }: RecordFormProps & { feeds: Feed[] }) {
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
    formState: { errors },
  } = form;

  return (
    <RecordCard id="feeding-form" saveLabel="Save feeding" {...card}>
      <Controller
        control={control}
        name="feed"
        render={({ field }) => (
          <SelectField
            id="fd-feed"
            label="Feed"
            placeholder={feeds.length ? "Select a feed" : "No feeds for this site"}
            options={feeds.map((f) => ({ value: f.feed, label: f.noteFeed ? `${f.feed} · ${f.noteFeed}` : f.feed }))}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <FieldGroup className="grid grid-cols-2 gap-4">
        <NumberField id="fd-a" label="Amount fed (kg)" error={errors.feedAmountKg} {...register("feedAmountKg")} />
        <NumberField
          id="fd-n"
          label="Number of feedings"
          hint="Optional."
          integer
          error={errors.feedingsCount}
          {...register("feedingsCount")}
        />
      </FieldGroup>
      <NotesField id="fd-r" {...register("remarks")} />
    </RecordCard>
  );
}
