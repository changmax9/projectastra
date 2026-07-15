import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  completeSubmissionBreak,
  getExamSectionFamily,
  getExamWithQuestionSummaries,
  getExamWithSectionQuestions,
  getPlayableExamSections,
  getSubmission,
  listAnswersForSubmission
} from "@/lib/data";
import { resolveExamSectionTransition } from "@/lib/exam-flow";
import { BluebookExamClient } from "@/components/bluebook/BluebookExamClient";
import { BluebookBreakScreen } from "@/components/bluebook/BluebookBreakScreen";

export const dynamic = "force-dynamic";

export default async function TakeExamPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { submission?: string };
}) {
  const profile = await requireProfile();
  const submissionId = searchParams.submission;
  if (!submissionId) redirect(`/exam/${params.id}`);
  const submission = await getSubmission(submissionId);
  if (!submission) redirect(`/exam/${params.id}`);
  if (profile.role !== "admin" && submission.student_id !== profile.id) redirect("/dashboard");
  if (submission.status !== "in_progress" || submission.current_step === "completed") redirect(`/results/${submission.id}`);

  if (submission.current_step === "break") {
    const started = new Date(submission.break_started_at || submission.updated_at).getTime();
    if (Date.now() - started >= 10 * 60 * 1000) {
      const updated = await completeSubmissionBreak(submission.id, false);
      redirect(`/exam/${params.id}/take?submission=${updated.id}`);
    }
    return (
      <BluebookBreakScreen
        submission={submission}
        studentName={profile.full_name || profile.email.split("@")[0]}
      />
    );
  }

  const examSummary = await getExamWithQuestionSummaries(params.id);
  if (!examSummary) notFound();
  const playableSections = getPlayableExamSections(examSummary);
  const activeSectionIndex = playableSections.length
    ? Math.min(Math.max(0, submission.current_section_index || 0), playableSections.length - 1)
    : 0;
  const activeSection = playableSections.length
    ? playableSections[activeSectionIndex]
    : null;
  const sectionTransition = resolveExamSectionTransition({
    currentSectionIndex: activeSectionIndex,
    sectionFamilies: playableSections.map((section) => getExamSectionFamily(examSummary, section)),
    breakAlreadyHandled: Boolean(submission.break_completed_at || submission.break_skipped)
  });
  const [exam, answers] = await Promise.all([
    getExamWithSectionQuestions(params.id, activeSection?.section || null),
    listAnswersForSubmission(submission.id)
  ]);
  if (!exam) notFound();
  const activeRows = exam.exam_questions;
  if (activeRows.length === 0) notFound();

  const studentSafeExam = {
    ...exam,
    time_limit_minutes: submission.section_time_limit_minutes || activeSection?.timeLimitMinutes || examSummary.time_limit_minutes,
    sections: activeSection ? [activeSection] : examSummary.sections,
    exam_questions: activeRows.map((row) => ({
      ...row,
      question: {
        ...row.question,
        correct_answer: null
      }
    }))
  };

  return (
    <BluebookExamClient
      key={`${submission.id}:${activeSection?.id || activeSectionIndex}`}
      exam={studentSafeExam}
      submission={submission}
      initialAnswers={answers}
      studentName={profile.full_name || profile.email.split("@")[0]}
      testFlow={{
        sectionNumber: activeSectionIndex + 1,
        sectionCount: Math.max(1, playableSections.length),
        nextStep: sectionTransition.nextStep,
        nextSectionTitle: sectionTransition.isTestComplete
          ? null
          : playableSections[sectionTransition.nextSectionIndex]?.title || null
      }}
    />
  );
}
