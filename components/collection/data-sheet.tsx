"use client";

import * as React from "react";
import { format } from "date-fns";
import { Check, Copy, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ViewName } from "@/lib/export";
import type { RecordKind } from "@/lib/validation";
import { Choice } from "./record-form";

// Seeing the data (docs/architecture.md): a month of water quality as an Excel file, and a data link of CSVs.
const MONTHS = 24; // ponytail: the last two years; offer older months when someone asks

export function DataSheet({ sites, kinds }: { sites: string[]; kinds: Record<RecordKind, { label: string }> }) {
  const yours = sites.length > 1 ? "your sites" : "your site";
  return (
    <Sheet>
      {/* Tablets and computers only: nobody works with the data on a phone. */}
      <SheetTrigger render={<Button variant="link" className="hidden md:inline-flex" />}>Your data</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader className="mx-auto w-full max-w-2xl">
          <SheetTitle>Your data</SheetTitle>
          <SheetDescription>The records of {yours}, from the database.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="mx-auto max-w-2xl p-4">
          <ExcelDownload sites={sites} />
          <FieldSeparator />
          <DataLink yours={yours} labels={{ ...kinds, ponds: { label: "Ponds" } }} />
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
        <Download data-icon="inline-start" />
        Download Excel file
      </a>
    </>
  );
}

// Where people put a data link: the steps, and what each Copy button gives them to paste there.
const APPS = [
  {
    name: "Google Sheets",
    paste: (url: string) => `=IMPORTDATA("${url}")`,
    steps: [
      "Open a new sheet in Google Sheets.",
      "Copy a line below and paste it into cell A1.",
      "For other records, add a tab and do the same. The sheet updates by itself.",
    ],
  },
  {
    name: "Excel",
    paste: (url: string) => url,
    steps: [
      "Open a new workbook in Excel for the web.",
      "Go to Data → Get Data → Web API. Paste a line below, then Load. If asked how to connect, choose Anonymous.",
      "For other records, do the same again. To update: Data → Refresh All.",
    ],
  },
];

function DataLink({ yours, labels }: { yours: string; labels: Record<ViewName, { label: string }> }) {
  const [link, setLink] = React.useState<{ key: string; links: Record<ViewName, string> }>();
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
      <FieldTitle>Data link</FieldTitle>
      <FieldDescription>The records of {yours} in Google Sheets or Excel, always up to date.</FieldDescription>
      {link && (
        <>
          <Tabs defaultValue={APPS[0].name}>
            <TabsList className="w-full">
              {APPS.map((app) => (
                <TabsTrigger key={app.name} value={app.name}>
                  {app.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {APPS.map((app) => (
              <TabsContent key={app.name} value={app.name} className="flex flex-col gap-3 pt-2">
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {app.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {Object.entries(link.links).map(([file, url]) => {
                  const { label } = labels[file as ViewName];
                  const line = app.paste(url);
                  return (
                    <InputGroup key={file}>
                      <InputGroupInput aria-label={label} readOnly value={line} className="text-xs" />
                      <InputGroupAddon align="inline-start">
                        <InputGroupText className="w-24 font-medium text-foreground">{label}</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupAddon align="inline-end">
                        <CopyButton text={line} name={label} />
                      </InputGroupAddon>
                    </InputGroup>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
          <FieldDescription>Shown only now: copy what you need before closing this.</FieldDescription>
          <p className="text-xs break-all text-muted-foreground">
            Keep these lines like a password: anyone with one can see the records. Pasted into a sheet or workbook, the
            key is in that file too, so share the file only with people who may see them. Making a new link stops the
            old ones. The key on its own, for a ready-made Excel template: <span className="font-mono">{link.key}</span>
          </p>
        </>
      )}
      <Button variant="outline" onClick={make} disabled={state === "making"}>
        {link ? "Make a new data link" : "Make a data link"}
      </Button>
      {state === "failed" && <FieldError>Couldn&apos;t make the link. Check your signal and try again.</FieldError>}
    </Field>
  );
}

function CopyButton({ text, name }: { text: string; name: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <InputGroupButton
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      aria-label={`Copy ${name}`}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </InputGroupButton>
  );
}
