"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** How to put Primer on your home screen. Offers a one-tap button where the browser supports it. */
export function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    // Already opened from the home screen: nothing to explain.
    if (standalone) queueMicrotask(() => setInstalled(true));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  return (
    <section aria-labelledby="install-title" className="flex flex-col gap-4 border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="install-title" className="font-mono text-sm font-semibold text-heading">
          Put Primer on your home screen
        </h2>
        <p className="font-mono text-xs leading-5 text-subtle">It opens full-screen like an app. Nothing to download from an app store.</p>
      </div>
      {prompt && (
        <button
          type="button"
          className={buttonClass("primary", "w-fit")}
          onClick={async () => {
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") setInstalled(true);
            setPrompt(null);
          }}
        >
          Install Primer
        </button>
      )}
      <dl className="grid gap-3 font-mono text-xs leading-5 sm:grid-cols-3">
        <div>
          <dt className="font-medium text-heading">iPhone / iPad</dt>
          <dd className="text-body">In Safari, tap Share (square with an arrow), then Add to Home Screen.</dd>
        </div>
        <div>
          <dt className="font-medium text-heading">Android</dt>
          <dd className="text-body">In Chrome, tap ⋮, then Install app (or Add to Home screen).</dd>
        </div>
        <div>
          <dt className="font-medium text-heading">Computer</dt>
          <dd className="text-body">In Chrome or Edge, click the install icon at the right end of the address bar.</dd>
        </div>
      </dl>
    </section>
  );
}
