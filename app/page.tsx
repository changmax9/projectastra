import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, ClipboardList, Save, Timer } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const startHref = profile ? "/dashboard" : "/register";

  return (
    <>
      <AppHeader />
      <main className="edu-page">
        <section className="edu-shell px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="edu-terminal-bar rounded-xl px-4 py-3">
            ASTRA/AP-TERMINAL · timed sections online · autosave enabled · structured math/image rendering
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="edu-panel rounded-2xl">
              <div className="edu-panel-header rounded-t-2xl px-5 py-3">Command center</div>
              <div className="p-5 sm:p-7">
                <p className="edu-kicker">AP practice workspace</p>
                <h1 className="edu-heading mt-3 max-w-3xl text-3xl leading-tight sm:text-4xl">
                  Start, resume, and review AP-style practice from one focused terminal.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  A structured testing interface for timed AP sections, clean math rendering, necessary figures, and section-by-section results.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href={startHref} className="edu-button-primary inline-flex items-center gap-2 px-5 py-3 font-semibold">
                    {profile ? "Open dashboard" : "Create student account"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {profile ? (
                    <Link href="/review" className="edu-button-secondary px-5 py-3 font-semibold">
                      Review guides
                    </Link>
                  ) : (
                    <Link href="/login" className="edu-button-secondary px-5 py-3 font-semibold">
                      Log in
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="edu-panel rounded-2xl">
              <div className="edu-panel-header rounded-t-2xl px-5 py-3">System modules</div>
              <div className="grid gap-0 divide-y divide-slate-200">
              {[
                {
                  icon: ClipboardList,
                  title: "Mock Exams",
                  body: "Section timers, MCQ/FRQ flow, flagging, and answer persistence."
                },
                {
                  icon: BookOpen,
                  title: "Review Guides",
                  body: "Structured Markdown/LaTeX study material linked to practice topics."
                },
                {
                  icon: BarChart3,
                  title: "Performance Tracking",
                  body: "Score reports, weak-topic summaries, and admin submission review."
                }
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="grid grid-cols-[40px_1fr] gap-3 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-900">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="font-semibold text-slate-950">{feature.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{feature.body}</p>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            {[
              { icon: Timer, label: "AP-style timed sections" },
              { icon: Save, label: "Autosave + resume" },
              { icon: CheckCircle2, label: "Structured text, math, and figures" }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="edu-card flex items-center gap-3 rounded-xl px-4 py-3">
                  <Icon className="h-4 w-4 text-blue-900" />
                  <span className="edu-meta">{item.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
