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
      <main className="edu-page px-4 py-10 sm:px-6 lg:px-8">
        <div className="edu-shell">
        <div className="edu-terminal-bar rounded-xl px-4 py-3">
          EXAM/START · {exam.course} · {exam.year || "NO-YEAR"} · {exam.exam_type}
        </div>
        <div className="edu-panel mt-4 rounded-2xl">
          <div className="edu-panel-header rounded-t-2xl px-5 py-3">Pre-exam briefing</div>
          <div className="p-6 sm:p-8">
          <p className="edu-kicker">{exam.subject}</p>
          <h1 className="edu-heading mt-3 text-3xl">{exam.title}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">{exam.description}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="edu-card rounded-xl p-4">
              <Clock className="h-5 w-5 text-blue-800" />
              <p className="mt-2 text-sm text-slate-500">Time limit</p>
              <p className="font-semibold text-ink">{exam.time_limit_minutes} minutes</p>
            </div>
            <div className="edu-card rounded-xl p-4">
              <FileQuestion className="h-5 w-5 text-blue-800" />
              <p className="mt-2 text-sm text-slate-500">Questions</p>
              <p className="font-semibold text-ink">{exam.exam_questions.length}</p>
            </div>
            <div className="edu-card rounded-xl p-4">
              <CheckCircle2 className="h-5 w-5 text-blue-800" />
              <p className="mt-2 text-sm text-slate-500">Scoring</p>
              <p className="font-semibold text-ink">MCQ auto, FRQ pending</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            Your work is autosaved. You can flag questions for review and submit when ready. Submitted attempts cannot be edited.
          </div>

          {hasSections ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="edu-heading text-xl">Exam flow</h2>
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
            <button className="edu-button-primary px-6 py-3 font-semibold">
              {inProgress ? "Resume Exam" : "Start Exam"}
            </button>
          </form>
          </div>
        </div>
        </div>
      </main>
    </>
  );
}
