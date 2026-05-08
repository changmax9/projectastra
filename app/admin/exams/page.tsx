import Link from "next/link";
import {
  adminAddQuestionToExamAction,
  adminDeleteExamAction,
  adminRemoveExamQuestionAction,
  adminReorderExamQuestionAction,
  adminSaveExamAction
} from "@/app/actions";
import { adminListExams, getExamWithQuestionSummaries, listQuestionsPage } from "@/lib/data";
import type { ExamStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminExamsPage({
  searchParams
}: {
  searchParams: {
    subject?: string;
    course?: string;
    year?: string;
    section?: string;
    examType?: string;
    status?: ExamStatus | "";
    search?: string;
  };
}) {
  const [exams, questionPage] = await Promise.all([
    adminListExams(searchParams),
    listQuestionsPage({}, { page: 1, pageSize: 100, summaryOnly: true })
  ]);
  const questions = questionPage.questions;
  const examsWithQuestions = await Promise.all(exams.map((exam) => getExamWithQuestionSummaries(exam.id, true)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Exams</h1>
        <p className="mt-1 text-sm text-slate-500">Create, publish, archive, classify, and order exam questions.</p>
      </div>

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 lg:grid-cols-7">
        <input name="search" defaultValue={searchParams.search || ""} placeholder="Search exams" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject group" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="course" defaultValue={searchParams.course || ""} placeholder="AP Course" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="year" defaultValue={searchParams.year || ""} placeholder="Year" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="section" defaultValue={searchParams.section || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All sections</option>
          <option value="MCQ">MCQ</option>
          <option value="FRQ">FRQ</option>
          <option value="MCQ_NON_CALCULATOR">MCQ Non-Calculator</option>
          <option value="MCQ_CALCULATOR">MCQ Calculator</option>
          <option value="FRQ_CALCULATOR">FRQ Calculator</option>
          <option value="FRQ_NON_CALCULATOR">FRQ Non-Calculator</option>
          <option value="Full Exam">Full Exam</option>
        </select>
        <select name="status" defaultValue={searchParams.status || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All status</option>
          <option value="draft">draft</option>
          <option value="reviewed">reviewed</option>
          <option value="published">published</option>
          <option value="archived">archived</option>
        </select>
        <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Filter</button>
        <select name="examType" defaultValue={searchParams.examType || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-3 lg:col-span-1">
          <option value="">All exam types</option>
          <option value="Practice Exam">Practice Exam</option>
          <option value="Released Exam">Released Exam</option>
          <option value="Unit Test">Unit Test</option>
          <option value="Custom Quiz">Custom Quiz</option>
        </select>
      </form>

      <form action={adminSaveExamAction} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_1fr_1fr_110px_140px_120px]">
        <input name="title" required placeholder="Exam title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="subject" required defaultValue="Physics" placeholder="Subject group" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="course" required defaultValue="AP Physics 1" placeholder="AP Course" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="year" type="number" min={1900} placeholder="Year" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="section" defaultValue="MCQ" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="MCQ">MCQ</option>
          <option value="FRQ">FRQ</option>
          <option value="Full Exam">Full Exam</option>
        </select>
        <select name="exam_type" defaultValue="Practice Exam" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="Practice Exam">Practice Exam</option>
          <option value="Released Exam">Released Exam</option>
          <option value="Unit Test">Unit Test</option>
          <option value="Custom Quiz">Custom Quiz</option>
        </select>
        <input name="time_limit_minutes" required type="number" min={1} defaultValue={45} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="status" defaultValue="draft" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="draft">draft</option>
          <option value="reviewed">reviewed</option>
          <option value="published">published</option>
          <option value="archived">archived</option>
        </select>
        <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Create</button>
        <textarea name="description" placeholder="Description" className="lg:col-span-6 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </form>

      <div className="space-y-5">
        {examsWithQuestions.filter(Boolean).map((exam) => (
          <section key={exam!.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-ink">{exam!.title}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase text-slate-500">{exam!.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {exam!.subject} · {exam!.course} · {exam!.year || "No year"} · {exam!.section} · {exam!.exam_type} · {exam!.time_limit_minutes} min · {exam!.exam_questions.length} questions
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{exam!.description}</p>
                {exam!.sections?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {exam!.sections.map((section) => {
                      const count = exam!.exam_questions.filter((row) => row.question.section === section.section).length;
                      return (
                        <span key={section.id} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                          {section.title}: {count} q · {section.timeLimitMinutes} min
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <form action={adminDeleteExamAction}>
                <input type="hidden" name="id" value={exam!.id} />
                <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-danger">
                  Delete
                </button>
              </form>
            </div>

            <details className="mt-5">
              <summary className="cursor-pointer font-medium text-brand">Edit exam metadata</summary>
              <form action={adminSaveExamAction} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_110px_140px_120px]">
                <input type="hidden" name="id" value={exam!.id} />
                <input name="title" required defaultValue={exam!.title} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input name="subject" required defaultValue={exam!.subject} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input name="course" required defaultValue={exam!.course} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <input name="year" type="number" min={1900} defaultValue={exam!.year || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <select name="section" defaultValue={exam!.section} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="MCQ">MCQ</option>
                  <option value="FRQ">FRQ</option>
                  <option value="Full Exam">Full Exam</option>
                </select>
                <select name="exam_type" defaultValue={exam!.exam_type} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="Practice Exam">Practice Exam</option>
                  <option value="Released Exam">Released Exam</option>
                  <option value="Unit Test">Unit Test</option>
                  <option value="Custom Quiz">Custom Quiz</option>
                </select>
                <input name="time_limit_minutes" required type="number" min={1} defaultValue={exam!.time_limit_minutes} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <select name="status" defaultValue={exam!.status} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="draft">draft</option>
                  <option value="reviewed">reviewed</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
                <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Save</button>
                <textarea name="description" defaultValue={exam!.description} className="lg:col-span-6 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </form>
            </details>

            <div className="mt-5 rounded-md border border-slate-200">
              {exam!.exam_questions.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">#{row.order_index} · {row.question.type.toUpperCase()} · {row.question.topic}</p>
                    <p className="line-clamp-2 text-sm text-slate-600">{row.question.question_text}</p>
                  </div>
                  <div className="flex gap-2">
                    {["up", "down"].map((direction) => (
                      <form key={direction} action={adminReorderExamQuestionAction}>
                        <input type="hidden" name="exam_question_id" value={row.id} />
                        <input type="hidden" name="direction" value={direction} />
                        <button className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600">{direction}</button>
                      </form>
                    ))}
                    <form action={adminRemoveExamQuestionAction}>
                      <input type="hidden" name="exam_question_id" value={row.id} />
                      <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-danger">Remove</button>
                    </form>
                  </div>
                </div>
              ))}
              {exam!.exam_questions.length === 0 ? <p className="p-4 text-sm text-slate-500">No questions added yet.</p> : null}
            </div>

            <form action={adminAddQuestionToExamAction} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="exam_id" value={exam!.id} />
              <select name="question_id" required className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Add a question...</option>
                {questions.map((question) => (
                  <option key={question.id} value={question.id}>{question.course} · {question.year || "No year"} · {question.section} · {question.topic} · {question.question_text.slice(0, 90)}</option>
                ))}
              </select>
              <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Add question</button>
            </form>
            <Link href={`/exam/${exam!.id}`} className="mt-4 inline-block text-sm font-medium text-brand">Student start page</Link>
          </section>
        ))}
      </div>
    </div>
  );
}
