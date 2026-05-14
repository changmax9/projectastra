import Link from "next/link";
import { BookOpen, Trophy } from "lucide-react";
import { AvailableExamsBrowser } from "@/components/exam/AvailableExamsBrowser";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireProfile } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/data";
import {
  cn,
  formatFriendlyDuration,
  isResumableSubmission,
  submissionCurrentSectionLabel,
  submissionPartLabel,
  submissionScoreLabel,
  submissionStatusLabel
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: {
    subject?: string;
    course?: string;
    year?: string;
    section?: string;
    examType?: string;
    topic?: string;
    difficulty?: string;
    search?: string;
  };
}) {
  const profile = await requireProfile();
  const data = await getStudentDashboard(profile.id);

  return (
    <>
      <AppHeader />
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),#f7f8fb] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm text-slate-500">Welcome back</p>
          <h1 className="text-3xl font-semibold text-ink">{profile.full_name || profile.email}</h1>
        </div>

        {profile.role === "admin" ? (
          <section className="mb-6 rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Admin tools</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/admin/questions" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl">
                Question Bank
              </Link>
              <Link href="/admin/exams" className="rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 backdrop-blur-xl transition hover:bg-white/90">
                Manage Exams
              </Link>
              <Link href="/admin/import" className="rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 backdrop-blur-xl transition hover:bg-white/90">
                JSON Import
              </Link>
            </div>
          </section>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="space-y-5">
            <AvailableExamsBrowser exams={data.examDetails} submissions={data.submissions} searchParams={searchParams} />

            <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <h2 className="text-xl font-semibold text-ink">History</h2>
              <div className="mt-4 space-y-3">
                {data.submissions.map((submission) => {
                  const resumable = isResumableSubmission(submission.status);
                  const href = resumable
                    ? `/exam/${submission.exam_id}/take?submission=${submission.id}`
                    : `/results/${submission.id}`;
                  const label = submissionStatusLabel(submission.status);
                  const partLabel = submissionPartLabel(submission);
                  const currentSectionLabel = submissionCurrentSectionLabel(submission);
                  return (
                    <Link key={submission.id} href={href} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-white">
                      <div>
                        <p className="font-medium text-ink">{submission.exam?.title || "Exam"}</p>
                        {resumable && currentSectionLabel ? (
                          <p className="text-sm font-medium text-slate-700">Current section: {currentSectionLabel}</p>
                        ) : partLabel ? (
                          <p className="text-sm font-medium text-slate-700">{partLabel}</p>
                        ) : null}
                        <p className="text-sm text-slate-500">
                          {submission.exam?.course ? `${submission.exam.course} · ` : ""}
                          {formatFriendlyDuration(submission.time_spent_seconds)}
                          {!resumable ? ` · ${submissionScoreLabel(submission)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium",
                            resumable ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          )}
                        >
                          {label}
                        </span>
                        <span className="rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/10">
                          {resumable ? "Resume" : "Review Results"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {data.submissions.length === 0 ? <p className="text-sm text-slate-500">No attempts yet.</p> : null}
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-brand" />
                <h2 className="font-semibold text-ink">Latest score</h2>
              </div>
              {data.latestSubmission ? (
                <div className="mt-4">
                  <p className="text-4xl font-semibold text-ink">{data.latestSubmission.percentage}%</p>
                  <p className="mt-1 text-sm text-slate-500">{data.latestSubmission.total_score}/{data.latestSubmission.max_score} points</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Submit an exam to see your latest score.</p>
              )}
            </div>

            <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-brand" />
                <h2 className="font-semibold text-ink">Recommended guides</h2>
              </div>
              <div className="space-y-3">
                {data.guides.map((guide) => (
                  <Link key={guide.id} href={`/review/${guide.slug}`} className="block rounded-3xl border border-white/70 bg-white/80 p-3 shadow-sm transition hover:bg-white">
                    <p className="font-medium text-ink">{guide.title}</p>
                    <p className="text-sm text-slate-500">{guide.estimated_reading_time_minutes} min · {guide.topic}</p>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
        </div>
      </main>
    </>
  );
}
