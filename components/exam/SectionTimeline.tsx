import { Calculator, Clock, FileQuestion } from "lucide-react";
import type { ExamSection } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SectionTimeline({
  sections,
  currentSectionIndex,
  compact = false
}: {
  sections?: ExamSection[] | null;
  currentSectionIndex?: number;
  compact?: boolean;
}) {
  if (!sections?.length) return null;

  return (
    <div className={cn("grid gap-3", compact ? "" : "md:grid-cols-2")}>
      {sections.map((section, index) => {
        const active = currentSectionIndex === index;
        return (
          <div
            key={section.id}
            className={cn(
              "rounded-2xl border p-4",
              active ? "border-astra-blue bg-blue-50" : "border-astra-navy/10 bg-white"
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-black", active ? "bg-astra-blue text-white" : "bg-astra-paper text-astra-navy")}>
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-astra-navy">{section.title}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-astra-slate">
                  <span className="inline-flex items-center gap-1">
                    <FileQuestion className="size-3.5" />
                    {section.questionCount} questions
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {section.timeLimitMinutes} min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calculator className="size-3.5" />
                    {section.calculatorAllowed ? "Calculator" : "No calculator"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
