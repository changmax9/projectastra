import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, ClipboardList } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const startHref = profile ? "/dashboard" : "/register";

  return (
    <>
      <AppHeader />
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),#f7f8fb]">
        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">AP-style practice platform</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-6xl">
              AP Mock Exam Platform
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Take timed AP-style mock exams, review explanations, track performance, and read structured review guides with math rendering.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={startHref} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl">
                Start practicing
                <ArrowRight className="h-4 w-4" />
              </Link>
              {profile ? (
                <Link href="/review" className="rounded-full border border-slate-200/80 bg-white/70 px-5 py-3 font-semibold text-slate-700 backdrop-blur-xl transition hover:bg-white/90">
                  Review guides
                </Link>
              ) : (
                <Link href="/login" className="rounded-full border border-slate-200/80 bg-white/70 px-5 py-3 font-semibold text-slate-700 backdrop-blur-xl transition hover:bg-white/90">
                  Log in
                </Link>
              )}
            </div>
          </div>
          <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <div className="grid gap-4">
              {[
                {
                  icon: ClipboardList,
                  title: "Mock Exams",
                  body: "Timed exams with MCQ, FRQ, question images, answer autosave, flagging, and submission scoring."
                },
                {
                  icon: BookOpen,
                  title: "Review Guides",
                  body: "Markdown study guides with tables, callouts, LaTeX, and linked practice questions."
                },
                {
                  icon: BarChart3,
                  title: "Performance Tracking",
                  body: "Students see history and explanations; admins can inspect submissions and answer-level data."
                }
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h2 className="mt-3 font-semibold text-ink">{feature.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{feature.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
