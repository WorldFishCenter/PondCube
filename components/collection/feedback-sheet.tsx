"use client";

import { WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

// Airtable form on the `feedback` table; operator (an Airtable operator name) and app version are prefilled and hidden.
const FORM = "https://airtable.com/embed/appPU5BJLdsjbn49o/pagwmHpi0H0lR1zLa/form";

export function FeedbackSheet({ operator, version }: { operator: string; version: string }) {
  const src = `${FORM}?${new URLSearchParams({
    prefill_operator: operator,
    hide_operator: "true",
    "prefill_app version": version,
    "hide_app version": "true",
  })}`;
  // Only the close button closes it: a stray tap outside would lose a half-typed message.
  return (
    <Sheet disablePointerDismissal>
      <SheetTrigger render={<Button variant="link" className="self-center" />}>Send feedback</SheetTrigger>
      <SheetContent side="bottom" className="data-[side=bottom]:h-[90svh]">
        {/* The close button sits in this strip, on the app's colours, not over the (always white) form. */}
        <SheetHeader>
          <SheetTitle>Send feedback</SheetTitle>
        </SheetHeader>
        <FeedbackForm src={src} />
      </SheetContent>
    </Sheet>
  );
}

// Renders only while the sheet is open, so always in the browser.
function FeedbackForm({ src }: { src: string }) {
  if (!navigator.onLine)
    return (
      <div className="flex flex-1 items-center p-4">
        <Alert>
          <WifiOff />
          <AlertTitle>No signal</AlertTitle>
          <AlertDescription>
            Sending feedback needs signal. Close this and try again when you are back online.
          </AlertDescription>
        </Alert>
      </div>
    );
  return (
    <div className="relative flex-1">
      {/* Shows until the form paints over it (slow signal). */}
      <Spinner className="absolute inset-0 m-auto" />
      <iframe src={src} title="Feedback form" className="relative size-full" />
    </div>
  );
}
