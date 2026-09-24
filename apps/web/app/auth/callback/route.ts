import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Google -> Supabase -> here. Exchanges the one-time code for a session, then
 * double-checks the email is still on the allowlist.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Supabase sends ?error=… when sign-up was blocked (the allowlist trigger raised an error).
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    const reason = /allowlist|invite-only|database error saving new user/i.test(providerError) ? "not_allowed" : "failed";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }
  if (!code) return NextResponse.redirect(`${origin}/login?error=failed`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=failed`);

  const { data: allowed } = await supabase.rpc("is_allowed");
  if (allowed !== true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }
  return NextResponse.redirect(`${origin}/jobs`);
}
