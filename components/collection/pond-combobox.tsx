"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export type Pond = { pondCode: string; displayName: string };

// Typing filters on "code · name", so both "FT3-091" and "Fish Tank 3" find a pond.
export function PondCombobox({
  id,
  ponds,
  value,
  onChange,
}: {
  id?: string;
  ponds: Pond[];
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <Combobox
      items={ponds}
      value={ponds.find((p) => p.pondCode === value) ?? null}
      onValueChange={(p) => onChange(p?.pondCode ?? "")}
      itemToStringLabel={(p) => `${p.pondCode} · ${p.displayName}`}
      isItemEqualToValue={(a, b) => a.pondCode === b.pondCode}
    >
      <ComboboxInput id={id} className="w-full" placeholder="Search code or name" />
      <ComboboxContent>
        <ComboboxEmpty>No pond found.</ComboboxEmpty>
        <ComboboxList>
          {(p: Pond) => (
            <ComboboxItem key={p.pondCode} value={p}>
              <span className="font-mono">{p.pondCode}</span>
              <span className="truncate text-muted-foreground">{p.displayName}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
