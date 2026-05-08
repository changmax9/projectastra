import Link from "next/link";
import { Clock } from "lucide-react";
import type { ReviewGuide } from "@/lib/types";

export function ReviewGuideCard({ guide, adminHref }: { guide: ReviewGuide; adminHref?: string }) {
  return (
    <Link
      href={adminHref || `/review/${guide.slug}`}
      className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-500">
        <span>{guide.subject}</span>
        <span>•</span>
        <span>{guide.unit}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink">{guide.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{guide.description}</p>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{guide.topic} · {guide.difficulty}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-4 w-4" />
          {guide.estimated_reading_time_minutes} min
        </span>
      </div>
    </Link>
  );
}
