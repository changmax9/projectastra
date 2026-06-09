import { BookOpen, FileQuestion, FileSearch, GraduationCap, School, ShieldCheck } from "lucide-react";

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
        const Icon = card.icon;
        return (
          <div key={card.label} className="edu-panel rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="edu-meta">{card.label}</p>
              <Icon className="h-5 w-5 text-blue-800" />
            </div>
            <p className="mt-3 font-mono text-3xl font-black text-slate-950">{card.value}</p>
          </div>
        );
      })}
    </div>
  );
}
