import { memo } from "react";
import { MathMarkdown } from "@/components/MathMarkdown";
import { QuestionImageAsset } from "@/components/exam/QuestionImageAsset";
import type { QuestionChoice } from "@/lib/types";
import { cn } from "@/lib/utils";

function shouldShowChoiceText(choice: QuestionChoice) {
  const text = choice.text.trim();
  return text.length > 0 && !(choice.image_url && /^Option [A-D]$/i.test(text));
}

export const ChoiceList = memo(function ChoiceList({
  choices,
  value,
  onChange,
  multiSelect = false,
  requiredSelections = 2,
  maxSelections = 2,
  eliminatedChoiceIds = [],
  onToggleEliminated
}: {
  choices: QuestionChoice[];
  value: string | null;
  onChange: (choiceId: string) => void;
  multiSelect?: boolean;
  requiredSelections?: number;
  maxSelections?: number;
  eliminatedChoiceIds?: string[];
  onToggleEliminated?: (choiceId: string) => void;
}) {
  const selected = new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean));
  const eliminated = new Set(eliminatedChoiceIds);

  return (
    <div className="space-y-3">
      {multiSelect ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-blue-900">
          Select {requiredSelections === 2 ? "TWO" : requiredSelections} answers.
        </p>
      ) : null}
      {choices.map((choice) => {
        const isSelected = selected.has(choice.id);
        const isEliminated = eliminated.has(choice.id);
        const showText = shouldShowChoiceText(choice);
        return (
          <div
            key={choice.id}
            className={cn(
              "group rounded-xl border transition",
              isSelected
                ? "border-blue-800 bg-blue-50"
                : "border-slate-300 bg-white hover:border-blue-300 hover:bg-slate-50",
              isEliminated && !isSelected ? "opacity-55" : ""
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (!multiSelect) {
                  onChange(choice.id);
                  return;
                }
                const next = new Set(selected);
                if (next.has(choice.id)) next.delete(choice.id);
                else if (next.size < maxSelections) next.add(choice.id);
                const ordered = choices.map((item) => item.id).filter((id) => next.has(id));
                onChange(ordered.join(","));
              }}
              className={cn(
                "flex min-h-16 w-full items-start gap-4 rounded-xl px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-700/35",
                isEliminated ? "line-through decoration-slate-500 decoration-2" : ""
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 font-mono text-lg font-bold",
                  isSelected
                    ? "border-blue-800 bg-blue-900 text-white"
                    : isEliminated
                      ? "border-slate-300 bg-slate-100 text-slate-500"
                      : "border-slate-400 bg-white text-slate-800"
                )}
              >
                {choice.id}
              </span>
              <div className="min-w-0 flex-1 pt-1">
                {showText ? (
                  <MathMarkdown content={choice.text} className="exam-prose block font-serif text-xl leading-8 text-slate-950" />
                ) : null}
                {choice.image_url ? (
                  <QuestionImageAsset
                    className={cn(
                      "w-auto",
                      showText ? "mt-3" : "mt-0"
                    )}
                    src={choice.image_url}
                    alt={`Choice ${choice.id}`}
                  />
                ) : null}
              </div>
            </button>
            {onToggleEliminated ? (
              <div className="flex justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleEliminated(choice.id);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide transition",
                    isEliminated
                      ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-white"
                      : "border-slate-200 bg-white/80 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  )}
                  aria-pressed={isEliminated}
                  aria-label={isEliminated ? `Restore choice ${choice.id}` : `Eliminate choice ${choice.id}`}
                >
                  {isEliminated ? "Restore choice" : "Eliminate choice"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
