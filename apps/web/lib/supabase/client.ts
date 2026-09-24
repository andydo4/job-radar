"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for Client Components (used only to start Google sign-in). */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  return createBrowserClient(url, key);
}
