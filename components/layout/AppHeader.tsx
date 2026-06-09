import Link from "next/link";
import { BookOpen, Gauge, GraduationCap, LogOut, Settings, Shield } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { signOutAction } from "@/app/actions";

export async function AppHeader() {
  const profile = await getCurrentProfile();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-300 bg-white/95 backdrop-blur">
      <div className="edu-shell flex items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 font-semibold text-ink">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50">
            <GraduationCap className="h-5 w-5 text-blue-800" />
          </span>
          <span className="font-mono text-sm font-black uppercase tracking-[0.16em] text-slate-950">Astra AP</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {profile ? (
            <>
              <Link className="hidden items-center gap-1 rounded-lg px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 sm:flex" href="/dashboard">
                <Gauge className="h-4 w-4" />
                Dashboard
              </Link>
              <Link className="hidden items-center gap-1 rounded-lg px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 sm:flex" href="/review">
                <BookOpen className="h-4 w-4" />
                Review
              </Link>
              <Link className="hidden items-center gap-1 rounded-lg px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100 md:flex" href="/settings">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              {profile.role === "admin" ? (
                <Link className="inline-flex items-center gap-1 rounded-lg border border-blue-900 bg-blue-950 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-white" href="/admin/questions">
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              ) : null}
              <span className="hidden font-mono text-xs text-slate-500 md:inline">{profile.email}</span>
              <form action={signOutAction}>
                <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="rounded-lg px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100" href="/login">
                Log in
              </Link>
              <Link className="rounded-lg bg-slate-950 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-white transition hover:bg-blue-950" href="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
