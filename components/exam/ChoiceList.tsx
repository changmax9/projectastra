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
  maxSelections = 2
}: {
  choices: QuestionChoice[];
  value: string | null;
  onChange: (choiceId: string) => void;
  multiSelect?: boolean;
  requiredSelections?: number;
  maxSelections?: number;
}) {
  const selected = new Set((value || "").split(",").map((item) => item.trim()).filter(Boolean));

  return (
    <div className="space-y-4">
      {multiSelect ? (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
          Select {requiredSelections === 2 ? "TWO" : requiredSelections} answers.
        </p>
      ) : null}
      {choices.map((choice) => {
        const isSelected = selected.has(choice.id);
        const showText = shouldShowChoiceText(choice);
        return (
          <button
            type="button"
            key={choice.id}
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
              "flex min-h-20 w-full items-start gap-5 rounded-lg border-2 px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-brand/40",
              isSelected
                ? "border-brand bg-blue-50 shadow-sm"
                : "border-slate-800 bg-white hover:bg-slate-50"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 text-lg font-bold",
                isSelected ? "border-brand bg-brand text-white" : "border-slate-500 text-slate-800"
              )}
            >
              {choice.id}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              {showText ? (
                <MathMarkdown content={choice.text} className="exam-prose block font-serif text-xl leading-8 text-ink" />
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
        );
      })}
    </div>
  );
});
