import { BookOpen, FileQuestion, FileSearch, GraduationCap, School, ShieldCheck } from "lucide-react";
import { MetricCard } from "@/components/ui-custom/MetricCard";

export function AdminStatsCards({
  studentsCount,
  adminsCount,
  examsCount,
  questionsCount,
  reviewGuidesCount,
  pdfDraftsPendingCount
}: {
  studentsCount: number;
  adminsCount?: number;
  examsCount: number;
  questionsCount: number;
  reviewGuidesCount: number;
  pdfDraftsPendingCount: number;
}) {
  const cards = [
    { label: "Students", value: studentsCount, icon: GraduationCap },
    { label: "Admins", value: adminsCount ?? 0, icon: ShieldCheck },
    { label: "Exams", value: examsCount, icon: School },
    { label: "Questions", value: questionsCount, icon: FileQuestion },
    { label: "Review Guides", value: reviewGuidesCount, icon: BookOpen },
    { label: "PDF drafts", value: pdfDraftsPendingCount, icon: FileSearch }
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => {
        return (
          <MetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
        );
      })}
    </div>
  );
}
