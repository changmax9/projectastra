import { CircleDashed, CheckCircle2, XCircle } from "lucide-react";
import { MathMarkdown } from "@/components/MathMarkdown";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import type { Answer, Question } from "@/lib/types";

export function ResultQuestionReview({
  answer,
  question,
  index
}: {
  answer: Answer | null;
  question: Question;
  index: number;
}) {
  const explanation = /source\s+page\s+image|attached\s+source|Full\s+prompt.*answer\s+choices|pdf\s+page|page\s+screenshot/i.test(
    question.explanation || ""
  )
    ? "Explanation coming soon."
    : question.explanation?.trim() || "Explanation coming soon.";
  const isPending = question.type === "frq" && answer?.manual_score == null;
  const icon = isPending ? (
    <CircleDashed className="h-5 w-5 text-warning" />
  ) : answer?.is_correct ? (
    <CheckCircle2 className="h-5 w-5 text-success" />
  ) : (
    <XCircle className="h-5 w-5 text-danger" />
  );

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-ink">Question {index + 1}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase text-slate-500">
          {answer?.flagged ? "Marked for review · " : ""}{isPending ? "Pending grading" : `${answer?.final_score || 0}/${question.points} pts`}
        </span>
      </div>
      <QuestionRenderer question={question} />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-md bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Your answer</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
            {question.type === "mcq" ? answer?.selected_choice || "No answer" : answer?.answer_text || "No answer"}
          </p>
        </div>
        <div className="rounded-md bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase text-blue-700">Correct answer / rubric</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
            {question.type === "mcq" ? question.correct_answer : "FRQ requires manual grading"}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Explanation</p>
        <div className="exam-prose mt-2 text-sm leading-7 text-slate-700">
          <MathMarkdown content={explanation} />
        </div>
      </div>
    </article>
  );
}
