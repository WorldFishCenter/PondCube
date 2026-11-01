import * as React from "react";
import { Badge } from "@/components/ui/badge";

// Numbered instructions, the same wherever the app gives them.
export function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <Badge className="size-7 rounded-full">{i + 1}</Badge>
          <span className="leading-7">{step}</span>
        </li>
      ))}
    </ol>
  );
}
