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
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Practice workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">{profile.full_name || profile.email}</h1>
            <p className="mt-1 text-sm text-slate-500">Resume attempts, start a sectioned exam, or review your latest work.</p>
          </div>
          <Link href="/available-exams" className="app-secondary px-4 py-2 text-sm font-semibold">
            Browse exams
          </Link>
        </div>

        {profile.role === "admin" ? (
          <section className="app-surface mb-6 rounded-lg p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Admin tools</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/admin/questions" className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                Question Bank
              </Link>
              <Link href="/admin/exams" className="app-secondary px-4 py-2 text-sm font-semibold">
                Manage Exams
              </Link>
              <Link href="/admin/import" className="app-secondary px-4 py-2 text-sm font-semibold">
                JSON Import
              </Link>
            </div>
          </section>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="space-y-5">
            <AvailableExamsBrowser exams={data.examDetails} submissions={data.submissions} searchParams={searchParams} />

            <div className="app-surface rounded-lg p-5">
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
                    <Link key={submission.id} href={href} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-100 bg-[#fbfdff] p-3 hover:bg-slate-50">
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
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            resumable ? "bg-amber-50 text-amber-700" : "bg-accent-soft text-accent"
                          )}
                        >
                          {label}
                        </span>
                        <span className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">
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
            <div className="app-surface rounded-lg p-5">
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

            <div className="app-surface rounded-lg p-5">
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-brand" />
                <h2 className="font-semibold text-ink">Recommended guides</h2>
              </div>
              <div className="space-y-3">
                {data.guides.map((guide) => (
                  <Link key={guide.id} href={`/review/${guide.slug}`} className="block rounded-md border border-slate-100 bg-[#fbfdff] p-3 hover:bg-slate-50">
                    <p className="font-medium text-ink">{guide.title}</p>
                    <p className="text-sm text-slate-500">{guide.estimated_reading_time_minutes} min · {guide.topic}</p>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
