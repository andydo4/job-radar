import type { Metadata } from "next";
import { GoogleButton } from "./google-button";

export const metadata: Metadata = { title: "Sign in · Primer" };

const ERRORS: Record<string, string> = {
  not_allowed: "Primer is invite-only, and that Google account isn't on the list. Ask Andy to add your email.",
  failed: "Sign-in didn't finish. Please try again.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? ERRORS.failed) : null;

  return (
    <main className="flex min-h-dvh flex-col bg-brand text-white">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-5 sm:px-8">
        <span className="grid size-8 place-items-center bg-white font-mono text-sm font-bold text-brand" aria-hidden>
          P
        </span>
        <span className="font-mono text-base font-semibold">Primer</span>
      </div>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-24 sm:px-8">
        <p className="mb-6 inline-flex w-fit items-center gap-2 border border-white/25 bg-brand-strong px-2 py-1 font-mono text-xs">
          <span className="bg-lime px-1.5 py-0.5 font-medium text-on-lime">New</span>
          Grad deadlines, all in one place
        </p>
        <h1 className="max-w-3xl font-serif text-[38px] font-bold leading-[44px] tracking-[-0.5px] sm:text-[54px] sm:leading-[60px]">
          Biotech jobs the moment they&apos;re posted.
        </h1>
        <p className="mt-5 max-w-xl font-mono text-sm leading-6 text-white/85 sm:text-base sm:leading-7">
          Primer watches company career pages every 10 minutes and keeps every grad school deadline counting down
          in one place.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          <GoogleButton />
          {message && (
            <p role="alert" className="max-w-md border border-danger bg-danger-soft px-4 py-3 font-mono text-sm text-danger">
              {message}
            </p>
          )}
          <p className="font-mono text-xs text-white/70">Invite-only. Two accounts, no spam, no emails.</p>
        </div>
      </section>
    </main>
  );
}
