import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  completeSubmissionBreak,
  getExamWithQuestions,
  getPlayableExamSections,
  getSubmission,
  listAnswersForSubmission
} from "@/lib/data";
import { TakeExamClient } from "@/components/exam/TakeExamClient";
import { BreakScreenClient } from "@/components/exam/BreakScreenClient";

export const dynamic = "force-dynamic";

export default async function TakeExamPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { submission?: string };
}) {
  const profile = await requireProfile();
  const exam = await getExamWithQuestions(params.id);
  if (!exam) notFound();
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
    return <BreakScreenClient submission={submission} />;
  }

  const answers = await listAnswersForSubmission(submission.id);
  const playableSections = getPlayableExamSections(exam);
  const activeSection = playableSections.length
    ? playableSections[Math.min(Math.max(0, submission.current_section_index || 0), playableSections.length - 1)]
    : null;
  const activeRows = activeSection
    ? exam.exam_questions.filter((row) => row.question.section === activeSection.section)
    : exam.exam_questions;
  if (activeRows.length === 0) notFound();

  const studentSafeExam = {
    ...exam,
    time_limit_minutes: submission.section_time_limit_minutes || activeSection?.timeLimitMinutes || exam.time_limit_minutes,
    sections: activeSection ? [activeSection] : exam.sections,
    exam_questions: activeRows.map((row) => ({
      ...row,
      question: {
        ...row.question,
        correct_answer: null
      }
    }))
  };

  return <TakeExamClient exam={studentSafeExam} submission={submission} initialAnswers={answers} />;
}
