"use client";

import * as React from "react";
import { areasOf } from "@/lib/options";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";

export type Pond = { pondCode: string; displayName: string; site: string; area: string };

// Grouped by Area. Typing filters on "code · name", so both "FT3-091" and "Fish Tank 3" find a pond.
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
  const areas = React.useMemo(() => areasOf(ponds), [ponds]);
  return (
    <Combobox
      items={areas}
      value={ponds.find((p) => p.pondCode === value) ?? null}
      onValueChange={(p) => onChange(p?.pondCode ?? "")}
      itemToStringLabel={(p) => `${p.pondCode} · ${p.displayName}`}
      isItemEqualToValue={(a, b) => a.pondCode === b.pondCode}
    >
      <ComboboxInput id={id} className="w-full" placeholder="Search code or name" />
      <ComboboxContent>
        <ComboboxEmpty>No pond found.</ComboboxEmpty>
        <ComboboxList>
          {(area: (typeof areas)[number]) => (
            <ComboboxGroup key={area.value} items={area.items}>
              <ComboboxLabel>{area.label}</ComboboxLabel>
              <ComboboxCollection>
                {(p: Pond) => (
                  <ComboboxItem key={p.pondCode} value={p}>
                    <span className="font-mono">{p.pondCode}</span>
                    <span className="truncate text-muted-foreground">{p.displayName}</span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
