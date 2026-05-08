import Link from "next/link";
import { BookOpen, Gauge, GraduationCap, LogOut, Shield } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";
import { signOutAction } from "@/app/actions";

export async function AppHeader() {
  const profile = await getCurrentProfile();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
          <GraduationCap className="h-6 w-6 text-brand" />
          <span>AP Mock Exam Platform</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {profile ? (
            <>
              <Link className="hidden items-center gap-1 rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100 sm:flex" href="/dashboard">
                <Gauge className="h-4 w-4" />
                Dashboard
              </Link>
              <Link className="hidden items-center gap-1 rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100 sm:flex" href="/review">
                <BookOpen className="h-4 w-4" />
                Review
              </Link>
              {profile.role === "admin" ? (
                <Link className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-2 font-semibold text-white hover:bg-slate-800" href="/admin/questions">
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              ) : null}
              <span className="hidden text-slate-500 md:inline">{profile.email}</span>
              <form action={signOutAction}>
                <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-100">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100" href="/login">
                Log in
              </Link>
              <Link className="rounded-md bg-brand px-3 py-2 font-medium text-white hover:bg-blue-700" href="/register">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
