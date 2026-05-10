import Link from "next/link";
import { BookOpen, Gauge, GraduationCap, LogOut, Shield } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { signOutAction } from "@/app/actions";

export async function AppHeader() {
  const profile = await getCurrentProfile();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#fbfdff]/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="mx-auto flex w-screen max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold text-ink sm:gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-sm sm:hidden">AP Mock</span>
            <span className="hidden text-base sm:block">AP Mock Exam Platform</span>
            <span className="hidden text-xs font-medium text-slate-500 sm:block">Structured practice workspace</span>
          </span>
        </Link>
        <nav className="fixed right-3 top-3 flex shrink-0 items-center gap-1 text-sm sm:static sm:gap-2">
          {profile ? (
            <>
              <Link className="hidden items-center gap-1 rounded-md px-3 py-2 font-medium text-slate-700 hover:bg-slate-100 sm:flex" href="/dashboard">
                <Gauge className="h-4 w-4" />
                Dashboard
              </Link>
              <Link className="hidden items-center gap-1 rounded-md px-3 py-2 font-medium text-slate-700 hover:bg-slate-100 sm:flex" href="/review">
                <BookOpen className="h-4 w-4" />
                Review
              </Link>
              {profile.role === "admin" ? (
                <Link className="inline-flex items-center gap-1 rounded-md bg-ink px-3 py-2 font-semibold text-white hover:bg-slate-800" href="/admin/questions">
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              ) : null}
              <span className="hidden text-slate-500 md:inline">{profile.email}</span>
              <form action={signOutAction}>
                <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="rounded-md px-2 py-2 font-medium text-slate-700 hover:bg-slate-100 sm:px-3" href="/login">
                Log in
              </Link>
              <Link className="app-primary hidden px-3 py-2 font-semibold sm:inline-flex" href="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
