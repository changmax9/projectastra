import { notFound } from "next/navigation";
import { CheckCircle2, Clock, FileQuestion } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicPageShell } from "@/components/layout/AcademicPageShell";
import { SectionTimeline } from "@/components/exam/SectionTimeline";
import { startExamAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
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
      <AcademicPageShell variant="exam" className="max-w-6xl">
        <section className="glass-panel rounded-[2.25rem]">
          <div className="navy-band rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-astra-gold">{exam.subject} · {exam.course} · {exam.year || "No year"}</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight tracking-tight text-astra-warm">{exam.title}</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-200">{exam.description}</p>
          </div>
          <div className="p-6 sm:p-8">

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="glass-solid rounded-[1.5rem] p-4">
              <Clock className="h-5 w-5 text-blue-800" />
              <p className="mt-2 text-sm text-slate-500">Time limit</p>
              <p className="font-semibold text-ink">{exam.time_limit_minutes} minutes</p>
            </div>
            <div className="glass-solid rounded-[1.5rem] p-4">
              <FileQuestion className="h-5 w-5 text-blue-800" />
              <p className="mt-2 text-sm text-slate-500">Questions</p>
              <p className="font-semibold text-ink">{exam.exam_questions.length}</p>
            </div>
            <div className="glass-solid rounded-[1.5rem] p-4">
              <CheckCircle2 className="h-5 w-5 text-blue-800" />
              <p className="mt-2 text-sm text-slate-500">Scoring</p>
              <p className="font-semibold text-ink">MCQ auto, FRQ pending</p>
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-sky-100 bg-sky-50/82 p-4 text-sm leading-6 text-astra-blue">
            Your work is autosaved. You can flag questions for review and submit when ready. Submitted attempts cannot be edited.
          </div>

          {hasSections ? (
            <div className="mt-6 rounded-[1.75rem] border border-white/70 bg-white/76 p-4 shadow-inner">
              <div className="mb-4 border-b border-astra-navy/10 pb-3">
                <h2 className="edu-heading text-xl">Exam flow</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sections advance automatically inside one exam attempt.
                </p>
              </div>
              <SectionTimeline
                sections={sections.map((section) => ({
                  ...section,
                  questionCount: actualSectionQuestionCount(exam, section.section)
                }))}
              />
              <div className="mt-4 divide-y divide-slate-100">
                {sections.filter((section) => actualSectionQuestionCount(exam, section.section) === 0).map((section) => {
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
            <Button size="lg" className="rounded-full bg-astra-navy px-8 text-white shadow-[0_18px_38px_-26px_rgba(6,18,37,0.88)] hover:bg-astra-blue">
              {inProgress ? "Resume Exam" : "Start Exam"}
            </Button>
          </form>
          </div>
        </section>
      </AcademicPageShell>
    </>
  );
}
