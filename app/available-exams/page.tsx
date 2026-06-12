import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicPageShell } from "@/components/layout/AcademicPageShell";
import { AvailableExamsBrowser } from "@/components/exam/AvailableExamsBrowser";
import { PageHeader } from "@/components/ui-custom/PageHeader";
import { requireProfile } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/data";

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
      <AppHeader />
      <AcademicPageShell className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Exam catalog"
          title="Available exams"
          description="Browse published AP practice exams by subject, course, section, and topic. Each exam starts as one attempt and advances through its internal sections."
        />
        <AvailableExamsBrowser exams={data.examDetails} submissions={data.submissions} searchParams={searchParams} />
      </AcademicPageShell>
    </>
  );
}
