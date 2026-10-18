"use client";

import { useEffect, useState } from "react";
import {
  Share,
  SquarePlus,
  MoreHorizontal,
  MoreVertical,
  Smartphone,
  Copy,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  installPlatform,
  shouldPrompt,
  snoozed,
  type InstallPlatform,
} from "@/lib/install-platform";

/*
  "Put ARISE on your home screen."

  A client gets here from a texted link, which opens in Safari. Left there,
  ARISE is a website: browser bars on every screen, signed out whenever Safari
  clears its data, and — on an iPhone — never a single notification, because
  iOS only lets home-screen apps receive them. Every reminder and every reply
  from the coach would go nowhere. So the app asks, with the exact taps for
  the phone in hand.

  Two shapes. `sheet` slides up on its own across the client app until it is
  done or snoozed. `card` sits on Profile so "Later" is never a dead end.
*/

const SNOOZE_KEY = "arise.install.snoozedAt";

// Chrome's install event. Not in the DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readSnooze(): number | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null; // private mode, blocked storage — just ask again
  }
}

function writeSnooze(at: number) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(at));
  } catch {
    /* nothing to do — worst case the sheet shows again next load */
  }
}

function detect(): InstallPlatform {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true;
  return installPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
  });
}

export function InstallGuide({
  variant = "sheet",
}: {
  variant?: "sheet" | "card";
}) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const p = detect();
    setPlatform(p);
    if (
      variant === "sheet" &&
      shouldPrompt(p) &&
      !snoozed(readSnooze(), Date.now())
    ) {
      // A beat after load, so it arrives over the screen rather than instead of it.
      const t = window.setTimeout(() => setOpen(true), 1200);
      return () => window.clearTimeout(t);
    }
  }, [variant]);

  // Android: Chrome offers its own one-tap install once it decides the app
  // qualifies. Hold on to it so our button can trigger it.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPlatform("installed");
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!platform || !shouldPrompt(platform)) return null;

  const later = () => {
    writeSnooze(Date.now());
    setOpen(false);
  };

  const installAndroid = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") {
      setPlatform("installed");
      setOpen(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/today");
      setCopied(true);
    } catch {
      /* clipboard blocked in some web views — the instructions still stand */
    }
  };

  const steps = <Steps platform={platform} canPrompt={Boolean(deferred)} />;

  const actions = (
    <div className="flex flex-col gap-2">
      {platform === "android" && deferred && (
        <Button onClick={installAndroid} className="w-full">
          Install ARISE
        </Button>
      )}
      {platform === "ios-in-app" && (
        <Button onClick={copyLink} variant="secondary" className="w-full">
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copied — paste it in Safari" : "Copy link for Safari"}
        </Button>
      )}
    </div>
  );

  if (variant === "card") {
    // Its own Card, so an installed phone shows no empty box on Profile.
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="font-medium">Put ARISE on your home screen</p>
              <p className="text-sm text-muted-foreground">
                Opens like an app, stays signed in, and is the only way your
                phone gets your coach&apos;s notifications.
              </p>
            </div>
          </div>
          {steps}
          {actions}
        </CardContent>
      </Card>
    );
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
    >
      <div className="w-full max-w-md border-t border-accent/40 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5 shadow-[0_-14px_46px_-10px_hsl(var(--system)/0.7)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="install-title" className="text-lg font-semibold">
              Put ARISE on your home screen
            </h2>
            <p className="text-sm text-muted-foreground">
              Takes 10 seconds. You&apos;ll get an app icon, stay signed in, and
              get notifications from your coach.
            </p>
          </div>
          <button
            onClick={later}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {steps}
        <div className="mt-5 flex flex-col gap-2">
          {actions}
          <Button variant="ghost" onClick={later} className="w-full">
            Later
          </Button>
        </div>
      </div>
      {/* On iPhone Safari the Share control lives in the bottom bar: point at it. */}
      {platform === "ios-safari" && (
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-1 left-1/2 -translate-x-1/2 animate-bounce text-2xl text-accent"
        >
          ↓
        </div>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-accent/50 text-xs font-bold text-accent">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed">{children}</span>
    </li>
  );
}

const Icon = ({ children }: { children: React.ReactNode }) => (
  <span className="mx-0.5 inline-flex translate-y-[3px] text-accent">
    {children}
  </span>
);

function Steps({
  platform,
  canPrompt,
}: {
  platform: InstallPlatform;
  canPrompt: boolean;
}) {
  if (platform === "ios-safari") {
    return (
      <ol className="flex flex-col gap-3">
        <Step n={1}>
          Tap the Share button{" "}
          <Icon>
            <Share className="h-4 w-4" />
          </Icon>{" "}
          at the bottom of Safari. Don&apos;t see it? Tap{" "}
          <Icon>
            <MoreHorizontal className="h-4 w-4" />
          </Icon>{" "}
          first.
        </Step>
        <Step n={2}>
          Scroll down and tap <strong>Add to Home Screen</strong>{" "}
          <Icon>
            <SquarePlus className="h-4 w-4" />
          </Icon>
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong>, then open ARISE from your home screen.
        </Step>
      </ol>
    );
  }

  if (platform === "ios-other") {
    return (
      <ol className="flex flex-col gap-3">
        <Step n={1}>
          Tap the Share button{" "}
          <Icon>
            <Share className="h-4 w-4" />
          </Icon>{" "}
          next to the address bar.
        </Step>
        <Step n={2}>
          Tap <strong>Add to Home Screen</strong>{" "}
          <Icon>
            <SquarePlus className="h-4 w-4" />
          </Icon>
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong>, then open ARISE from your home screen.
        </Step>
      </ol>
    );
  }

  if (platform === "ios-in-app") {
    return (
      <ol className="flex flex-col gap-3">
        <Step n={1}>
          This link opened inside another app, which can&apos;t add ARISE to
          your home screen.
        </Step>
        <Step n={2}>
          Copy the link below, open <strong>Safari</strong>, and paste it in the
          address bar.
        </Step>
        <Step n={3}>
          Then tap Share{" "}
          <Icon>
            <Share className="h-4 w-4" />
          </Icon>{" "}
          → <strong>Add to Home Screen</strong>.
        </Step>
      </ol>
    );
  }

  // Android
  if (canPrompt) {
    return (
      <p className="text-sm">
        Tap the button below and confirm. That&apos;s it.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      <Step n={1}>
        Tap the menu{" "}
        <Icon>
          <MoreVertical className="h-4 w-4" />
        </Icon>{" "}
        at the top right of Chrome.
      </Step>
      <Step n={2}>
        Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>
        ).
      </Step>
      <Step n={3}>Confirm, then open ARISE from your home screen.</Step>
    </ol>
  );
}
