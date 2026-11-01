"use client";

import * as React from "react";
import { CloudUpload, Ellipsis, EllipsisVertical, Share, SquarePlus, type LucideIcon } from "lucide-react";
import { waitingRecords } from "@/lib/outbox";
import { readLocal, writeLocal } from "@/lib/storage";
import { records } from "@/components/collection/outbox";
import { PondCubeLogo } from "@/components/pondcube-logo";
import { Steps } from "@/components/steps";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

const SEEN_KEY = "pondcube:installSeen"; // it opens by itself only until it's first closed

// Chromium only (not in TS's DOM types): lets our own button open the browser's install dialog.
type InstallOffer = Event & { prompt: () => Promise<unknown> };

// Kept outside React, as they can happen before it mounts.
let offer: InstallOffer | null = null; // never comes once installed
let installedHere = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    if (!readLocal(SEEN_KEY)) event.preventDefault(); // the drawer goes first; Chrome's own install bar may follow
    offer = event as InstallOffer;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    installedHere = true;
    changed();
  });
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

// "other": Android, or any touch browser that isn't Apple's. iPadOS says it's a Mac.
type Platform = "ios" | "other";
// null in the installed app, on a computer and on the server.
function detectPlatform(): Platform | null {
  if (installedHere || matchMedia("(display-mode: standalone)").matches || !matchMedia("(pointer: coarse)").matches)
    return null;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : "other";
}

const BROWSER: Record<Platform, string> = { ios: "Safari", other: "Chrome" };
const STEPS: Record<Platform, React.ReactNode[]> = {
  ios: [
    <>
      Tap <Tap icon={Share}>Share</Tap> in Safari. On newer iPhones it&apos;s under <Tap icon={Ellipsis} />.
    </>,
    <>
      Tap <Tap icon={SquarePlus}>Add to Home Screen</Tap>. Not there? Scroll down or tap View More.
    </>,
    <>
      Tap <Tap>Add</Tap>, then open PondCube from your home screen and sign in.
    </>,
  ],
  other: [
    <>
      Tap the browser menu <Tap icon={EllipsisVertical} />.
    </>,
    <>
      Tap <Tap>Add to Home screen</Tap> or <Tap>Install app</Tap>.
    </>,
    <>
      Tap <Tap>Install</Tap>, then open PondCube from your home screen.
    </>,
  ],
};

/** "Install the app" link, in a browser on a phone or tablet; its drawer also opens by itself on a first visit. */
export function InstallPrompt() {
  const platform = React.useSyncExternalStore(subscribe, detectPlatform, () => null);
  const offered = React.useSyncExternalStore(
    subscribe,
    () => offer,
    () => null,
  );
  const [open, setOpen] = React.useState(false);

  // On load only (it's mounted once), so never in the middle of a sign-in or a record.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- after hydration: no device or localStorage on the server
    if (platform && !readLocal(SEEN_KEY)) setOpen(true);
  }, [platform]);

  if (!platform) return null;
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) writeLocal(SEEN_KEY, "1");
  };
  const install = () => {
    offered?.prompt();
    offer = null; // usable once; unannounced, so the drawer doesn't change while it slides away
  };

  return (
    <Drawer open={open} onOpenChange={changeOpen}>
      <DrawerTrigger render={<Button variant="link" className="mx-auto flex w-fit" />}>Install the app</DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col">
          <DrawerHeader className="items-center gap-1 md:text-center">
            <PondCubeLogo className="mb-2 size-14" />
            <DrawerTitle>Install PondCube</DrawerTitle>
            <DrawerDescription>
              Opens from your home screen, works without signal and keeps saved records safe on this device.
            </DrawerDescription>
          </DrawerHeader>
          {!offered && (
            <div className="flex flex-col gap-4 px-4 pt-4">
              {platform === "ios" && <WaitingAlert />}
              <p className="text-muted-foreground">
                Opened the link from another app? Open it in {BROWSER[platform]} first.
              </p>
              <Steps steps={STEPS[platform]} />
            </div>
          )}
          <DrawerFooter className="pt-4">
            {offered ? (
              <>
                <DrawerClose render={<Button />} onClick={install}>
                  Install
                </DrawerClose>
                <DrawerClose render={<Button variant="ghost" />}>Not now</DrawerClose>
              </>
            ) : (
              <DrawerClose render={<Button />}>Got it</DrawerClose>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// The home-screen app has its own storage, so Records waiting in Safari would stay behind.
function WaitingAlert() {
  const waiting = waitingRecords().length;
  if (!waiting) return null;
  return (
    <Alert>
      <CloudUpload />
      <AlertTitle>{records(waiting)} waiting to send here</AlertTitle>
      <AlertDescription>
        Send before you switch: the app on your home screen can&apos;t see what waits here.
      </AlertDescription>
    </Alert>
  );
}

// Looks like the button to tap: its label, its icon or both.
function Tap({ icon: Icon, children }: { icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <Badge variant="outline" className="align-middle">
      {children}
      {Icon && <Icon data-icon="inline-end" />}
    </Badge>
  );
}
