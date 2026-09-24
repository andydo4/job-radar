"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/jobs", label: "Jobs", soon: false },
  { href: "/grad", label: "Grad programs", soon: false },
  { href: "/settings", label: "Settings", soon: false },
];

export function NavTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 items-center gap-2 border-b-2 px-3 font-mono text-sm whitespace-nowrap transition-colors duration-100 ${
              active ? "border-brand font-medium text-link" : "border-transparent text-subtle hover:text-heading"
            }`}
          >
            {t.label}
            {t.soon && <span className="border border-line bg-muted px-1.5 text-[11px] text-subtle">Soon</span>}
          </Link>
        );
      })}
    </nav>
  );
}
