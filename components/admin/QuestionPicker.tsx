import type { Question } from "@/lib/types";

export function QuestionPicker({
  questions,
  selectedIds
}: {
  questions: Question[];
  selectedIds: string[];
}) {
  return (
    <div className="max-h-72 space-y-2 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3">
      {questions.length === 0 ? (
        <p className="text-sm text-slate-500">No questions available.</p>
      ) : (
        questions.map((question) => (
          <label key={question.id} className="flex items-start gap-3 rounded-md bg-white p-3 text-sm">
            <input
              type="checkbox"
              name="question_ids"
              value={question.id}
              defaultChecked={selectedIds.includes(question.id)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-ink">
                {question.type.toUpperCase()} · {question.topic} · {question.points} pt
              </span>
              <span className="line-clamp-2 text-slate-600">{question.question_text}</span>
            </span>
          </label>
        ))
      )}
    </div>
  );
}
