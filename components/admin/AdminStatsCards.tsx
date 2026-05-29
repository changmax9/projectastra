import { BookOpen, FileQuestion, GraduationCap, School, ShieldCheck } from "lucide-react";

export function AdminStatsCards({
  studentsCount,
  adminsCount,
  examsCount,
  questionsCount,
  reviewGuidesCount
}: {
  studentsCount: number;
  adminsCount?: number;
  examsCount: number;
  questionsCount: number;
  reviewGuidesCount: number;
}) {
  const cards = [
    { label: "Students", value: studentsCount, icon: GraduationCap },
    { label: "Admins", value: adminsCount ?? 0, icon: ShieldCheck },
    { label: "Exams", value: examsCount, icon: School },
    { label: "Questions", value: questionsCount, icon: FileQuestion },
    { label: "Review Guides", value: reviewGuidesCount, icon: BookOpen }
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
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
