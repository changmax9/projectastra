import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ResultQuestionReview } from "@/components/exam/ResultQuestionReview";
import { requireProfile } from "@/lib/auth";
import { filterExamQuestionsForSubmission, getExamWithQuestions, getSubmissionDetail } from "@/lib/data";
import { formatFriendlyDuration, percentage, submissionPartLabel, submissionStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: { submissionId: string } }) {
  const profile = await requireProfile();
  const detail = await getSubmissionDetail(params.submissionId);
  if (!detail) notFound();
  if (profile.role !== "admin" && detail.student_id !== profile.id) redirect("/dashboard");
  const exam = await getExamWithQuestions(detail.exam_id, true);
  if (!exam) notFound();
  const answerByQuestion = new Map(detail.answers.map((answer) => [answer.question_id, answer]));
  const rowsForSubmission = filterExamQuestionsForSubmission(exam, detail);
  const gradedRows = rowsForSubmission.filter((row) => row.question.type === "mcq");
  const frqRows = rowsForSubmission.filter((row) => row.question.type === "frq");
  const hasMcq = gradedRows.length > 0;
  const hasOnlyFrq = !hasMcq && frqRows.length > 0;
  const correctCount = gradedRows.filter((row) => answerByQuestion.get(row.question_id)?.is_correct).length;
  const derivedMaxScore = rowsForSubmission.reduce((sum, row) => sum + (row.points_override ?? row.question.points), 0);
  const displayTotalScore = detail.max_score > 0 ? detail.total_score : correctCount;
  const displayMaxScore = detail.max_score > 0 ? detail.max_score : derivedMaxScore;
  const displayPercentage = detail.max_score > 0 ? detail.percentage : percentage(displayTotalScore, displayMaxScore);
  const sectionSummaries = exam.sections?.length
    ? exam.sections
        .map((section) => {
          const rows = rowsForSubmission.filter((row) => row.question.section === section.section);
          if (rows.length === 0) return null;
          const mcqRows = rows.filter((row) => row.question.type === "mcq");
          const frqCount = rows.filter((row) => row.question.type === "frq").length;
          const progress = detail.sections_progress?.find((item) => item.section === section.section);
          const scoreCorrect =
            progress?.scoreCorrect ??
            mcqRows.filter((row) => answerByQuestion.get(row.question_id)?.is_correct).length;
          const scoreTotal = progress?.scoreTotal ?? mcqRows.length;
          return {
            section,
            mcqCount: mcqRows.length,
            frqCount,
            scoreCorrect,
            scoreTotal
          };
        })
        .filter(Boolean)
    : [];
  const topicStats = gradedRows.reduce<Record<string, { total: number; missed: number }>>((stats, row) => {
    const topic = row.question.topic || "Uncategorized";
    const answer = answerByQuestion.get(row.question_id);
    stats[topic] ||= { total: 0, missed: 0 };
    stats[topic].total += 1;
    if (!answer?.is_correct) stats[topic].missed += 1;
    return stats;
  }, {});
  const weakTopics = Object.entries(topicStats)
    .filter(([, stat]) => stat.missed > 0)
    .sort((a, b) => b[1].missed / b[1].total - a[1].missed / a[1].total);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-brand">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
          <p className="text-sm text-slate-500">{detail.exam?.subject}</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">{detail.exam?.title || "Exam result"}</h1>
          {submissionPartLabel(detail) ? (
            <p className="mt-2 text-lg font-medium text-slate-700">{submissionPartLabel(detail)}</p>
          ) : null}
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-md bg-blue-50 p-4">
              <p className="text-sm text-blue-700">Percentage</p>
              <p className="mt-1 text-3xl font-semibold text-ink">{hasOnlyFrq ? "Pending" : `${displayPercentage}%`}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Score</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {hasOnlyFrq ? `${frqRows.length} FRQ submitted` : `${displayTotalScore}/${displayMaxScore}`}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Time spent</p>
              <p className="mt-1 text-xl font-semibold text-ink">{formatFriendlyDuration(detail.time_spent_seconds)}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Status</p>
              <p className="mt-1 text-xl font-semibold text-ink">{submissionStatusLabel(detail.status)}</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">Performance summary</h2>
              <p className="mt-1 text-sm text-slate-500">
                {hasMcq
                  ? `${correctCount}/${gradedRows.length} multiple-choice questions correct.`
                  : `${frqRows.length} free-response question${frqRows.length === 1 ? "" : "s"} submitted. Manual grading pending.`}
              </p>
            </div>
          </div>
          {sectionSummaries.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {sectionSummaries.map((summary) => {
                if (!summary) return null;
                return (
                  <div key={summary.section.id} className="rounded-md border border-slate-200 p-4">
                    <p className="font-medium text-ink">{summary.section.title}</p>
                    {summary.mcqCount > 0 ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Score: {summary.scoreCorrect}/{summary.scoreTotal}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">
                        Manual grading pending · {summary.frqCount} response{summary.frqCount === 1 ? "" : "s"} submitted
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
          {hasMcq ? (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries(topicStats).map(([topic, stat]) => (
                  <div key={topic} className="rounded-md border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">{topic}</p>
                      <p className="text-sm text-slate-500">{stat.total - stat.missed}/{stat.total}</p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-brand"
                        style={{ width: `${Math.round(((stat.total - stat.missed) / stat.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {weakTopics.length > 0 ? (
                <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
                  Weak topics: {weakTopics.map(([topic]) => topic).join(", ")}
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-4 rounded-md bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              This free-response part has been submitted and is waiting for manual grading.
            </div>
          )}
        </section>

        <div className="mt-6 space-y-5">
          {rowsForSubmission.map((row, index) => {
            const answer = detail.answers.find((item) => item.question_id === row.question_id) || null;
            return <ResultQuestionReview key={row.id} answer={answer} question={row.question} index={index} />;
          })}
        </div>
      </main>
    </>
  );
}
