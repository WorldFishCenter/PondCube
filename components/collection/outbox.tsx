"use client";

import * as React from "react";
import { getToken } from "@clerk/nextjs";
import { CloudUpload } from "lucide-react";
import { createOutbox, type Sent, type Stopped, type WaitingRecord } from "@/lib/outbox";
import type { RecordKind } from "@/lib/validation";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// One Record to app/api/records; a 401 gets one retry with a fresh Clerk token (the cookie lapses offline).
async function send({ kind, account, record }: WaitingRecord): Promise<Sent> {
  const post = (token?: string) =>
    fetch("/api/records", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ kind, account, record }),
      signal: AbortSignal.timeout?.(20_000), // weak signal can stall a request (no timeout before iOS 16)
    });
  try {
    let res = await post();
    if (res.status === 401) {
      const token = await getToken().catch(() => null); // null: signed out, or Clerk never loaded
      if (token) res = await post(token);
    }
    if (res.ok) return "saved";
    if (res.status === 401) return "signedOut";
    if (res.status === 403) return "notOnList";
    if (res.status === 422) return { failed: await res.text() };
    return { failed: `The server couldn't store it (error ${res.status})` };
  } catch {
    return "offline";
  }
}

const deviceOutbox = createOutbox(send);

export type Outbox = ReturnType<typeof useOutbox>;

/** Sends on open, on coming back to the app, when signal returns, after each Save and on Send now. */
export function useOutbox(account: string, person: string) {
  const [waiting, setWaiting] = React.useState<WaitingRecord[]>([]);
  const [sending, setSending] = React.useState(false);
  const [stopped, setStopped] = React.useState<Stopped>();

  const flush = React.useCallback(async () => {
    if (!deviceOutbox.all().some((w) => w.account === account)) return;
    setSending(true);
    setStopped(await deviceOutbox.flush(account));
    setWaiting(deviceOutbox.all());
    setSending(false);
  }, [account]);

  React.useEffect(() => {
    navigator.storage?.persist?.(); // asks the browser not to clear the Outbox when space runs low
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restored after hydration: no localStorage on the server
    setWaiting(deviceOutbox.all());
    flush();
    const onVisible = () => document.visibilityState === "visible" && flush();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  const add = React.useCallback(
    async (kind: RecordKind, record: WaitingRecord["record"]) => {
      const safe = await deviceOutbox.add({ kind, account, person, record });
      setWaiting(deviceOutbox.all());
      flush();
      return safe;
    },
    [account, person, flush],
  );

  return {
    mine: waiting.filter((w) => w.account === account),
    others: waiting.filter((w) => w.account !== account),
    isWaiting: (id: string) => waiting.some((w) => w.record.id === id),
    sending,
    stopped,
    add,
    flush,
  };
}

export const records = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;
const WHY_NOT_SENT: Record<Stopped, string> = {
  offline: "Kept on this device and sent automatically when there's signal.",
  signedOut: "Your sign-in needs renewing: tap Send now to reload the app.",
  notOnList: "Your account isn't on the operator list any more, so they can't be sent. Ask your supervisor.",
};

// Going through normally: nothing to say, and appearing for each Record would shift the screen under the Operator.
export const noticeShown = ({ mine, others, sending, stopped }: Outbox) =>
  (mine.length > 0 || others.length > 0) && !(sending && !stopped && !others.length && !mine.some((w) => w.problem));

/** While anything waits: whose Records, why they're not sent yet, and Send now. */
export function OutboxAlert({ outbox }: { outbox: Outbox }) {
  const { mine, others, sending, stopped, flush } = outbox;
  if (!noticeShown(outbox)) return null;

  return (
    // Wider action slot than the stock pr-18, so "Send now" fits at the 44px touch size.
    <Alert className="has-data-[slot=alert-action]:pr-28">
      <CloudUpload />
      <AlertTitle>{sending ? "Sending…" : `${records(mine.length + others.length)} waiting to send`}</AlertTitle>
      <AlertDescription>
        {mine.length > 0 && <p>{WHY_NOT_SENT[stopped ?? "offline"]}</p>}
        {mine.map(({ record, problem }) =>
          problem ? (
            <p key={record.id}>
              Needs attention ({record.pondCode}): {problem}. Tell your supervisor.
            </p>
          ) : null,
        )}
        {others.length > 0 && (
          <p>
            {records(others.length)} by {[...new Set(others.map((w) => w.person))].join(", ")}: sent when they sign in
            on this device.
          </p>
        )}
      </AlertDescription>
      {mine.length > 0 && (
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            disabled={sending}
            onClick={stopped === "signedOut" ? () => location.reload() : flush}
          >
            Send now
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
