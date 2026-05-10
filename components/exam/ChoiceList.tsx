import { memo } from "react";
import { Ban } from "lucide-react";
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
  eliminatedChoiceIds = [],
  onToggleEliminated,
  multiSelect = false,
  requiredSelections = 2,
  maxSelections = 2
}: {
  choices: QuestionChoice[];
  value: string | null;
  onChange: (choiceId: string) => void;
  eliminatedChoiceIds?: string[];
  onToggleEliminated?: (choiceId: string) => void;
  multiSelect?: boolean;
  requiredSelections?: number;
  maxSelections?: number;
}) {
  const selected = new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean));
  const eliminated = new Set(eliminatedChoiceIds);

  return (
    <div className="space-y-4">
      {multiSelect ? (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
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
              "flex min-h-20 w-full items-start gap-3 rounded-lg border-2 bg-white p-2 transition",
              isSelected
                ? "border-brand bg-blue-50 shadow-sm"
                : isEliminated
                  ? "border-slate-300 bg-slate-50 text-slate-500"
                  : "border-slate-800 bg-white hover:bg-slate-50"
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
              className="flex min-w-0 flex-1 items-start gap-5 px-3 py-2 text-left focus:outline-none"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 text-lg font-bold",
                  isSelected ? "border-brand bg-brand text-white" : "border-slate-500 text-slate-800"
                )}
              >
                {choice.id}
              </span>
              <div className={cn("min-w-0 flex-1 pt-1", isEliminated && !isSelected ? "opacity-55" : "")}>
                {showText ? (
                  <MathMarkdown
                    content={choice.text}
                    className={cn(
                      "exam-prose block font-serif text-xl leading-8 text-ink",
                      isEliminated && !isSelected ? "[&_p]:line-through [&_p]:decoration-2" : ""
                    )}
                  />
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
              <button
                type="button"
                title={isEliminated ? `Restore choice ${choice.id}` : `Eliminate choice ${choice.id}`}
                aria-label={isEliminated ? `Restore choice ${choice.id}` : `Eliminate choice ${choice.id}`}
                onClick={() => onToggleEliminated(choice.id)}
                className={cn(
                  "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-slate-500 transition hover:border-slate-400 hover:bg-white hover:text-slate-800",
                  isEliminated ? "border-slate-400 bg-white text-slate-800" : "border-slate-200 bg-slate-50"
                )}
              >
                <Ban className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
