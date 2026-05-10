import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Layers } from "lucide-react";
import type { ReviewGuide } from "@/lib/types";

export function ReviewGuideCard({ guide, adminHref }: { guide: ReviewGuide; adminHref?: string }) {
  const isPsychology = guide.subject.toLowerCase().includes("psychology");

  return (
    <Link
      href={adminHref || `/review/${guide.slug}`}
      className="group block h-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-material"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-lg p-2 ${isPsychology ? "bg-accent-soft text-accent" : "bg-brand-soft text-brand"}`}>
          <BookOpen className="h-5 w-5" />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          {guide.estimated_reading_time_minutes} min
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
        <span className="app-chip px-2.5 py-1">{guide.subject}</span>
        <span className="app-chip px-2.5 py-1">{guide.unit}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink">{guide.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{guide.description}</p>
      <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Layers className="h-4 w-4 shrink-0" />
          <span className="truncate">{guide.topic}</span>
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-brand">
          Open
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
