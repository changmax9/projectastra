import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, ClipboardList, Timer } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const startHref = profile ? "/dashboard" : "/register";

  return (
    <>
      <AppHeader />
      <main>
        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">AP-style practice workspace</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              AP Mock Exam Platform
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Timed sections, structured question content, autosave, and review tools in one quiet workspace for AP practice.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={startHref} className="app-primary inline-flex items-center gap-2 px-5 py-3 font-semibold">
                Start practicing
                <ArrowRight className="h-4 w-4" />
              </Link>
              {profile ? (
                <Link href="/review" className="app-secondary px-5 py-3 font-semibold">
                  Review guides
                </Link>
              ) : (
                <Link href="/login" className="app-secondary px-5 py-3 font-semibold">
                  Log in
                </Link>
              )}
            </div>
            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ["107", "structured questions"],
                ["8", "exam sections"],
                ["45", "diagram assets"]
              ].map(([value, label]) => (
                <div key={label} className="app-chip px-4 py-3">
                  <p className="text-2xl font-semibold text-ink">{value}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="app-surface rounded-lg p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-sm font-semibold text-ink">AP Calculus AB 2019</p>
                <p className="text-sm text-slate-500">Multiple Choice - Part A</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                <Timer className="h-3.5 w-3.5" />
                42:18
              </span>
            </div>
            <div className="mt-5 space-y-4">
              {[
                { icon: ClipboardList, title: "Mock Exams", body: "Timed MCQ and FRQ sections with autosave, flagging, and section progress." },
                { icon: BookOpen, title: "Review Guides", body: "Markdown, tables, callouts, and LaTeX render as editable structured content." },
                { icon: BarChart3, title: "Performance Tracking", body: "Attempts, results, and admin review stay tied to the same data layer." }
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-4 rounded-md border border-slate-100 bg-[#fbfdff] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-semibold text-ink">{feature.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{feature.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-md bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              Supabase production data with local mock fallback
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
