import Link from "next/link";
import { Clock, FileQuestion } from "lucide-react";
import type { ExamWithQuestions, Submission } from "@/lib/types";
import { isResumableSubmission, normalizeText } from "@/lib/utils";

interface AvailableExamsSearchParams {
  subject?: string;
  course?: string;
  year?: string;
  section?: string;
  examType?: string;
  topic?: string;
  difficulty?: string;
  search?: string;
}

function examMatches(exam: ExamWithQuestions, filters: AvailableExamsSearchParams) {
  const topic = normalizeText(filters.topic);
  const difficulty = normalizeText(filters.difficulty);
  const search = normalizeText(filters.search);
  const questions = exam.exam_questions.map((row) => row.question);

  if (filters.subject && exam.subject !== filters.subject) return false;
  if (filters.course && exam.course !== filters.course) return false;
  if (filters.year && String(exam.year || "") !== String(filters.year)) return false;
  if (
    filters.section &&
    exam.section !== filters.section &&
    !exam.sections?.some((section) => section.section === filters.section) &&
    !questions.some((question) => question.section === filters.section)
  ) {
    return false;
  }
  if (filters.examType && exam.exam_type !== filters.examType) return false;
  if (topic && !questions.some((question) => normalizeText(question.topic).includes(topic))) return false;
  if (difficulty && !questions.some((question) => normalizeText(question.difficulty) === difficulty)) return false;
  if (search) {
    const haystack = normalizeText(
      [
        exam.title,
        exam.description,
        exam.subject,
        exam.course,
        String(exam.year || ""),
        exam.section,
        exam.exam_type,
        questions.map((question) => `${question.topic} ${question.unit} ${question.tags.join(" ")}`).join(" ")
      ].join(" ")
    );
    if (!haystack.includes(search)) return false;
  }
  return true;
}

function sectionCount(exam: ExamWithQuestions) {
  return exam.sections?.length || 1;
}

function inProgressForSection(submissions: Submission[], examId: string, section?: string | null) {
  return submissions.find(
    (submission) =>
      submission.exam_id === examId &&
      isResumableSubmission(submission.status) &&
      (section ? submission.section === section : !submission.section)
  );
}

export function AvailableExamsBrowser({
  exams,
  submissions,
  searchParams = {}
}: {
  exams: ExamWithQuestions[];
  submissions: Submission[];
  searchParams?: AvailableExamsSearchParams;
}) {
  const filtered = exams.filter((exam) => examMatches(exam, searchParams));
  const grouped = filtered.reduce<Record<string, Record<string, ExamWithQuestions[]>>>((groups, exam) => {
    groups[exam.subject] ||= {};
    groups[exam.subject][exam.course] ||= [];
    groups[exam.subject][exam.course].push(exam);
    return groups;
  }, {});
  const subjectNames = Object.keys(grouped).sort();

  return (
    <section className="edu-panel rounded-2xl">
      <div className="edu-panel-header rounded-t-2xl px-4 py-3">Exam catalog</div>
      <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="edu-heading text-2xl">Available exams</h2>
          <p className="mt-1 text-sm text-slate-500">Browse by subject, AP course, and exam set.</p>
        </div>
        <span className="edu-badge px-3 py-1">{filtered.length} published</span>
      </div>

      <form className="mb-5 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        <input name="search" defaultValue={searchParams.search || ""} placeholder="Search Calculus, 2023, Energy..." className="edu-field px-4 py-2.5 text-sm" />
        <input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject group" className="edu-field px-4 py-2.5 text-sm" />
        <input name="course" defaultValue={searchParams.course || ""} placeholder="AP Course" className="edu-field px-4 py-2.5 text-sm" />
        <input name="year" defaultValue={searchParams.year || ""} placeholder="Year" className="edu-field px-4 py-2.5 text-sm" />
        <select name="section" defaultValue={searchParams.section || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">All sections</option>
          <option value="MCQ">MCQ</option>
          <option value="FRQ">FRQ</option>
          <option value="MCQ_NON_CALCULATOR">MCQ Non-Calculator</option>
          <option value="MCQ_CALCULATOR">MCQ Calculator</option>
          <option value="FRQ_CALCULATOR">FRQ Calculator</option>
          <option value="FRQ_NON_CALCULATOR">FRQ Non-Calculator</option>
          <option value="Full Exam">Full Exam</option>
        </select>
        <select name="examType" defaultValue={searchParams.examType || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">All exam types</option>
          <option value="Practice Exam">Practice Exam</option>
          <option value="Released Exam">Released Exam</option>
          <option value="Unit Test">Unit Test</option>
          <option value="Custom Quiz">Custom Quiz</option>
        </select>
        <input name="topic" defaultValue={searchParams.topic || ""} placeholder="Topic" className="edu-field px-4 py-2.5 text-sm" />
        <select name="difficulty" defaultValue={searchParams.difficulty || ""} className="edu-field px-4 py-2.5 text-sm">
          <option value="">Any difficulty</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <button className="edu-button-primary px-5 py-2.5 text-sm font-medium md:col-span-3 lg:col-span-1">Filter</button>
      </form>

      <div className="space-y-6">
        {subjectNames.map((subject) => (
          <div key={subject}>
            <h3 className="edu-eyebrow">{subject}</h3>
            <div className="mt-3 space-y-4">
              {Object.keys(grouped[subject]).sort().map((course) => (
                <div key={course} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <h4 className="edu-heading text-xl">{course}</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {grouped[subject][course].map((exam) => {
                      const inProgress = inProgressForSection(submissions, exam.id, null);
                      const href = inProgress ? `/exam/${exam.id}/take?submission=${inProgress.id}` : `/exam/${exam.id}`;
                      return (
                        <div key={exam.id} className="edu-card rounded-xl p-5 transition hover:border-blue-300">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <Link href={href} className="edu-heading text-lg hover:text-blue-800">{exam.title}</Link>
                              <p className="mt-1 text-sm text-slate-500">
                                {exam.course} · {exam.year || "No year"} · {exam.section} · {exam.exam_type}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{exam.description}</p>
                          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <FileQuestion className="h-4 w-4" />
                              {exam.exam_questions.length} questions
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {exam.time_limit_minutes} min
                            </span>
                            <span>{sectionCount(exam)} section{sectionCount(exam) === 1 ? "" : "s"}</span>
                            <Link href={href} className="edu-button-primary ml-auto px-4 py-2 text-xs font-semibold">
                              {inProgress ? "Resume Exam" : "Start Exam"}
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {subjectNames.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
            No published exams match these filters.
          </p>
        ) : null}
      </div>
      </div>
    </section>
  );
}
