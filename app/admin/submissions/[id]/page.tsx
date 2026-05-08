import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/DataTable";
import { getSubmissionDetail } from "@/lib/data";
import { formatDuration, submissionPartLabel, submissionScoreLabel, submissionStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionDetailPage({ params }: { params: { id: string } }) {
  const detail = await getSubmissionDetail(params.id);
  if (!detail) notFound();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Submission detail</h1>
        <p className="mt-1 text-sm text-slate-500">
          {detail.student?.email} · {detail.exam?.title}
          {submissionPartLabel(detail) ? ` · ${submissionPartLabel(detail)}` : ""} · {submissionStatusLabel(detail.status)} · {submissionScoreLabel(detail)}
        </p>
      </div>
      <DataTable
        headers={["Question", "Type", "Student answer", "Correct", "Score", "Flagged", "Time"]}
        empty="No answers saved."
        rows={detail.answers.map((answer, index) => [
          <span key="q" className="line-clamp-3 max-w-xl">{index + 1}. {answer.question?.question_text}</span>,
          answer.question?.type.toUpperCase() || "",
          answer.question?.type === "mcq" ? answer.selected_choice || "No answer" : answer.answer_text || "No answer",
          answer.question?.type === "mcq" ? answer.question.correct_answer || "" : "Manual",
          `${answer.final_score}/${answer.question?.points || 0}`,
          answer.flagged ? "Yes" : "No",
          formatDuration(answer.time_spent_seconds || 0)
        ])}
      />
    </div>
  );
}
