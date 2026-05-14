import { NextResponse } from "next/server";
import { exchangeSupabaseCodeForAppSession } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing-code", url.origin));
  }

  try {
    await exchangeSupabaseCodeForAppSession(code);
  } catch (error) {
    console.warn("Supabase auth callback failed:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }

  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/dashboard", url.origin));
}
