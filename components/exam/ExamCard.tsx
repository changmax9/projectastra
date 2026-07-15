import Link from "next/link";
import { ArrowRight, Clock3, FileQuestion, Layers3 } from "lucide-react";
import styles from "./ExamCard.module.css";

export function ExamCard({
  title,
  course,
  year,
  description,
  questionCount,
  timeMinutes,
  sectionCount,
  href,
  inProgress = false
}: {
  title: string;
  course: string;
  year: number | null;
  description: string;
  questionCount: number;
  timeMinutes: number;
  sectionCount: number;
  href: string;
  inProgress?: boolean;
}) {
  return (
    <article className={styles.row}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{course}{year ? ` · ${year}` : ""}</p>
        <h4 className={styles.title}><Link href={href}>{title}</Link></h4>
        <p className={styles.description}>{description}</p>
        <div className={styles.meta}>
          <span><FileQuestion aria-hidden="true" /> {questionCount} questions</span>
          <span><Clock3 aria-hidden="true" /> {timeMinutes} minutes</span>
          <span><Layers3 aria-hidden="true" /> {sectionCount} section{sectionCount === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className={styles.actionColumn}>
        <span className={styles.status} data-progress={inProgress}>{inProgress ? "In Progress" : "Available"}</span>
        <Link className={styles.action} href={href}>
          {inProgress ? "Resume Testing" : "View Test"}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
