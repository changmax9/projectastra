import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { ReviewGuide } from "@/lib/types";

export function ReviewGuideCard({ guide, adminHref }: { guide: ReviewGuide; adminHref?: string }) {
  return (
    <Card className="glass-card group h-full overflow-hidden rounded-[1.75rem] transition duration-200 hover:-translate-y-0.5 hover:border-sky-200/90 hover:bg-white/86">
      <Link href={adminHref || `/review/${guide.slug}`} className="flex h-full flex-col">
        <CardContent className="flex-1 p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-sky-200/80 bg-white/70 text-astra-blue shadow-inner">
              <BookOpen className="size-5" />
            </span>
            <Badge variant="outline" className="rounded-full border-white/70 bg-white/70 text-astra-slate">
              <Clock className="mr-1 size-3.5" />
              {guide.estimated_reading_time_minutes} min
            </Badge>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full border-astra-gold/30 bg-amber-50/85 text-amber-900">{guide.subject}</Badge>
            <Badge variant="outline" className="rounded-full border-white/70 bg-white/70 text-astra-slate">{guide.unit}</Badge>
          </div>
          <h3 className="mt-4 text-xl font-black leading-tight text-astra-navy">{guide.title}</h3>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-astra-slate">{guide.description}</p>
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t border-white/55 bg-white/30 px-5 py-4 text-sm">
          <span className="inline-flex min-w-0 items-center gap-2 text-astra-slate">
            <Layers className="size-4 shrink-0" />
            <span className="truncate">{guide.topic}</span>
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-astra-blue">
            Open
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </span>
        </CardFooter>
      </Link>
    </Card>
  );
}
