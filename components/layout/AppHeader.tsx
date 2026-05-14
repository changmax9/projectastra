import Link from "next/link";
import { BookOpen, Gauge, GraduationCap, LogOut, Settings, Shield } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { signOutAction } from "@/app/actions";

export async function AppHeader() {
  const profile = await getCurrentProfile();

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 shadow-[0_12px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/70 bg-white/80 shadow-sm">
            <GraduationCap className="h-5 w-5 text-brand" />
          </span>
          <span>AP Mock Exam Platform</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {profile ? (
            <>
              <Link className="hidden items-center gap-1 rounded-full px-3 py-2 text-slate-700 transition hover:bg-white/80 sm:flex" href="/dashboard">
                <Gauge className="h-4 w-4" />
                Dashboard
              </Link>
              <Link className="hidden items-center gap-1 rounded-full px-3 py-2 text-slate-700 transition hover:bg-white/80 sm:flex" href="/review">
                <BookOpen className="h-4 w-4" />
                Review
              </Link>
              <Link className="hidden items-center gap-1 rounded-full px-3 py-2 text-slate-700 transition hover:bg-white/80 md:flex" href="/settings">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              {profile.role === "admin" ? (
                <Link className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-2 font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl" href="/admin/questions">
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              ) : null}
              <span className="hidden text-slate-500 md:inline">{profile.email}</span>
              <form action={signOutAction}>
                <button className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 px-3 py-2 text-slate-700 backdrop-blur-xl transition hover:bg-white/90">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="rounded-full px-3 py-2 text-slate-700 transition hover:bg-white/80" href="/login">
                Log in
              </Link>
              <Link className="rounded-full bg-slate-950 px-4 py-2 font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl" href="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
