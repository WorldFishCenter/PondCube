"use client";

import * as React from "react";
import { format } from "date-fns";
import { Check, Copy, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Choice } from "./record-form";

// Seeing the data (docs/architecture.md): a month of water quality as an Excel file, and a data link of CSVs.
const MONTHS = 24; // ponytail: the last two years; offer older months when someone asks

export function DataSheet({ sites }: { sites: string[] }) {
  const yours = sites.length > 1 ? "your sites" : "your site";
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="link" />}>Your data</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Your data</SheetTitle>
          <SheetDescription>The records of {yours}, from the database.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="p-4">
          <ExcelDownload sites={sites} />
          <FieldSeparator />
          <DataLink yours={yours} />
        </FieldGroup>
      </SheetContent>
    </Sheet>
  );
}

// Renders only while the sheet is open, so in the browser: the months are this device's.
function ExcelDownload({ sites }: { sites: string[] }) {
  const months = React.useMemo(() => {
    const now = new Date();
    return Array.from({ length: MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
    });
  }, []);
  const [site, setSite] = React.useState(sites[0]);
  const [month, setMonth] = React.useState(months[0].value);
  return (
    <>
      {sites.length > 1 && (
        <Field>
          <FieldLabel htmlFor="download-site">Site</FieldLabel>
          <Choice
            id="download-site"
            items={sites.map((s) => ({ value: s, label: s }))}
            value={site}
            onChange={(s) => s && setSite(s)}
          />
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="download-month">Water quality, one month</FieldLabel>
        <Choice id="download-month" items={months} value={month} onChange={(m) => m && setMonth(m)} />
        <FieldDescription>
          An Excel file: every reading, a tab per area laid out like the old log, and averages.
        </FieldDescription>
      </Field>
      <a className={buttonVariants()} href={`/api/download?${new URLSearchParams({ site, month })}`} download>
        <Download />
        Download Excel file
      </a>
    </>
  );
}

function DataLink({ yours }: { yours: string }) {
  const [link, setLink] = React.useState<{ key: string; links: string[] }>();
  const [state, setState] = React.useState<"idle" | "making" | "failed">("idle");
  const make = async () => {
    setState("making");
    const res = await fetch("/api/data-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    if (!res?.ok) return setState("failed");
    setLink(await res.json());
    setState("idle");
  };
  return (
    <Field>
      <FieldLabel>Data link</FieldLabel>
      <FieldDescription>
        For a spreadsheet that keeps itself up to date (Excel Power Query or Google Sheets): CSV files of every record
        at {yours}. Anyone with the key can read them, so keep it like a password. A new link stops the old one.
      </FieldDescription>
      {link && (
        <>
          <InputGroup>
            <InputGroupInput aria-label="Key" readOnly value={link.key} />
            <InputGroupAddon align="inline-end">
              <CopyButton text={link.key} label="Copy key" />
            </InputGroupAddon>
          </InputGroup>
          <InputGroup>
            <InputGroupTextarea
              aria-label="Links"
              readOnly
              rows={link.links.length}
              value={link.links.join("\n")}
              className="text-xs"
            />
            <InputGroupAddon align="block-end">
              <CopyButton text={link.links.join("\n")} label="Copy links" />
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>Shown only now. Copy it before closing this.</FieldDescription>
        </>
      )}
      <Button variant="outline" onClick={make} disabled={state === "making"}>
        {link ? "Make a new data link" : "Make a data link"}
      </Button>
      {state === "failed" && <FieldError>Couldn&apos;t make the link. Check your signal and try again.</FieldError>}
    </Field>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <InputGroupButton
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      aria-label={label}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </InputGroupButton>
  );
}
