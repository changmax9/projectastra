import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BluebookAppHeader } from "@/components/bluebook/BluebookAppHeader";
import { AvailableExamsBrowser } from "@/components/exam/AvailableExamsBrowser";
import { requireProfile } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/data";
import styles from "./AvailableExamsPage.module.css";

export const dynamic = "force-dynamic";

export default async function AvailableExamsPage({
  searchParams
}: {
  searchParams: {
    subject?: string;
    course?: string;
    year?: string;
    section?: string;
    examType?: string;
    topic?: string;
    difficulty?: string;
    search?: string;
  };
}) {
  const profile = await requireProfile();
  const data = await getStudentDashboard(profile.id);

  return (
    <>
      <BluebookAppHeader label="Full-Length Practice" />
      <div className={styles.page}>
        <main className={styles.main}>
          <Link className={styles.back} href="/dashboard"><ChevronLeft aria-hidden="true" /> Student Home</Link>
          <AvailableExamsBrowser exams={data.examDetails} submissions={data.submissions} searchParams={searchParams} />
        </main>
      </div>
    </>
  );
}
