import { notFound } from "next/navigation";
import { CheckCircle2, Clock, FileQuestion } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { startExamAction } from "@/app/actions";
import { requireProfile } from "@/lib/auth";
import { getExamWithQuestionSummaries, listStudentSubmissions } from "@/lib/data";
import type { ExamWithQuestions } from "@/lib/types";
import { isResumableSubmission } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getExamSections(exam: ExamWithQuestions) {
  return exam.sections || [];
}

function actualSectionQuestionCount(exam: ExamWithQuestions, section: string) {
  return exam.exam_questions.filter((row) => row.question.section === section).length;
}

export default async function ExamStartPage({
  params
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();
  const exam = await getExamWithQuestionSummaries(params.id);
  if (!exam) notFound();
  const submissions = await listStudentSubmissions(profile.id);
  const inProgress = submissions.find(
    (submission) =>
      submission.exam_id === exam.id &&
      isResumableSubmission(submission.status) &&
      !submission.section
  );
  const sections = getExamSections(exam);
  const hasSections = sections.length > 0;

  return (
    <>
      <AppHeader />
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),#f7f8fb] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-white/60 bg-white/70 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{exam.subject}</p>
          <h1 className="mt-3 text-3xl font-semibold text-ink">{exam.title}</h1>
          <p className="mt-3 leading-7 text-slate-600">{exam.description}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <Clock className="h-5 w-5 text-brand" />
              <p className="mt-2 text-sm text-slate-500">Time limit</p>
              <p className="font-semibold text-ink">{exam.time_limit_minutes} minutes</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <FileQuestion className="h-5 w-5 text-brand" />
              <p className="mt-2 text-sm text-slate-500">Questions</p>
              <p className="font-semibold text-ink">{exam.exam_questions.length}</p>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-brand" />
              <p className="mt-2 text-sm text-slate-500">Scoring</p>
              <p className="font-semibold text-ink">MCQ auto, FRQ pending</p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/80 p-4 text-sm leading-6 text-blue-900">
            Your work is autosaved. You can flag questions for review and submit when ready. Submitted attempts cannot be edited.
          </div>

          {hasSections ? (
            <div className="mt-6 rounded-3xl border border-white/70 bg-white/70 shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-ink">Exam flow</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sections advance automatically inside one exam attempt.
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {sections.map((section) => {
                  const count = actualSectionQuestionCount(exam, section.section);
                  return (
                    <div
                      key={section.id}
                      className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-medium text-ink">{section.title}</p>
                        <p className="text-slate-500">
                          {count > 0
                            ? `${count} questions · ${section.timeLimitMinutes} minutes · ${section.calculatorAllowed ? "Calculator Allowed" : "No Calculator"}`
                            : /FRQ|Free Response/i.test(`${section.section} ${section.title}`)
                              ? "Free Response section not available yet"
                              : "Section not available yet"}
                        </p>
                      </div>
                      {count === 0 ? (
                        <span className="self-start rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
                          No questions imported yet
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <form action={startExamAction} className="mt-6">
            <input type="hidden" name="exam_id" value={exam.id} />
            <button className="rounded-full bg-slate-950 px-6 py-3 font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl">
              {inProgress ? "Resume Exam" : "Start Exam"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
