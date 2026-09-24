"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function signIn() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setPending(false);
      router.push("/login?error=failed");
    }
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={pending}
      className="inline-flex h-11 w-fit items-center gap-3 bg-white px-5 font-mono text-sm font-medium text-brand transition-colors duration-100 hover:bg-brand-softer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime disabled:opacity-70"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-4">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
      </svg>
      {pending ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
