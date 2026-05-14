import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuestionNavigator({
  count,
  currentIndex,
  answered,
  flagged,
  onSelect
}: {
  count: number;
  currentIndex: number;
  answered: Set<number>;
  flagged: Set<number>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2 rounded-[28px] border border-white/60 bg-white/70 p-3 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:grid-cols-8 lg:grid-cols-1">
      {Array.from({ length: count }, (_, index) => {
        const active = index === currentIndex;
        const isAnswered = answered.has(index);
        const isFlagged = flagged.has(index);
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              "relative flex h-10 items-center justify-center rounded-full border text-sm font-semibold transition",
              active
                ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/10"
                : isAnswered
                  ? "border-green-200 bg-green-50 text-success"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
            aria-label={`Go to question ${index + 1}`}
          >
            {index + 1}
            {isFlagged ? <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-amber-400 text-amber-500" /> : null}
          </button>
        );
      })}
    </div>
  );
}
