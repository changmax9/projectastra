import { Search } from "lucide-react";
import { ExamCard } from "@/components/exam/ExamCard";
import type { ExamWithQuestions, Submission } from "@/lib/types";
import { isResumableSubmission, normalizeText } from "@/lib/utils";
import styles from "./AvailableExamsBrowser.module.css";

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
  if (filters.section && exam.section !== filters.section && !exam.sections?.some((section) => section.section === filters.section) && !questions.some((question) => question.section === filters.section)) return false;
  if (filters.examType && exam.exam_type !== filters.examType) return false;
  if (topic && !questions.some((question) => normalizeText(question.topic).includes(topic))) return false;
  if (difficulty && !questions.some((question) => normalizeText(question.difficulty) === difficulty)) return false;
  if (search) {
    const haystack = normalizeText([
      exam.title,
      exam.description,
      exam.subject,
      exam.course,
      String(exam.year || ""),
      exam.section,
      exam.exam_type,
      questions.map((question) => `${question.topic} ${question.unit} ${question.tags.join(" ")}`).join(" ")
    ].join(" "));
    if (!haystack.includes(search)) return false;
  }
  return true;
}

function inProgressForExam(submissions: Submission[], examId: string) {
  return submissions.find((submission) => submission.exam_id === examId && isResumableSubmission(submission.status) && !submission.section);
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
    <section className={styles.catalog} data-ud-check="practice-test-catalog">
      <header className={styles.header}>
        <div>
          <h1>Choose a Full-Length Practice Test</h1>
          <p>Select a published AP test to review its sections and complete exam setup.</p>
        </div>
        <span className={styles.count}>{filtered.length} of {exams.length} tests</span>
      </header>

      <form className={styles.filters} data-ud-check="practice-test-filters">
        <label className={`${styles.field} ${styles.searchField}`}>
          Search tests
          <Search aria-hidden="true" />
          <input name="search" defaultValue={searchParams.search || ""} placeholder="Title, course, or topic" />
        </label>
        <label className={styles.field}>Subject<input name="subject" defaultValue={searchParams.subject || ""} placeholder="All subjects" /></label>
        <label className={styles.field}>AP course<input name="course" defaultValue={searchParams.course || ""} placeholder="All courses" /></label>
        <label className={styles.field}>Year<input name="year" defaultValue={searchParams.year || ""} inputMode="numeric" placeholder="Any year" /></label>
        <button className={styles.filterButton} type="submit">Apply</button>
      </form>

      <div className={styles.body}>
        {subjectNames.map((subject) => (
          <section className={styles.subject} key={subject}>
            <h2 className={styles.subjectTitle}>{subject}</h2>
            {Object.keys(grouped[subject]).sort().map((course) => (
              <section className={styles.course} key={course}>
                <div className={styles.courseHeader}>
                  <h3>{course}</h3>
                  <span>{grouped[subject][course].length} test{grouped[subject][course].length === 1 ? "" : "s"}</span>
                </div>
                <div className={styles.rows}>
                  {grouped[subject][course].map((exam) => {
                    const inProgress = inProgressForExam(submissions, exam.id);
                    return (
                      <ExamCard
                        key={exam.id}
                        title={exam.title}
                        course={exam.course}
                        year={exam.year}
                        description={exam.description}
                        questionCount={exam.exam_questions.length}
                        timeMinutes={exam.time_limit_minutes}
                        sectionCount={exam.sections?.length || 1}
                        href={`/exam/${exam.id}`}
                        inProgress={Boolean(inProgress)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        ))}
        {subjectNames.length === 0 ? (
          <div className={styles.empty} role="status">
            <h3>No Tests Match These Filters</h3>
            <p>Change or clear a filter to return to the published practice library.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
