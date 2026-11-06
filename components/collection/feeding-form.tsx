"use client";

import { Controller } from "react-hook-form";
import { feedingForm } from "@/lib/validation";
import { NotesField, NumberField, RecordCard, SelectField, type RecordFormProps, useRecordForm } from "./record-form";

/** A feed used at the chosen pond's site (DMS FEED). */
export type Feed = { feed: string; noteFeed: string | null };

const blank = () => ({ feed: "", feedWeight: "", remarks: "" });

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
            required
            error={errors.feed}
          />
        )}
      />
      <NumberField id="fd-w" label="Feed weight (g)" error={errors.feedWeight} {...register("feedWeight")} />
      <NotesField id="fd-r" {...register("remarks")} />
    </RecordCard>
  );
}
