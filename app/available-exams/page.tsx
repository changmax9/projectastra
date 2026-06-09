import { AppHeader } from "@/components/layout/AppHeader";
import { AvailableExamsBrowser } from "@/components/exam/AvailableExamsBrowser";
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
      <main className="edu-page px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <AvailableExamsBrowser exams={data.examDetails} submissions={data.submissions} searchParams={searchParams} />
        </div>
      </main>
    </>
  );
}
