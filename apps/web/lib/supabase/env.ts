/**
 * Supabase connection settings. New Supabase projects call the browser-safe key
 * the "publishable" key (sb_publishable_…); older ones call it the "anon" key.
 * Either works. Never put the service_role / secret key in a NEXT_PUBLIC_ variable.
 */
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase settings. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "(or NEXT_PUBLIC_SUPABASE_ANON_KEY) in apps/web/.env.local and in Vercel.",
    );
  }
  return { url, key };
}
