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
      <main className="edu-page px-4 py-8 sm:px-6 lg:px-8">
        <div className="edu-shell">
        <div className="mb-8">
          <p className="edu-kicker">Student workspace</p>
          <h1 className="edu-heading mt-2 text-3xl">{profile.full_name || profile.email}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Continue timed practice, review completed sections, and keep your AP preparation organized by subject.
          </p>
        </div>

        {profile.role === "admin" ? (
          <section className="edu-panel mb-6 rounded-2xl">
            <div className="edu-panel-header rounded-t-2xl px-4 py-3">Admin tools</div>
            <div className="flex flex-wrap gap-3 p-4">
              <Link href="/admin/questions" className="edu-button-primary px-4 py-2 text-sm font-semibold">
                Question Bank
              </Link>
              <Link href="/admin/exams" className="edu-button-secondary px-4 py-2 text-sm font-semibold">
                Manage Exams
              </Link>
              <Link href="/admin/import" className="edu-button-secondary px-4 py-2 text-sm font-semibold">
                JSON Import
              </Link>
            </div>
          </section>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="space-y-5">
            <AvailableExamsBrowser exams={data.examDetails} submissions={data.submissions} searchParams={searchParams} />

            <div className="edu-panel rounded-2xl">
              <div className="edu-panel-header rounded-t-2xl px-4 py-3">Attempt history</div>
              <div className="space-y-3 p-4">
                {data.submissions.map((submission) => {
                  const resumable = isResumableSubmission(submission.status);
                  const href = resumable
                    ? `/exam/${submission.exam_id}/take?submission=${submission.id}`
                    : `/results/${submission.id}`;
                  const label = submissionStatusLabel(submission.status);
                  const partLabel = submissionPartLabel(submission);
                  const currentSectionLabel = submissionCurrentSectionLabel(submission);
                  return (
                    <Link key={submission.id} href={href} className="edu-card flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 transition hover:border-blue-300">
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
                            "rounded-full border px-2.5 py-1 text-xs font-bold",
                            resumable ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          )}
                        >
                          {label}
                        </span>
                        <span className="edu-button-primary px-3 py-2 text-xs font-semibold">
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
            <div className="edu-panel rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-blue-800" />
                <h2 className="font-semibold text-slate-950">Latest score</h2>
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

            <div className="edu-panel rounded-2xl p-5">
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-800" />
                <h2 className="font-semibold text-slate-950">Recommended guides</h2>
              </div>
              <div className="space-y-3">
                {data.guides.map((guide) => (
                  <Link key={guide.id} href={`/review/${guide.slug}`} className="edu-card block rounded-xl p-3 transition hover:border-blue-300">
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
