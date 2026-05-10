import Link from "next/link";
import type { Question } from "@/lib/types";

export function RelatedQuestions({ questions }: { questions: Question[] }) {
  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-500">
        No related practice questions have been linked yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div key={question.id} className="app-surface rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span>Question {index + 1}</span>
            <span>•</span>
            <span>{question.type.toUpperCase()}</span>
            <span>•</span>
            <span>{question.difficulty}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-ink">{question.question_text}</p>
          <Link href={`/review?topic=${encodeURIComponent(question.topic)}`} className="mt-3 inline-block text-sm font-semibold text-brand">
            Practice this topic
          </Link>
        </div>
      ))}
    </div>
  );
}
