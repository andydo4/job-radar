import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { countdownLabel, urgencyFor, type Urgency } from "@/lib/deadlines";
import type { Status } from "@/lib/programs";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Buttons: 40px tall (44px on touch screens), 1px corners, mono 14/500
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "bg-muted text-heading hover:bg-brand-soft",
  outline: "border border-line-strong bg-surface text-heading hover:bg-muted",
  ghost: "text-link hover:bg-brand-softer",
  danger: "border border-danger bg-danger-soft text-danger hover:bg-danger hover:text-white",
};

export function buttonClass(variant: Variant = "primary", extra?: string) {
  return cx(
    "inline-flex h-11 items-center justify-center gap-2 px-4 font-mono text-sm font-medium whitespace-nowrap transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10",
    VARIANTS[variant],
    extra,
  );
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "new";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-muted text-body",
  brand: "border-brand-soft bg-brand-softer text-link",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  new: "border-transparent bg-lime font-medium text-on-lime",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex max-w-full items-center border px-2 py-0.5 font-mono text-xs [overflow-wrap:anywhere]", TONES[tone], className)}>
      {children}
    </span>
  );
}

const URGENCY_TONE: Record<Urgency, Tone> = { none: "neutral", past: "neutral", danger: "danger", warning: "warning", ok: "brand" };

export function CountdownBadge({ days }: { days: number | null }) {
  const urgency = urgencyFor(days);
  return (
    <Badge tone={URGENCY_TONE[urgency]} className="tabular whitespace-nowrap">
      {urgency === "danger" && <span aria-hidden>!&nbsp;</span>}
      {countdownLabel(days)}
    </Badge>
  );
}

const STATUS_TONE: Record<Status, Tone> = { Researching: "neutral", Applying: "brand", Submitted: "success", Decision: "success" };

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Layout bits
// ---------------------------------------------------------------------------

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">{eyebrow}</p>
        <h1 className="mt-2 font-mono text-[28px] leading-9 font-bold text-heading">{title}</h1>
        {description && <p className="mt-1 max-w-2xl font-mono text-sm leading-6 text-subtle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, meta, tone }: { label: string; value: ReactNode; meta?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-3 border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-sm text-subtle">{label}</p>
        {tone && meta && <Badge tone={tone}>{meta}</Badge>}
      </div>
      <p className="tabular font-mono text-[28px] leading-8 font-bold text-heading">{value}</p>
      {!tone && meta && <p className="font-mono text-xs text-subtle">{meta}</p>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border border-line bg-card p-8 sm:p-12">
      <h2 className="font-serif text-[28px] leading-8 font-semibold text-heading">{title}</h2>
      <p className="max-w-lg font-mono text-sm leading-6 text-body">{body}</p>
      {action}
    </div>
  );
}
