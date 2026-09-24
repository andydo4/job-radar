"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";

/** Phones: the avatar opens a small menu with the theme switch, Settings and Sign out. */
export function AccountMenu({ name, avatar, theme, checker }: { name: string; avatar?: string; theme: Theme; checker?: { text: string; stale: boolean } }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className="grid size-10 place-items-center"
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-brand font-mono text-xs font-bold text-white" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-64 border border-line-strong bg-surface font-mono text-sm shadow-lg">
          <p className="truncate border-b border-line px-4 py-3 text-xs text-subtle">{name}</p>
          {checker && (
            <p className={`flex items-center gap-1.5 border-b border-line px-4 py-2.5 text-xs ${checker.stale ? "text-danger" : "text-subtle"}`}>
              <span aria-hidden className={`size-1.5 rounded-full ${checker.stale ? "bg-danger" : "bg-success"}`} />
              {checker.text}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <span className="text-xs text-subtle">Theme</span>
            <ThemeToggle initial={theme} />
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="block border-b border-line px-4 py-3 text-heading hover:bg-muted">
            Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button className="w-full px-4 py-3 text-left text-heading hover:bg-muted">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
