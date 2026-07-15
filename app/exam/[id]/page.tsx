import Link from "next/link";
import { notFound } from "next/navigation";
import { Calculator, Check, ChevronLeft, Clock3, FileText } from "lucide-react";
import { BluebookExamSetup } from "@/components/bluebook/BluebookExamSetup";
import { requireProfile } from "@/lib/auth";
import { getExamWithQuestionSummaries, listStudentSubmissions } from "@/lib/data";
import type { ExamWithQuestions } from "@/lib/types";
import { isResumableSubmission } from "@/lib/utils";
import styles from "./BluebookStartPage.module.css";

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
  const studentName = profile.full_name || profile.email.split("@")[0];

  return (
    <main className={styles.app}>
      <div className={styles.brandBar}>Astra Exams</div>
      <header className={styles.header} data-ud-check="practice-detail-header">
        <Link href="/dashboard"><ChevronLeft aria-hidden="true" /> Practice Tests</Link>
        <span>Full-Length Practice</span>
        <span>{studentName}</span>
      </header>
      <div className={styles.testStripe} />
      <section className={styles.content} data-ud-check="practice-detail-content">
        <div className={styles.intro}>
          <p>{exam.subject} · {exam.course}{exam.year ? ` · ${exam.year}` : ""}</p>
          <h1>{exam.title}</h1>
          <p>{exam.description}</p>
        </div>

        <div className={styles.testFacts}>
          <div><Clock3 aria-hidden="true" /><span><strong>{exam.time_limit_minutes} minutes</strong>Total testing time</span></div>
          <div><FileText aria-hidden="true" /><span><strong>{exam.exam_questions.length} questions</strong>Across all available sections</span></div>
          <div><Check aria-hidden="true" /><span><strong>Progress saved</strong>Resume this practice test later</span></div>
        </div>

        {hasSections ? (
          <section className={styles.sections} data-ud-check="test-section-list">
            <h2>Test Sections</h2>
            {sections.map((section, index) => {
              const count = actualSectionQuestionCount(exam, section.section);
              return (
                <div key={section.id} className={styles.sectionRow}>
                  <span className={styles.sectionNumber}>{index + 1}</span>
                  <div>
                    <h3>{section.title}</h3>
                    <p>{count} questions · {section.timeLimitMinutes} minutes</p>
                  </div>
                  <span className={styles.calculatorStatus}>
                    <Calculator aria-hidden="true" /> {section.calculatorAllowed ? "Calculator" : "No calculator"}
                  </span>
                </div>
              );
            })}
          </section>
        ) : null}

        <div className={styles.launchArea}>
          <p>The test continues through all sections. Once you move on from a section, you cannot return to it.</p>
          <BluebookExamSetup
            examId={exam.id}
            title={exam.title}
            timeMinutes={exam.time_limit_minutes}
            questionCount={exam.exam_questions.length}
            sectionCount={sections.length || 1}
            inProgress={Boolean(inProgress)}
          />
        </div>
      </section>
      <div className={styles.testStripe} />
      <footer>{studentName}</footer>
    </main>
  );
}
