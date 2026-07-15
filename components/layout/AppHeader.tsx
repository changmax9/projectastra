import Link from "next/link";
import { BookOpen, Gauge, LogOut, Settings, Shield } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { signOutAction } from "@/app/actions";
import { AstraLogo } from "@/components/brand/AstraLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function initials(email: string, name?: string | null) {
  if (name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }
  return email.slice(0, 2).toUpperCase();
}

export async function AppHeader() {
  const profile = await getCurrentProfile();

  return (
    <header className="sticky top-0 z-30 px-3 py-3 sm:px-5">
      <div className="glass-panel mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-full px-3 py-2 text-astra-navy sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <AstraLogo className="size-10 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-black">Astra Exams</span>
            <span className="hidden text-xs text-slate-600 sm:block">AP practice testing</span>
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-2">
          {profile ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden rounded-full text-astra-slate hover:bg-white/70 hover:text-astra-navy sm:inline-flex">
                <Link href="/dashboard">
                  <Gauge data-icon="inline-start" />
                  Dashboard
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="hidden rounded-full text-astra-slate hover:bg-white/70 hover:text-astra-navy sm:inline-flex">
                <Link href="/review">
                  <BookOpen data-icon="inline-start" />
                  Review
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="hidden rounded-full text-astra-slate hover:bg-white/70 hover:text-astra-navy md:inline-flex">
                <Link href="/settings">
                  <Settings data-icon="inline-start" />
                  Settings
                </Link>
              </Button>
              {profile.role === "admin" ? (
                <Button asChild size="sm" className="rounded-full bg-astra-navy text-white shadow-[0_14px_28px_-22px_rgba(6,18,37,0.9)] hover:bg-astra-blue">
                  <Link href="/admin/questions">
                    <Shield data-icon="inline-start" />
                    Admin
                  </Link>
                </Button>
              ) : null}
              <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/58 py-1 pl-1 pr-3 shadow-inner lg:flex">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-astra-navy text-xs font-black text-white">
                    {initials(profile.email, profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[190px] truncate text-xs text-slate-600">{profile.email}</span>
              </div>
              <form action={signOutAction}>
                <Button variant="outline" size="sm" className="rounded-full border-white/70 bg-white/58 text-astra-slate hover:bg-white/85 hover:text-astra-navy">
                  <LogOut data-icon="inline-start" />
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="rounded-full text-astra-slate hover:bg-white/70 hover:text-astra-navy">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full bg-astra-navy text-white shadow-[0_14px_28px_-22px_rgba(6,18,37,0.9)] hover:bg-astra-blue">
                <Link href="/register">Register</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
