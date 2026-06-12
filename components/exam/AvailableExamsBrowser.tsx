import { Search } from "lucide-react";
import { ExamCard } from "@/components/exam/ExamCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui-custom/StateBlock";
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
    <Card className="glass-panel rounded-[2rem]">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b border-white/55 bg-white/24 p-5">
        <div>
          <CardTitle className="text-2xl font-black text-astra-navy">Exam catalog</CardTitle>
          <CardDescription>Filter by subject, AP course, and exam metadata.</CardDescription>
        </div>
        <Badge variant="outline" className="border-astra-blue/20 bg-blue-50 text-astra-blue">
          {filtered.length} published
        </Badge>
      </CardHeader>
      <CardContent className="p-5">

      <form className="mb-6 grid gap-3 rounded-[1.5rem] border border-white/65 bg-white/54 p-4 shadow-inner backdrop-blur-xl md:grid-cols-3 lg:grid-cols-4">
        <label className="relative md:col-span-3 lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
          <Input name="search" defaultValue={searchParams.search || ""} placeholder="Search Calculus, 2023, Energy..." className="rounded-full border-white/70 bg-white/80 pl-9" />
        </label>
        <Input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject group" className="rounded-full border-white/70 bg-white/80" />
        <Input name="course" defaultValue={searchParams.course || ""} placeholder="AP Course" className="rounded-full border-white/70 bg-white/80" />
        <Input name="year" defaultValue={searchParams.year || ""} placeholder="Year" className="rounded-full border-white/70 bg-white/80" />
        <select name="section" defaultValue={searchParams.section || ""} className="edu-field rounded-full px-4 py-2.5 text-sm">
          <option value="">All sections</option>
          <option value="MCQ">MCQ</option>
          <option value="FRQ">FRQ</option>
          <option value="MCQ_NON_CALCULATOR">MCQ Non-Calculator</option>
          <option value="MCQ_CALCULATOR">MCQ Calculator</option>
          <option value="FRQ_CALCULATOR">FRQ Calculator</option>
          <option value="FRQ_NON_CALCULATOR">FRQ Non-Calculator</option>
          <option value="Full Exam">Full Exam</option>
        </select>
        <select name="examType" defaultValue={searchParams.examType || ""} className="edu-field rounded-full px-4 py-2.5 text-sm">
          <option value="">All exam types</option>
          <option value="Practice Exam">Practice Exam</option>
          <option value="Released Exam">Released Exam</option>
          <option value="Unit Test">Unit Test</option>
          <option value="Custom Quiz">Custom Quiz</option>
        </select>
        <Input name="topic" defaultValue={searchParams.topic || ""} placeholder="Topic" className="rounded-full border-white/70 bg-white/80" />
        <select name="difficulty" defaultValue={searchParams.difficulty || ""} className="edu-field rounded-full px-4 py-2.5 text-sm">
          <option value="">Any difficulty</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <Button className="rounded-full bg-astra-navy text-white hover:bg-astra-blue md:col-span-3 lg:col-span-1">Filter exams</Button>
      </form>

      <div className="flex flex-col gap-8">
        {subjectNames.map((subject) => (
          <div key={subject}>
            <div className="mb-4 flex items-center gap-3">
              <h3 className="font-mono text-sm font-black uppercase tracking-[0.18em] text-astra-blue">{subject}</h3>
              <div className="h-px flex-1 bg-astra-gold/30" />
            </div>
            <div className="flex flex-col gap-5">
              {Object.keys(grouped[subject]).sort().map((course) => (
                <section key={course} className="rounded-[2rem] border border-white/60 bg-white/38 p-4 shadow-inner backdrop-blur-xl">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-astra-slate">AP Course</p>
                      <h4 className="mt-1 text-2xl font-black tracking-tight text-astra-navy">{course}</h4>
                    </div>
                    <Badge variant="outline" className="border-astra-navy/10 bg-white text-astra-slate">
                      {grouped[subject][course].length} exam set{grouped[subject][course].length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {grouped[subject][course].map((exam) => {
                      const inProgress = inProgressForSection(submissions, exam.id, null);
                      const href = inProgress ? `/exam/${exam.id}/take?submission=${inProgress.id}` : `/exam/${exam.id}`;
                      return (
                        <ExamCard
                          key={exam.id}
                          title={exam.title}
                          course={exam.course}
                          year={exam.year}
                          description={exam.description}
                          questionCount={exam.exam_questions.length}
                          timeMinutes={exam.time_limit_minutes}
                          sectionCount={sectionCount(exam)}
                          href={href}
                          inProgress={Boolean(inProgress)}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ))}
        {subjectNames.length === 0 ? (
          <EmptyState title="No exams match these filters" description="Clear one or more filters to return to the full published exam catalog." />
        ) : null}
      </div>
      </CardContent>
    </Card>
  );
}
