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
      <main className="bg-paper">
        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">AP-style practice platform</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-6xl">
              AP Mock Exam Platform
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Take timed AP-style mock exams, review explanations, track performance, and read structured review guides with math rendering.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={startHref} className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 font-semibold text-white hover:bg-blue-700">
                Start practicing
                <ArrowRight className="h-4 w-4" />
              </Link>
              {profile ? (
                <Link href="/review" className="rounded-md border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                  Review guides
                </Link>
              ) : (
                <Link href="/login" className="rounded-md border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                  Log in
                </Link>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
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
                  <div key={feature.title} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <Icon className="h-6 w-6 text-brand" />
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
