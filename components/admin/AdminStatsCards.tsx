import { BookOpen, FileQuestion, GraduationCap, School } from "lucide-react";

export function AdminStatsCards({
  studentsCount,
  examsCount,
  questionsCount,
  reviewGuidesCount
}: {
  studentsCount: number;
  examsCount: number;
  questionsCount: number;
  reviewGuidesCount: number;
}) {
  const cards = [
    { label: "Students", value: studentsCount, icon: GraduationCap },
    { label: "Exams", value: examsCount, icon: School },
    { label: "Questions", value: questionsCount, icon: FileQuestion },
    { label: "Review Guides", value: reviewGuidesCount, icon: BookOpen }
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{card.label}</p>
              <Icon className="h-5 w-5 text-brand" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-ink">{card.value}</p>
          </div>
        );
      })}
    </div>
  );
}
