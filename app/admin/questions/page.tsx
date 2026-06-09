import Link from "next/link";
import { adminCreateQuestionFromMinimalAction, adminDeleteQuestionAction } from "@/app/actions";
import { DataTable } from "@/components/admin/DataTable";
import { QuestionForm } from "@/components/admin/QuestionForm";
import { listQuestionsPage } from "@/lib/data";
import type { Difficulty, QuestionStatus, QuestionType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminQuestionsPage({
  searchParams
}: {
  searchParams: {
    examName?: string;
    subject?: string;
    course?: string;
    year?: string;
    section?: string;
    examType?: string;
    topic?: string;
    status?: QuestionStatus | "";
    difficulty?: Difficulty | "";
    type?: QuestionType | "";
    tag?: string;
    search?: string;
    page?: string;
  };
}) {
  const currentPage = Math.max(1, Number(searchParams.page || 1));
  const questionPage = await listQuestionsPage(searchParams, {
    page: currentPage,
    pageSize: 25,
    summaryOnly: true
  });
  const questions = questionPage.questions;
  const needsReviewCount = searchParams.tag === "needs-admin-review"
    ? questionPage.total
    : questions.filter((question) => question.tags.includes("needs-admin-review")).length;

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value && key !== "page") params.set(key, String(value));
    });
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return `/admin/questions${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="edu-kicker">Content operations</p>
        <h1 className="edu-heading mt-2 text-3xl">Question bank</h1>
        <p className="mt-1 text-sm text-slate-500">Manage structured questions, review imported assets, and publish only cleaned items.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/questions?course=AP%20Calculus%20AB&tag=needs-admin-review"
            className="rounded-full border border-amber-200 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-200"
          >
            Calculus AB needs review
          </Link>
          {searchParams.tag === "needs-admin-review" ? (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-amber-800">
              {needsReviewCount} visible needs-review questions
            </span>
          ) : null}
        </div>
      </div>

      <form className="edu-panel grid gap-3 rounded-2xl p-4 md:grid-cols-3 lg:grid-cols-8">
        <input name="search" defaultValue={searchParams.search || ""} placeholder="Search text" className="edu-field px-4 py-2.5 text-sm" />
        <input name="examName" defaultValue={searchParams.examName || ""} placeholder="Exam name" className="edu-field px-4 py-2.5 text-sm" />
        <input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject group" className="edu-field px-4 py-2.5 text-sm" />
        <input name="course" defaultValue={searchParams.course || ""} placeholder="AP Course" className="edu-field px-4 py-2.5 text-sm" />
        <input name="year" defaultValue={searchParams.year || ""} placeholder="Year" className="edu-field px-4 py-2.5 text-sm" />
        <select name="section" defaultValue={searchParams.section || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">All section</option>
          <option value="MCQ">MCQ</option>
          <option value="FRQ">FRQ</option>
          <option value="MCQ_NON_CALCULATOR">MCQ Non-Calculator</option>
          <option value="MCQ_CALCULATOR">MCQ Calculator</option>
          <option value="FRQ_CALCULATOR">FRQ Calculator</option>
          <option value="FRQ_NON_CALCULATOR">FRQ Non-Calculator</option>
          <option value="Full Exam">Full Exam</option>
        </select>
        <select name="examType" defaultValue={searchParams.examType || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">All exam type</option>
          <option value="Practice Exam">Practice Exam</option>
          <option value="Released Exam">Released Exam</option>
          <option value="Unit Test">Unit Test</option>
          <option value="Custom Quiz">Custom Quiz</option>
        </select>
        <input name="topic" defaultValue={searchParams.topic || ""} placeholder="Topic" className="edu-field px-4 py-2.5 text-sm" />
        <select name="tag" defaultValue={searchParams.tag || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">All tags</option>
          <option value="needs-admin-review">needs-admin-review</option>
          <option value="calculus-ab">calculus-ab</option>
          <option value="structured-pdf-import">structured-pdf-import</option>
        </select>
        <select name="status" defaultValue={searchParams.status || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">All status</option>
          <option value="draft">draft</option>
          <option value="reviewed">reviewed</option>
          <option value="published">published</option>
        </select>
        <select name="difficulty" defaultValue={searchParams.difficulty || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">All difficulty</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <button className="edu-button-primary px-5 py-2.5 text-sm font-medium md:col-span-3 lg:col-span-1">Filter</button>
      </form>

      <details className="edu-panel rounded-2xl p-5">
        <summary className="cursor-pointer font-semibold text-slate-950">Create full question</summary>
        <div className="mt-4">
          <QuestionForm />
        </div>
      </details>

      <form action={adminCreateQuestionFromMinimalAction} className="edu-panel grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_1fr_1fr_1fr_100px_120px]">
        <input name="subject" defaultValue="Physics" placeholder="Subject group" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="course" defaultValue="AP Physics 1" placeholder="AP Course" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="year" placeholder="Year" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="unit" placeholder="Unit" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="topic" placeholder="Topic" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="type" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="mcq">mcq</option>
          <option value="frq">frq</option>
        </select>
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Quick create</button>
        <input name="question_text" placeholder="Question text" className="md:col-span-6 rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </form>

      <DataTable
        headers={["#", "Question", "Exam", "Year", "Section", "Topic", "Difficulty", "Status", "Edit", "Delete"]}
        empty="No questions found."
        rows={questions.map((question) => [
          question.question_number || "—",
          <span key="q" className="block max-w-xl">
            {question.tags.includes("needs-admin-review") ? (
              <span className="mb-2 inline-flex rounded-full border border-amber-200 bg-amber-100 px-2 py-1 text-xs font-semibold uppercase text-amber-800">
                Needs Review
              </span>
            ) : null}
            <span className="line-clamp-3">{question.question_text}</span>
          </span>,
          <span key="m" className="text-sm text-slate-600">{question.exam_name}<br />{question.subject} · {question.course}</span>,
          question.year || "—",
          question.section,
          question.topic,
          question.difficulty,
          <span key="status" className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs uppercase text-slate-500">{question.status}</span>,
          <Link key="open" href={`/admin/questions/${question.id}`} className="font-medium text-brand">Edit</Link>,
          <form key="delete" action={adminDeleteQuestionAction}>
            <input type="hidden" name="id" value={question.id} />
            <button className="rounded-full border border-red-200 bg-rose-50 px-3 py-2 text-sm text-danger transition hover:bg-rose-100">Delete</button>
          </form>
        ])}
      />
      <div className="edu-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm text-slate-600">
        <span>
          Showing {questions.length} of {questionPage.total} questions · Page {questionPage.page} of {questionPage.pageCount}
        </span>
        <div className="flex gap-2">
          {questionPage.page > 1 ? (
            <Link href={pageHref(questionPage.page - 1)} className="edu-button-secondary px-4 py-2 font-medium">
              Previous
            </Link>
          ) : null}
          {questionPage.page < questionPage.pageCount ? (
            <Link href={pageHref(questionPage.page + 1)} className="edu-button-secondary px-4 py-2 font-medium">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
