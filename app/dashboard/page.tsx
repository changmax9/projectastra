import Link from "next/link";
import { BookOpen, ClipboardList, GraduationCap, Trophy } from "lucide-react";
import { AvailableExamsBrowser } from "@/components/exam/AvailableExamsBrowser";
import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicPageShell } from "@/components/layout/AcademicPageShell";
import { DashboardPanel } from "@/components/ui-custom/DashboardPanel";
import { EmptyState } from "@/components/ui-custom/StateBlock";
import { MetricCard } from "@/components/ui-custom/MetricCard";
import { PageHeader } from "@/components/ui-custom/PageHeader";
import { StatusBadge } from "@/components/ui-custom/StatusBadge";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/data";
import {
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
  const inProgress = data.submissions.filter((submission) => isResumableSubmission(submission.status));

  return (
    <>
      <AppHeader />
      <AcademicPageShell className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Student portal"
          title={profile.full_name || profile.email}
          description="Continue timed practice, monitor completed work, and keep your AP preparation organized by subject and exam set."
          actions={
            profile.role === "admin" ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/admin/questions">Question Bank</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/admin/exams">Manage Exams</Link>
                </Button>
              </div>
            ) : null
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Available exams" value={data.examDetails.length} helper="Published exam sets" icon={ClipboardList} />
          <MetricCard label="In progress" value={inProgress.length} helper="Saved attempts ready to resume" icon={GraduationCap} tone="gold" />
          <MetricCard
            label="Latest score"
            value={data.latestSubmission ? `${data.latestSubmission.percentage}%` : "—"}
            helper={data.latestSubmission ? `${data.latestSubmission.total_score}/${data.latestSubmission.max_score} points` : "Submit an exam to see results"}
            icon={Trophy}
            tone="blue"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="flex flex-col gap-6">
            <AvailableExamsBrowser exams={data.examDetails} submissions={data.submissions} searchParams={searchParams} />

            <DashboardPanel title="Attempt history" description="Resume active work or review completed reports.">
              <div className="flex flex-col gap-3">
                {data.submissions.map((submission) => {
                  const resumable = isResumableSubmission(submission.status);
                  const href = resumable
                    ? `/exam/${submission.exam_id}/take?submission=${submission.id}`
                    : `/results/${submission.id}`;
                  const partLabel = submissionPartLabel(submission);
                  const currentSectionLabel = submissionCurrentSectionLabel(submission);
                  const statusKey = submission.status;
                  return (
                    <Link
                      key={submission.id}
                      href={href}
                      className="group rounded-[1.5rem] border border-white/70 bg-white/78 p-4 shadow-inner transition hover:border-sky-200/90 hover:bg-white"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-astra-navy">{submission.exam?.title || "Exam"}</p>
                          {resumable && currentSectionLabel ? (
                            <p className="mt-1 text-sm font-medium text-astra-slate">Current section: {currentSectionLabel}</p>
                          ) : partLabel ? (
                            <p className="mt-1 text-sm font-medium text-astra-slate">{partLabel}</p>
                          ) : null}
                          <p className="mt-1 text-sm text-slate-500">
                            {submission.exam?.course ? `${submission.exam.course} · ` : ""}
                            {formatFriendlyDuration(submission.time_spent_seconds)}
                            {!resumable ? ` · ${submissionScoreLabel(submission)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={statusKey}>{submissionStatusLabel(statusKey)}</StatusBadge>
                          <span className="rounded-full bg-astra-navy px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-22px_rgba(6,18,37,0.86)]">
                            {resumable ? "Resume" : "Review Results"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {data.submissions.length === 0 ? (
                  <EmptyState
                    title="No attempts yet"
                    description="Start an available exam to create your first saved attempt."
                    action={
                      <Button asChild>
                        <Link href="/available-exams">Browse exams</Link>
                      </Button>
                    }
                  />
                ) : null}
              </div>
            </DashboardPanel>
          </section>

          <aside className="flex flex-col gap-6">
            <DashboardPanel title="Recommended guides" description="Fast review before your next section.">
              <div className="flex flex-col gap-3">
                {data.guides.map((guide) => (
                  <Link key={guide.id} href={`/review/${guide.slug}`} className="rounded-[1.5rem] border border-white/70 bg-white/78 p-4 shadow-inner transition hover:border-sky-200/90 hover:bg-white">
                    <p className="font-semibold text-astra-navy">{guide.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{guide.estimated_reading_time_minutes} min · {guide.topic}</p>
                  </Link>
                ))}
                {data.guides.length === 0 ? (
                  <EmptyState title="No guides yet" description="Published review guides will appear here." icon={BookOpen} />
                ) : null}
              </div>
            </DashboardPanel>

            <DashboardPanel title="Study posture" description="Keep the current attempt focused.">
              <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(6,18,37,0.92)] p-5 text-white shadow-[0_22px_70px_-48px_rgba(6,18,37,0.82)] backdrop-blur-2xl">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-astra-gold">Exam rule</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Work through the active section, save when needed, and return to results only after submitting.
                </p>
              </div>
            </DashboardPanel>
          </aside>
        </div>
      </AcademicPageShell>
    </>
  );
}
