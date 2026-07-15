import Link from "next/link";
import { ArrowRight, BookOpenCheck, ClipboardList, FileCheck2, FileClock, FolderOpen, Shield } from "lucide-react";
import { BluebookAppHeader } from "@/components/bluebook/BluebookAppHeader";
import { requireProfile } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/data";
import {
  formatFriendlyDuration,
  isResumableSubmission,
  submissionCurrentSectionLabel,
  submissionScoreLabel,
  submissionStatusLabel
} from "@/lib/utils";
import styles from "./BluebookDashboard.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { tests?: string };
}) {
  const profile = await requireProfile();
  const data = await getStudentDashboard(profile.id);
  const active = data.submissions.filter((submission) => isResumableSubmission(submission.status));
  const past = data.submissions.filter((submission) => !isResumableSubmission(submission.status));
  const showingPast = searchParams.tests === "past";
  const visibleSubmissions = showingPast ? past : active;
  const displayName = profile.full_name?.trim().split(/\s+/)[0] || profile.email.split("@")[0];

  return (
    <>
      <BluebookAppHeader label="Student Home" />
      <div className={styles.page}>
        <main className={styles.main}>
          <header className={styles.welcome} data-ud-check="dashboard-introduction">
            <h1>Welcome, {displayName}</h1>
            <p>Your active tests and preparation materials are ready below.</p>
          </header>

          <section className={styles.section} data-ud-check="your-tests">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Your Tests</h2>
                <p>Resume a saved test or review work you have completed.</p>
              </div>
            </div>
            <nav className={styles.tabs} aria-label="Your test status">
              <Link className={styles.tab} href="/dashboard" aria-current={!showingPast ? "page" : undefined}>
                Active ({active.length})
              </Link>
              <Link className={styles.tab} href="/dashboard?tests=past" aria-current={showingPast ? "page" : undefined}>
                Past ({past.length})
              </Link>
            </nav>

            {visibleSubmissions.length > 0 ? (
              <div className={styles.list}>
                {visibleSubmissions.map((submission) => {
                  const resumable = isResumableSubmission(submission.status);
                  const currentSection = submissionCurrentSectionLabel(submission);
                  return (
                    <article className={styles.testRow} key={submission.id}>
                      <span className={styles.iconBox} aria-hidden="true">
                        {resumable ? <FileClock /> : <FileCheck2 />}
                      </span>
                      <div className={styles.rowCopy}>
                        <span className={styles.status} data-tone={resumable ? "active" : "complete"}>
                          {submissionStatusLabel(submission.status)}
                        </span>
                        <h3>{submission.exam?.title || "Practice Test"}</h3>
                        <p>
                          {resumable && currentSection ? `${currentSection} · ` : ""}
                          {formatFriendlyDuration(submission.time_spent_seconds)}
                          {!resumable ? ` · ${submissionScoreLabel(submission)}` : ""}
                        </p>
                      </div>
                      <Link
                        className={`${styles.rowAction} ${resumable ? styles.rowActionPrimary : ""}`}
                        href={resumable ? `/exam/${submission.exam_id}` : `/results/${submission.id}`}
                      >
                        {resumable ? "Resume Testing" : "Review Results"}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <ClipboardList aria-hidden="true" />
                <h3>{showingPast ? "You Have No Past Tests" : "You Have No Active Tests"}</h3>
                <p>
                  {showingPast
                    ? "Completed and submitted practice tests will appear here."
                    : "Choose a full-length practice test below when you are ready to begin."}
                </p>
              </div>
            )}
          </section>

          <section className={styles.section} data-ud-check="practice-and-prepare">
            <div className={styles.sectionHeader}>
              <div>
                <h2>Practice and Prepare</h2>
                <p>Use the testing application or review focused course material.</p>
              </div>
            </div>
            <div className={styles.list}>
              <article className={styles.practiceRow}>
                <span className={styles.iconBox} aria-hidden="true"><FolderOpen /></span>
                <div className={styles.rowCopy}>
                  <h3>Full-Length Practice</h3>
                  <p>{data.examDetails.length} published AP test{data.examDetails.length === 1 ? "" : "s"} with timed sections and saved progress.</p>
                </div>
                <Link className={`${styles.rowAction} ${styles.rowActionPrimary}`} href="/available-exams">
                  View Tests <ArrowRight aria-hidden="true" />
                </Link>
              </article>
              <article className={styles.practiceRow}>
                <span className={styles.iconBox} aria-hidden="true"><BookOpenCheck /></span>
                <div className={styles.rowCopy}>
                  <h3>Review Guides</h3>
                  <p>Prepare by topic before beginning a timed test.</p>
                </div>
                <Link className={styles.rowAction} href="/review">
                  Open Guides <ArrowRight aria-hidden="true" />
                </Link>
              </article>
            </div>
          </section>

          {data.guides.length > 0 ? (
            <section className={styles.section} data-ud-check="recommended-review">
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Recommended Review</h2>
                  <p>Recently published guides from the Astra library.</p>
                </div>
              </div>
              <div className={styles.list}>
                {data.guides.map((guide) => (
                  <article className={styles.guideRow} key={guide.id}>
                    <div className={styles.rowCopy}>
                      <h3>{guide.title}</h3>
                      <p>{guide.topic} · {guide.estimated_reading_time_minutes} min</p>
                    </div>
                    <Link className={styles.rowAction} href={`/review/${guide.slug}`}>Read Guide</Link>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {profile.role === "admin" ? (
            <aside className={styles.adminNote}>
              <p><Shield aria-hidden="true" /> Administrator tools are available outside the student testing flow.</p>
              <Link className={styles.rowAction} href="/admin">Open Admin</Link>
            </aside>
          ) : null}
        </main>
        <footer className={styles.footer} data-ud-check="student-app-footer">
          <span>Astra Exams · Independent AP practice</span>
          <Link href="/settings">Account and accessibility settings</Link>
        </footer>
      </div>
    </>
  );
}
